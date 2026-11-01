import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { addMember, admin, as, createMaterial, expectError, one, pool, setupOrg } from "./helpers";

// Acceptance tests 5 (quality), 6 (costing) and 7 (procurement) at the database layer.
describe("procurement, quality and costing", () => {
  let O: Awaited<ReturnType<typeof setupOrg>>;
  let fabric: { materialId: string; stockItemId: string };
  let supplier: string;
  let product: string;
  let order: string;
  let po: string;

  const onHand = async (si: string) =>
    Number((await admin<{ s: string }>("select coalesce(sum(on_hand),0) s from inventory_balances where stock_item_id=$1", [si]))[0].s);

  beforeAll(async () => {
    O = await setupOrg("PhaseTwo");
    fabric = await createMaterial(O.owner.id, O.org, "FAB-01", "Cotton fabric", await O.uom("m"), { standard_cost: 1500, reorder_level: 50 });
    supplier = (await one<{ id: string }>(O.owner.id, "insert into suppliers (organization_id, code, name, lead_time_days) values ($1,'SUP-1','Kano Textiles',7) returning id", [O.org])).id;
    product = (await one<{ id: string }>(O.owner.id,
      "insert into products (organization_id, code, name, uom_id, selling_price, standard_minutes_per_unit) values ($1,'TEE','T-shirt',$2,5000,30) returning id",
      [O.org, await O.uom("pcs")])).id;
    const bom = (await one<{ id: string }>(O.owner.id, "select public.bom_create_version($1) id", [product])).id;
    await as(O.owner.id, (q) => q("insert into bom_items (organization_id, bom_id, line_no, stock_item_id, quantity) values ($1,$2,1,$3,2)", [O.org, bom, fabric.stockItemId]));
    await one(O.owner.id, "select public.bom_transition($1,'approve')", [bom]);
  });
  afterAll(() => pool.end());

  it("7. shortage → requisition → approval → PO → partial receipt → remaining delivery", async () => {
    order = (await one<{ id: string }>(O.owner.id, "select public.production_order_create($1,$2) id", [O.org, { product_id: product, factory_id: O.factory, quantity: 50, submit: true }])).id;
    await one(O.owner.id, "select public.production_order_transition($1,'approved')", [order]);
    expect((await admin<{ status: string }>("select status from production_orders where id=$1", [order]))[0].status).toBe("materials_pending");

    const sugg = await as(O.owner.id, (q) => q<{ stock_item_id: string; production_shortage: string; suggested: string }>("select * from public.procurement_suggestions($1)", [O.org]));
    const s = sugg.find((x) => x.stock_item_id === fabric.stockItemId)!;
    expect(Number(s.production_shortage)).toBe(100);

    const sup = await addMember(O.owner.id, O.org, "supervisor", "Sam Supervisor");
    const req = (await one<{ id: string }>(sup.id, "select public.requisition_create($1,$2) id", [O.org, {
      source: "production_shortage", production_order_id: order, lines: [{ stock_item_id: fabric.stockItemId, quantity: 200 }] }])).id;
    // a supervisor can't approve their own request
    await expectError(one(sup.id, "select public.requisition_decide($1,'approve')", [req]), "missing permission");
    await one(O.owner.id, "select public.requisition_decide($1,'approve')", [req]);

    const items = await admin<{ id: string }>("select id from purchase_requisition_items where requisition_id=$1", [req]);
    po = (await one<{ id: string }>(O.owner.id, "select public.purchase_order_save($1,null,$2) id", [O.org, {
      supplier_id: supplier, warehouse_id: O.wh, requisition_id: req, shipping_cost: 5000,
      lines: [{ stock_item_id: fabric.stockItemId, quantity: 200, unit_price: 1400, discount_pct: 5, tax_pct: 7.5, requisition_item_id: items[0].id }] }])).id;
    const p = (await admin<{ subtotal: string; discount_total: string; tax_total: string; total: string }>("select * from purchase_orders where id=$1", [po]))[0];
    // 200 × 1400 = 280,000; −5% = 266,000; +7.5% VAT = 285,950; + 5,000 shipping = 290,950
    expect(Number(p.subtotal)).toBe(280000);
    expect(Number(p.discount_total)).toBe(14000);
    expect(Number(p.tax_total)).toBe(19950);
    expect(Number(p.total)).toBe(290950);
    expect((await admin<{ status: string }>("select status from purchase_requisitions where id=$1", [req]))[0].status).toBe("ordered");

    // can't receive before approval
    const line = (await admin<{ id: string }>("select id from purchase_order_items where purchase_order_id=$1", [po]))[0].id;
    await expectError(one(O.owner.id, "select public.goods_receipt_post($1,$2)", [po, { lines: [{ po_item_id: line, received: 10 }] }]), "approved or sent");
    await one(O.owner.id, "select public.purchase_order_transition($1,'submit')", [po]);
    await one(O.owner.id, "select public.purchase_order_transition($1,'approve')", [po]);
    await one(O.owner.id, "select public.purchase_order_transition($1,'send')", [po]);

    // partial delivery: 120 arrive, 10 damaged and rejected
    await expectError(
      one(O.owner.id, "select public.goods_receipt_post($1,$2)", [po, { lines: [{ po_item_id: line, received: 120, rejected: 10 }] }]),
      "reason",
    );
    await one(O.owner.id, "select public.goods_receipt_post($1,$2)", [po, { delivery_note: "DN-77", lines: [{ po_item_id: line, received: 120, rejected: 10, rejection_reason: "Water damaged" }] }]);
    expect(await onHand(fabric.stockItemId)).toBe(110);
    expect((await admin<{ status: string }>("select status from purchase_orders where id=$1", [po]))[0].status).toBe("partially_received");
    // stock valued at net price (1400 − 5% = 1330); VAT is not stock value
    expect(Number((await admin<{ average_cost: string }>("select average_cost from stock_items where id=$1", [fabric.stockItemId]))[0].average_cost)).toBe(1330);
    // over-receipt is refused: 90 still outstanding
    await expectError(one(O.owner.id, "select public.goods_receipt_post($1,$2)", [po, { lines: [{ po_item_id: line, received: 91 }] }]), "outstanding");
    await one(O.owner.id, "select public.goods_receipt_post($1,$2)", [po, { lines: [{ po_item_id: line, received: 90 }] }]);
    expect(await onHand(fabric.stockItemId)).toBe(200);
    expect((await admin<{ status: string }>("select status from purchase_orders where id=$1", [po]))[0].status).toBe("received");
    const grns = await as(O.owner.id, (q) => q<{ discrepancy: boolean }>("select discrepancy from goods_receipt_summary where purchase_order_id=$1 order by received_at", [po]));
    expect(grns.map((g) => g.discrepancy)).toEqual([true, false]);

    await one(O.owner.id, "select public.production_order_transition($1,'ready_to_start')", [order]);
    expect((await admin<{ status: string }>("select status from production_orders where id=$1", [order]))[0].status).toBe("ready_to_start");
  });

  it("6. costing: estimate vs actual with labour, machine and allocated overhead", async () => {
    await as(O.owner.id, async (q) => {
      await q("insert into cost_rates (organization_id, kind, name, basis, rate) values ($1,'labour','Standard labour','per_hour',1000)", [O.org]);
      await q("insert into cost_rates (organization_id, kind, name, basis, rate) values ($1,'overhead','Factory overhead','percent_material',10)", [O.org]);
    });
    const est = (await one<{ s: { estimate: { material: number; labour: number; overhead: number; total: number; unit_cost: number } } }>(O.owner.id, "select public.production_cost_summary($1) s", [order])).s.estimate;
    // material: 100 m × ₦1,500 standard = ₦150,000 (snapshot taken at creation); labour: 50 × 30 min = 25 h × ₦1,000 = ₦25,000; overhead 10% of material = ₦15,000
    expect(Number(est.material)).toBe(150000);
    expect(Number(est.labour)).toBe(25000);
    expect(Number(est.overhead)).toBe(15000);
    expect(Number(est.total)).toBe(190000);

    await one(O.owner.id, "select public.production_issue_materials($1)", [order]);
    await one(O.owner.id, "select public.production_order_transition($1,'in_progress')", [order]);
    await one(O.owner.id, "select public.cost_entry_add($1,$2)", [order, { entry_type: "labour", hours: 30, worker_name: "Sewing team" }]);
    await one(O.owner.id, "select public.cost_entry_add($1,$2)", [order, { entry_type: "overhead", category: "packaging", description: "Poly bags", amount: 2500 }]);
    const ops = await admin<{ id: string }>("select id from production_operations where production_order_id=$1 order by sequence", [order]);
    for (const op of ops) {
      await one(O.owner.id, "select public.production_operation_action($1,'progress',48,2)", [op.id]).catch(() =>
        one(O.owner.id, "select public.production_operation_action($1,'progress',48,0)", [op.id]),
      );
      await one(O.owner.id, "select public.production_operation_action($1,'complete')", [op.id]);
    }
  });

  it("5. quality: final inspection gates accepted output", async () => {
    const qc = await addMember(O.owner.id, O.org, "quality_controller", "Queen QC");
    await expectError(
      one(qc.id, "select public.quality_check_record($1,$2)", [O.org, { check_type: "production", production_order_id: order, is_final: true, quantity_inspected: 60, quantity_rejected: 0, result: "pass" }]),
      "come through production",
    );
    await one(qc.id, "select public.quality_check_record($1,$2)", [O.org, {
      check_type: "production", production_order_id: order, is_final: true, quantity_inspected: 48, quantity_rejected: 3, result: "fail",
      defects: [{ category: "Stitching", severity: "major", quantity: 3 }], actions: [{ description: "Retrain line 2 on seam allowance" }] }]);
    // 45 passed, so accepting 48 is refused
    await expectError(one(O.owner.id, "select public.production_order_complete($1,48,2)", [order]), "passed final inspection");
    // workers can't record inspections
    const w = await addMember(O.owner.id, O.org, "production_worker", "Wura Worker");
    await expectError(one(w.id, "select public.quality_check_record($1,$2)", [O.org, { check_type: "production", production_order_id: order, quantity_inspected: 1, result: "pass" }]), "missing permission");
    const defects = await as(O.owner.id, (q) => q("select * from public.defect_summary($1, current_date - 1, current_date)", [O.org]));
    expect(defects[0]).toMatchObject({ category: "Stitching" });
  });

  it("6b. completion values finished goods at full actual cost per accepted unit", async () => {
    await one(O.owner.id, "select public.production_order_complete($1,45,5)", [order]);
    const snap = (await admin<Record<string, string>>("select * from production_cost_snapshots where production_order_id=$1", [order]))[0];
    // material: 100 m issued at ₦1,330 = ₦133,000; labour 30 h × ₦1,000 = ₦30,000; overhead 10% × 133,000 = ₦13,300; packaging ₦2,500
    expect(Number(snap.material_cost)).toBe(133000);
    expect(Number(snap.labour_cost)).toBe(30000);
    expect(Number(snap.overhead_cost)).toBe(13300);
    expect(Number(snap.other_cost)).toBe(2500);
    expect(Number(snap.total_cost)).toBe(178800);
    expect(Number(snap.unit_cost)).toBeCloseTo(178800 / 45, 4); // per ACCEPTED unit, not per planned unit
    expect(Number(snap.estimated_total)).toBe(190000);
    const fg = await admin<{ average_cost: string }>("select s.average_cost from stock_items s join product_variants v on v.id=s.product_variant_id where v.product_id=$1", [product]);
    expect(Number(fg[0].average_cost)).toBeCloseTo(178800 / 45, 4);
    // costs are final once completed
    await expectError(one(O.owner.id, "select public.cost_entry_add($1,$2)", [order, { entry_type: "labour", hours: 1 }]), "not yet completed");
  });

  it("isolates phase-2 records between organisations", async () => {
    const B = await setupOrg("PhaseTwoRival");
    expect(await as(B.owner.id, (q) => q("select id from purchase_orders where id=$1", [po]))).toHaveLength(0);
    expect(await as(B.owner.id, (q) => q("select id from quality_checks where production_order_id=$1", [order]))).toHaveLength(0);
    expect(await as(B.owner.id, (q) => q("select id from production_cost_snapshots where production_order_id=$1", [order]))).toHaveLength(0);
    await expectError(one(B.owner.id, "select public.goods_receipt_post($1,$2)", [po, { lines: [] }]), "missing permission");
    await expectError(one(B.owner.id, "select public.production_cost_summary($1)", [order]), "missing permission");
  });
});
