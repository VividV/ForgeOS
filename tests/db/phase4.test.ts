import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { addMember, admin, as, createMaterial, expectError, one, pool, setupOrg } from "./helpers";

// Stock counts, customer returns and credit notes, tax invoices, employee job cards, attachments.
describe("operations completion", () => {
  let O: Awaited<ReturnType<typeof setupOrg>>;
  let fabric: { materialId: string; stockItemId: string };
  let product: string;
  let fg: string;
  let so: string;
  let line: string;

  const onHand = async (si: string) => Number((await admin<{ s: string }>("select coalesce(sum(on_hand),0) s from inventory_balances where stock_item_id=$1", [si]))[0].s);
  const soRow = async (id: string) => (await admin<Record<string, string>>("select * from sales_orders where id=$1", [id]))[0];

  beforeAll(async () => {
    O = await setupOrg("PhaseFour");
    fabric = await createMaterial(O.owner.id, O.org, "FAB-01", "Cotton fabric", await O.uom("m"), { standard_cost: 1000 });
    product = (await one<{ id: string }>(O.owner.id, "insert into products (organization_id, code, name, uom_id, selling_price) values ($1,'TOP','Wrap top',$2,10000) returning id", [O.org, await O.uom("pcs")])).id;
    fg = (await admin<{ id: string }>("select s.id from stock_items s join product_variants v on v.id=s.product_variant_id where v.product_id=$1", [product]))[0].id;
    await one(O.owner.id, "select public.inventory_receive($1,$2,$3,100,1000,'goods_receipt',null,null,null)", [O.org, fabric.stockItemId, O.wh]);
    await one(O.owner.id, "select public.inventory_receive($1,$2,$3,20,4000,'opening_balance',null,null,null)", [O.org, fg, O.wh]);
  });
  afterAll(() => pool.end());

  it("stock count: blind sheet for counters, approval posts the differences", async () => {
    const store = await addMember(O.owner.id, O.org, "inventory_manager", "Ife Inventory");
    const sup = await addMember(O.owner.id, O.org, "supervisor", "Seun Supervisor");
    await expectError(one(sup.id, "select public.stock_count_start($1,$2)", [O.org, { warehouse_id: O.wh }]), "missing permission");
    const c = (await one<{ id: string }>(store.id, "select public.stock_count_start($1,$2) id", [O.org, { warehouse_id: O.wh, blind: true }])).id;
    await expectError(one(store.id, "select public.stock_count_start($1,$2)", [O.org, { warehouse_id: O.wh }]), "already open");
    // the inventory manager can approve, so sees expected; a counter without approve rights wouldn't
    let sheet = await as(store.id, (q) => q<{ line_id: string; stock_item_id: string; expected: string | null }>("select * from public.stock_count_sheet($1)", [c]));
    expect(sheet).toHaveLength(2);
    expect(await as(store.id, (q) => q("select * from stock_count_lines where stock_count_id=$1", [c])).catch((e) => e.message)).toMatch(/permission denied/);
    const counter = await addMember(O.owner.id, O.org, "inventory_manager", "Chidi Counter");
    await admin("delete from role_permissions where permission_key='inventory.approve' and role_id=(select id from roles where organization_id=$1 and key='inventory_manager')", [O.org]);
    sheet = await as(counter.id, (q) => q("select * from public.stock_count_sheet($1)", [c]));
    expect(sheet.every((l) => l.expected === null)).toBe(true); // blind
    const fab = sheet.find((l) => l.stock_item_id === fabric.stockItemId)!;
    const top = sheet.find((l) => l.stock_item_id === fg)!;
    await one(counter.id, "select public.stock_count_record($1,$2)", [c, JSON.stringify([{ line_id: fab.line_id, counted: 96, note: "4 m offcuts thrown away" }, { line_id: top.line_id, counted: 21 }])]);
    await one(counter.id, "select public.stock_count_transition($1,'submit')", [c]);
    await expectError(one(counter.id, "select public.stock_count_transition($1,'approve')", [c]), "missing permission");
    await one(O.owner.id, "select public.stock_count_transition($1,'approve','ok')", [c]);
    expect(await onHand(fabric.stockItemId)).toBe(96);
    expect(await onHand(fg)).toBe(21);
    const t = await admin<{ txn_type: string; quantity: string }>("select txn_type, quantity from inventory_transactions where reference_id=$1 order by quantity", [c]);
    expect(t.map((x) => [x.txn_type, Number(x.quantity)])).toEqual([["stock_count_correction", -4], ["stock_count_correction", 1]]);
  });

  it("returns: restocked goods come back at dispatch cost, damaged don't; credit notes reduce the balance", async () => {
    const cust = (await one<{ id: string }>(O.owner.id, "insert into customers (organization_id, code, name) values ($1,'C1','Ada Stores') returning id", [O.org])).id;
    so = (await one<{ id: string }>(O.owner.id, "select public.sales_order_save($1,null,$2) id", [O.org, { customer_id: cust, warehouse_id: O.wh, lines: [{ stock_item_id: fg, quantity: 10, unit_price: 10000, tax_pct: 10 }] }])).id;
    await one(O.owner.id, "select public.sales_order_transition($1,'confirm')", [so]);
    line = (await admin<{ id: string }>("select id from sales_order_items where sales_order_id=$1", [so]))[0].id;
    await expectError(one(O.owner.id, "select public.sales_return_post($1,$2)", [so, { reason: "x", lines: [{ so_item_id: line, quantity: 1 }] }]), "Only dispatched");
    await one(O.owner.id, "select public.dispatch_post($1,$2)", [so, { lines: [{ so_item_id: line, quantity: 10 }] }]);
    expect(await onHand(fg)).toBe(11);
    await expectError(one(O.owner.id, "select public.sales_return_post($1,$2)", [so, { reason: "Wrong size", lines: [{ so_item_id: line, quantity: 11 }] }]), "only 10 dispatched");
    await one(O.owner.id, "select public.sales_return_post($1,$2)", [so, { reason: "Wrong size", credit: true, lines: [{ so_item_id: line, quantity: 2, condition: "restock" }] }]);
    await one(O.owner.id, "select public.sales_return_post($1,$2)", [so, { reason: "Torn seam", lines: [{ so_item_id: line, quantity: 1, condition: "damaged" }] }]);
    expect(await onHand(fg)).toBe(13); // 2 restocked, the damaged one isn't
    const r = (await admin<{ txn_type: string; unit_cost: string }>("select txn_type, unit_cost from inventory_transactions where txn_type='sales_return' and stock_item_id=$1", [fg]))[0];
    expect(Number(r.unit_cost)).toBeCloseTo(Number((await admin<{ c: string }>("select unit_cost c from dispatch_items where sales_order_item_id=$1", [line]))[0].c), 4);
    // 2 × 10,000 + 10% = 22,000 credited automatically
    let row = await soRow(so);
    expect(Number(row.total)).toBe(110000);
    expect(Number(row.amount_credited)).toBe(22000);
    await expectError(one(O.owner.id, "select public.payment_record($1,$2)", [so, { amount: 88001 }]), "exceeds the balance");
    await one(O.owner.id, "select public.payment_record($1,$2)", [so, { amount: 77000 }]);
    const cn = (await one<{ id: string }>(O.owner.id, "select public.credit_note_issue($1,11000,'Goodwill for the torn seam') id", [so])).id;
    row = await soRow(so);
    expect(Number(row.total) - Number(row.amount_paid) - Number(row.amount_credited)).toBe(0);
    await one(O.owner.id, "select public.credit_note_void($1,'Issued by mistake')", [cn]);
    expect(Number((await soRow(so)).amount_credited)).toBe(22000);
    const bal = (await as(O.owner.id, (q) => q<{ balance_due: string; credited: string }>("select * from customer_balances where customer_id=$1", [cust])))[0];
    expect(Number(bal.balance_due)).toBe(11000);
  });

  it("tax invoices: sequential numbers, only what's dispatched and not returned, never twice; void frees the lines", async () => {
    const inv = (await one<{ id: string }>(O.owner.id, "select public.invoice_issue($1,$2) id", [so, { basis: "dispatched" }])).id;
    const i = (await admin<{ number: string; total: string; subtotal: string; tax_total: string }>("select * from invoices where id=$1", [inv]))[0];
    expect(i.number).toBe("INV-00001");
    // 10 dispatched − 3 returned = 7 × 10,000 + 10%
    expect(Number(i.total)).toBe(77000);
    await expectError(one(O.owner.id, "select public.invoice_issue($1,$2)", [so, { basis: "dispatched" }]), "already been invoiced");
    await expectError(admin("update invoices set total = 1 where id=$1", [inv]), "permanent records");
    await one(O.owner.id, "select public.invoice_void($1,'Wrong address')", [inv]);
    const inv2 = (await one<{ id: string }>(O.owner.id, "select public.invoice_issue($1,$2) id", [so, {}])).id;
    expect((await admin<{ number: string }>("select number from invoices where id=$1", [inv2]))[0].number).toBe("INV-00002");
  });

  it("job cards can go to an employee without a login", async () => {
    const bom = (await one<{ id: string }>(O.owner.id, "select public.bom_create_version($1) id", [product])).id;
    await as(O.owner.id, (q) => q("insert into bom_items (organization_id, bom_id, line_no, stock_item_id, quantity) values ($1,$2,1,$3,1)", [O.org, bom, fabric.stockItemId]));
    await one(O.owner.id, "select public.bom_transition($1,'approve')", [bom]);
    const po = (await one<{ id: string }>(O.owner.id, "select public.production_order_create($1,$2) id", [O.org, { product_id: product, factory_id: O.factory, quantity: 5, submit: true }])).id;
    await one(O.owner.id, "select public.production_order_transition($1,'approved')", [po]);
    const op = (await admin<{ id: string }>("select id from production_operations where production_order_id=$1 order by sequence limit 1", [po]))[0].id;
    const emp = (await one<{ id: string }>(O.owner.id, "insert into employees (organization_id, code, full_name) values ($1,'E1','Kunle Cutter') returning id", [O.org])).id;
    const jc = (await one<{ id: string }>(O.owner.id, "select public.job_card_issue($1,null,null,5,null,$2) id", [op, emp])).id;
    const card = (await one<{ c: { assignee_name: string; employee_id: string } }>(O.owner.id, "select public.get_job_card($1) c", [jc])).c;
    expect(card).toMatchObject({ assignee_name: "Kunle Cutter", employee_id: emp });
  });

  it("attachments: visible only to people who can see the record, and only accepted file types", async () => {
    const qc = await addMember(O.owner.id, O.org, "quality_controller", "Queen QC");
    const check = (await admin<{ id: string }>("select gen_random_uuid() id"))[0].id;
    await as(qc.id, (q) => q("insert into attachments (organization_id, entity_type, entity_id, file_name, content_type, size_bytes, data, uploaded_by) values ($1,'quality_check',$2,'defect.jpg','image/jpeg',3,'\\x010203',$3)", [O.org, check, qc.id]));
    await expectError(as(qc.id, (q) => q("insert into attachments (organization_id, entity_type, entity_id, file_name, content_type, size_bytes, data, uploaded_by) values ($1,'quality_check',$2,'x.svg','image/svg+xml',3,'\\x01',$3)", [O.org, check, qc.id])), "check constraint");
    const w = await addMember(O.owner.id, O.org, "production_worker", "Wale Worker");
    expect(await as(w.id, (q) => q("select id from attachment_list where entity_id=$1", [check]))).toHaveLength(0);
    await expectError(as(w.id, (q) => q("insert into attachments (organization_id, entity_type, entity_id, file_name, content_type, size_bytes, data, uploaded_by) values ($1,'organization',$1,'logo.png','image/png',1,'\\x01',$2)", [O.org, w.id])), "row-level security");
    const B = await setupOrg("PhaseFourRival");
    expect(await as(B.owner.id, (q) => q("select id from attachment_list where entity_id=$1", [check]))).toHaveLength(0);
    expect(await as(B.owner.id, (q) => q("select id from invoices where sales_order_id=$1", [so]))).toHaveLength(0);
    await expectError(one(B.owner.id, "select public.invoice_issue($1,$2)", [so, {}]), "missing permission");
  });
});
