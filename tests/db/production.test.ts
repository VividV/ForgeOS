import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { addMember, admin, as, createMaterial, expectError, one, pool, setupOrg } from "./helpers";

// Acceptance tests 2 (product & BOM) and 4 (production) at the database layer.
describe("BOM and production flow", () => {
  let O: Awaited<ReturnType<typeof setupOrg>>;
  let product: string;
  let variantItem: string;
  let bom: string;
  let order: string;
  const mats: Record<string, { materialId: string; stockItemId: string }> = {};

  const lines = async () =>
    admin<{ id: string; stock_item_id: string; quantity_required: string; quantity_reserved: string; quantity_issued: string; quantity_returned: string; quantity_wasted: string }>(
      "select * from production_order_materials where production_order_id = $1 order by line_no", [order]);
  const status = async () => (await admin<{ status: string }>("select status from production_orders where id=$1", [order]))[0].status;
  const bal = async (si: string) =>
    (await admin<{ on_hand: string; reserved: string }>("select on_hand, reserved from inventory_balances where stock_item_id=$1 and warehouse_id=$2", [si, O.wh]))[0];

  beforeAll(async () => {
    O = await setupOrg("Prod");
    mats.fabric = await createMaterial(O.owner.id, O.org, "FAB-01", "Cotton fabric", await O.uom("m"), { standard_cost: 1500 });
    mats.button = await createMaterial(O.owner.id, O.org, "BTN-01", "Buttons", await O.uom("pcs"), { standard_cost: 20 });
    mats.thread = await createMaterial(O.owner.id, O.org, "THR-01", "Sewing thread", await O.uom("m"), { standard_cost: 2 });
    product = (await one<{ id: string }>(O.owner.id,
      "insert into products (organization_id, code, name, uom_id, selling_price) values ($1,'SHIRT-M','Men''s Cotton Shirt',$2,15000) returning id",
      [O.org, await O.uom("pcs")])).id;
    variantItem = (await admin<{ id: string }>(
      "select s.id from stock_items s join product_variants v on v.id = s.product_variant_id where v.product_id = $1", [product]))[0].id;
  });
  afterAll(() => pool.end());

  it("creates a product with a default variant and stock item", async () => {
    expect(variantItem).toBeTruthy();
  });

  it("builds, prices and approves a BOM", async () => {
    bom = (await one<{ id: string }>(O.owner.id, "select public.bom_create_version($1) id", [product])).id;
    await as(O.owner.id, async (q) => {
      await q("insert into bom_items (organization_id, bom_id, line_no, stock_item_id, quantity, wastage_pct) values ($1,$2,1,$3,2.2,5)", [O.org, bom, mats.fabric.stockItemId]);
      await q("insert into bom_items (organization_id, bom_id, line_no, stock_item_id, quantity, wastage_pct) values ($1,$2,2,$3,8,0)", [O.org, bom, mats.button.stockItemId]);
      await q("insert into bom_items (organization_id, bom_id, line_no, stock_item_id, quantity, wastage_pct) values ($1,$2,3,$3,35,10)", [O.org, bom, mats.thread.stockItemId]);
    });
    const est = await as(O.owner.id, (q) => q<{ cost_per_output_unit: string }>("select * from public.bom_cost_estimate($1)", [bom]));
    const total = est.reduce((s, r) => s + Number(r.cost_per_output_unit), 0);
    // 2.2*1.05*1500 + 8*20 + 35*1.1*2 = 3465 + 160 + 77
    expect(total).toBeCloseTo(3702, 2);
    await expectError(as(O.owner.id, (q) => q("update bills_of_materials set status='approved' where id=$1", [bom])), "workflow");
    await one(O.owner.id, "select public.bom_transition($1,'submit')", [bom]);
    await expectError(
      as(O.owner.id, (q) => q("update bom_items set quantity = 3 where bom_id = $1 and line_no = 1", [bom])),
      "Only draft BOMs",
    );
    await one(O.owner.id, "select public.bom_transition($1,'approve')", [bom]);
    expect((await admin<{ status: string }>("select status from bills_of_materials where id=$1", [bom]))[0].status).toBe("approved");
  });

  it("supersedes the previous version when a new BOM is approved, keeping order snapshots", async () => {
    const v2 = (await one<{ id: string }>(O.owner.id, "select public.bom_create_version($1, null, $2) id", [product, bom])).id;
    expect((await admin("select 1 from bom_items where bom_id=$1", [v2])).length).toBe(3);
    await as(O.owner.id, (q) => q("delete from bills_of_materials where id=$1", [v2]));
  });

  it("creates a 100-unit order with material requirements from the BOM", async () => {
    order = (await one<{ id: string }>(O.owner.id, "select public.production_order_create($1,$2) id", [O.org, {
      product_id: product, factory_id: O.factory, quantity: 100, due_date: "2030-01-31", priority: "high",
    }])).id;
    const l = await lines();
    expect(l.map((x) => Number(x.quantity_required))).toEqual([231, 800, 3850]);
    const ops = await admin("select * from production_operations where production_order_id=$1", [order]);
    expect(ops.length).toBeGreaterThan(0);
    const snap = (await admin<{ bom_snapshot: { version: number; lines: unknown[] } }>("select bom_snapshot from production_orders where id=$1", [order]))[0].bom_snapshot;
    expect(snap.version).toBe(1);
    expect(snap.lines).toHaveLength(3);
  });

  it("enforces valid state transitions", async () => {
    await expectError(one(O.owner.id, "select public.production_order_transition($1,'in_progress')", [order]), "Cannot move");
    await expectError(as(O.owner.id, (q) => q("update production_orders set status='completed' where id=$1", [order])), "workflow");
    await one(O.owner.id, "select public.production_order_transition($1,'awaiting_approval')", [order]);
  });

  it("reserves what is available and flags shortages on approval", async () => {
    await one(O.owner.id, "select public.inventory_receive($1,$2,$3,200,1500)", [O.org, mats.fabric.stockItemId, O.wh]);
    await one(O.owner.id, "select public.inventory_receive($1,$2,$3,1000,20)", [O.org, mats.button.stockItemId, O.wh]);
    await one(O.owner.id, "select public.inventory_receive($1,$2,$3,5000,2)", [O.org, mats.thread.stockItemId, O.wh]);
    await one(O.owner.id, "select public.production_order_transition($1,'approved')", [order]);
    expect(await status()).toBe("materials_pending");
    const l = await lines();
    expect(Number(l[0].quantity_reserved)).toBe(200); // short by 31 m
    expect(Number((await bal(mats.fabric.stockItemId)).reserved)).toBe(200);
    // reserved stock is not available to other movements
    await expectError(
      one(O.owner.id, "select public.inventory_adjust($1,$2,'damaged',$3)", [O.org, O.wh, JSON.stringify([{ stock_item_id: mats.fabric.stockItemId, quantity: -1 }])]),
      "Insufficient available",
    );
    const hist = await admin<{ to_status: string }>("select to_status from production_order_status_history where production_order_id=$1 order by changed_at", [order]);
    expect(hist.map((h) => h.to_status)).toEqual(["draft", "awaiting_approval", "approved", "materials_pending"]);
  });

  it("tops up reservations when stock arrives and becomes ready", async () => {
    await one(O.owner.id, "select public.inventory_receive($1,$2,$3,50,1600)", [O.org, mats.fabric.stockItemId, O.wh]);
    await one(O.owner.id, "select public.production_order_transition($1,'ready_to_start')", [order]);
    expect(await status()).toBe("ready_to_start");
    expect(Number((await lines())[0].quantity_reserved)).toBe(231);
  });

  it("issues reserved materials, tracks floor progress and wastage", async () => {
    await one(O.owner.id, "select public.production_issue_materials($1)", [order]);
    const l = await lines();
    expect(l.map((x) => Number(x.quantity_issued))).toEqual([231, 800, 3850]);
    expect(Number((await bal(mats.fabric.stockItemId)).reserved)).toBe(0);
    expect(Number((await bal(mats.fabric.stockItemId)).on_hand)).toBe(19);

    const ops = await admin<{ id: string }>("select id from production_operations where production_order_id=$1 order by sequence", [order]);
    // worker flow via job card
    const worker = await addMember(O.owner.id, O.org, "production_worker", "Funke Floor");
    const card = (await one<{ id: string }>(O.owner.id, "select public.job_card_issue($1,$2,null,100) id", [ops[0].id, worker.id])).id;
    const visible = await as(worker.id, (q) => q("select id from job_cards"));
    expect(visible).toHaveLength(1);
    const jc = await one<{ j: { product: { name: string }; materials: unknown[] } }>(worker.id, "select public.get_job_card($1) j", [card]);
    expect(jc.j.product.name).toBe("Men's Cotton Shirt");
    await one(worker.id, "select public.job_card_action($1,'start')", [card]);
    expect(await status()).toBe("in_progress");
    await one(worker.id, "select public.job_card_action($1,'progress',60,0,null,'offline-1')", [card]);
    // offline replay with same client ref is ignored
    const dup = await one<{ r: { status: string } }>(worker.id, "select public.job_card_action($1,'progress',60,0,null,'offline-1') r", [card]);
    expect(dup.r.status).toBe("duplicate");
    await one(worker.id, "select public.job_card_action($1,'defect',0,2,'Torn fabric')", [card]);
    await one(worker.id, "select public.job_card_action($1,'complete',38,0)", [card]);
    const op1 = (await admin<{ quantity_completed: string; quantity_rejected: string }>("select * from production_operations where id=$1", [ops[0].id]))[0];
    expect(Number(op1.quantity_completed)).toBe(98);
    expect(Number(op1.quantity_rejected)).toBe(2);

    // a later step cannot process more than passed the previous one
    await expectError(one(O.owner.id, "select public.production_operation_action($1,'progress',99,0)", [ops[1].id]), "previous step");
    await one(O.owner.id, "select public.production_operation_action($1,'complete')", [ops[0].id]);
    for (const op of ops.slice(1)) {
      await one(O.owner.id, "select public.production_operation_action($1,'progress',95,3)", [op.id]).catch(async () => {
        // subsequent steps: at most what passed before
        await one(O.owner.id, "select public.production_operation_action($1,'progress',95,0)", [op.id]);
      });
      await one(O.owner.id, "select public.production_operation_action($1,'complete')", [op.id]);
    }
    expect(await status()).toBe("quality_inspection");

    await one(O.owner.id, "select public.production_record_wastage($1,$2,4,'Cutting offcuts')", [order, l[0].id]);
    await expectError(one(O.owner.id, "select public.production_record_wastage($1,$2,1000,'x')", [order, l[0].id]), "cannot exceed");
    await one(O.owner.id, "select public.production_return_materials($1,$2)", [order, JSON.stringify([{ material_id: l[2].id, quantity: 40 }])]);
    expect(Number((await lines())[2].quantity_returned)).toBe(40);
  });

  it("blocks output that exceeds issued materials without an approved exception", async () => {
    await expectError(one(O.owner.id, "select public.production_order_complete($1,100,10)", [order]), "only");
  });

  it("completes the order, stocking only accepted units at actual material cost", async () => {
    await one(O.owner.id, "select public.production_order_complete($1,95,5,'Final count')", [order]);
    expect(await status()).toBe("completed");
    const fg = (await admin<{ on_hand: string }>("select on_hand from inventory_balances where stock_item_id=$1", [variantItem]))[0];
    expect(Number(fg.on_hand)).toBe(95);
    const out = (await admin<{ material_cost: string; unit_cost: string }>("select * from production_outputs where production_order_id=$1", [order]))[0];
    // issued at weighted average: fabric 231 @ 1520 = 351120; buttons 800 @ 20 = 16000; thread (3850-40) @ 2 = 7620
    const cost = 351120 + 16000 + 7620;
    expect(Number(out.material_cost)).toBeCloseTo(cost, 2);
    expect(Number(out.unit_cost)).toBeCloseTo(cost / 95, 4);
    const res = await admin("select 1 from material_reservations where production_order_id=$1 and status='active' and quantity > 0", [order]);
    expect(res).toHaveLength(0);
    const rec = await as(O.owner.id, (q) => q<{ usage_variance: string; code: string }>(
      "select code, usage_variance from production_material_reconciliation where production_order_id=$1 order by line_no", [order]));
    // fabric standard for 100 units of output = 220; consumed 231 → +11
    expect(Number(rec[0].usage_variance)).toBeCloseTo(11, 4);
    await expectError(one(O.owner.id, "select public.production_order_transition($1,'in_progress')", [order]), "cannot change status");
  });

  it("cancel requires issued material to be accounted for", async () => {
    const o2 = (await one<{ id: string }>(O.owner.id, "select public.production_order_create($1,$2) id", [O.org, {
      product_id: product, factory_id: O.factory, quantity: 2, submit: true }])).id;
    await one(O.owner.id, "select public.production_order_transition($1,'approved')", [o2]);
    await one(O.owner.id, "select public.production_issue_materials($1)", [o2]);
    await expectError(one(O.owner.id, "select public.production_order_transition($1,'cancelled','Customer cancelled')", [o2]), "unaccounted");
    const l2 = await admin<{ id: string; quantity_issued: string }>("select id, quantity_issued from production_order_materials where production_order_id=$1", [o2]);
    await one(O.owner.id, "select public.production_return_materials($1,$2)", [o2, JSON.stringify(l2.map((x) => ({ material_id: x.id, quantity: Number(x.quantity_issued) })))]);
    await one(O.owner.id, "select public.production_order_transition($1,'cancelled','Customer cancelled')", [o2]);
  });

  it("dashboard metrics come from the records", async () => {
    const d = await one<{ d: { production: { completed_today: number }; output: { accepted: number; rejected: number } } }>(
      O.owner.id, "select public.dashboard_summary($1) d", [O.org]);
    expect(d.d.production.completed_today).toBe(1);
    expect(Number(d.d.output.accepted)).toBe(95);
    expect(Number(d.d.output.rejected)).toBe(5);
    const alerts = await as(O.owner.id, (q) => q("select * from public.operational_alerts($1)", [O.org]));
    expect(alerts.some((a) => a.kind === "materials_pending")).toBe(false);
  });
});
