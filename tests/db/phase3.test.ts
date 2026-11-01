import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { addMember, admin, as, createMaterial, expectError, one, pool, setupOrg } from "./helpers";

// Customer orders (allocation, production for shortfall, dispatch, delivery, payments) and workforce.
describe("customer orders and workforce", () => {
  let O: Awaited<ReturnType<typeof setupOrg>>;
  let product: string;
  let fg: string; // finished-goods stock item
  let fabric: { materialId: string; stockItemId: string };
  let customer: string;
  let so: string;
  let so2: string;
  let line: string;
  let prod: string;

  const bal = async (si: string) =>
    (await admin<{ on_hand: string; reserved: string; available: string }>(
      "select coalesce(sum(on_hand),0) on_hand, coalesce(sum(reserved),0) reserved, coalesce(sum(available),0) available from inventory_balances where stock_item_id=$1", [si]))[0];
  const soRow = async (id: string) => (await admin<Record<string, string>>("select * from sales_orders where id=$1", [id]))[0];

  beforeAll(async () => {
    O = await setupOrg("PhaseThree");
    fabric = await createMaterial(O.owner.id, O.org, "FAB-01", "Cotton fabric", await O.uom("m"), { standard_cost: 1000 });
    product = (await one<{ id: string }>(O.owner.id,
      "insert into products (organization_id, code, name, uom_id, selling_price) values ($1,'DRS','Adire dress',$2,25000) returning id",
      [O.org, await O.uom("pcs")])).id;
    fg = (await admin<{ id: string }>("select s.id from stock_items s join product_variants v on v.id=s.product_variant_id where v.product_id=$1", [product]))[0].id;
    const bom = (await one<{ id: string }>(O.owner.id, "select public.bom_create_version($1) id", [product])).id;
    await as(O.owner.id, (q) => q("insert into bom_items (organization_id, bom_id, line_no, stock_item_id, quantity) values ($1,$2,1,$3,3)", [O.org, bom, fabric.stockItemId]));
    await one(O.owner.id, "select public.bom_transition($1,'approve')", [bom]);
    await one(O.owner.id, "select public.inventory_receive($1,$2,$3,500,1000,'goods_receipt',null,null,null)", [O.org, fabric.stockItemId, O.wh]);
    await one(O.owner.id, "select public.inventory_receive($1,$2,$3,30,12000,'opening_balance',null,null,null)", [O.org, fg, O.wh]);
    customer = (await one<{ id: string }>(O.owner.id,
      "insert into customers (organization_id, code, name, payment_terms, shipping_address) values ($1,'CUS-1','Eko Boutique','50% deposit','12 Admiralty Way, Lekki') returning id", [O.org])).id;
  });
  afterAll(() => pool.end());

  it("confirms an order, allocates stock and shows the shortfall", async () => {
    so = await (await one<{ id: string }>(O.owner.id, "select public.sales_order_save($1,null,$2) id", [O.org, {
      customer_id: customer, warehouse_id: O.wh, shipping_charge: 2000, requested_date: "2099-12-31",
      lines: [{ stock_item_id: fg, quantity: 50, unit_price: 5000, tax_pct: 7.5 }] }])).id;
    const r = await soRow(so);
    // 50 × 5,000 = 250,000 + 7.5% = 268,750 + 2,000 delivery
    expect(Number(r.total)).toBe(270750);
    expect(r.shipping_address).toBe("12 Admiralty Way, Lekki"); // from the customer
    expect(r.number).toMatch(/^SO-/);
    // materials can't be sold
    await expectError(one(O.owner.id, "select public.sales_order_save($1,null,$2)", [O.org, { customer_id: customer, warehouse_id: O.wh, lines: [{ stock_item_id: fabric.stockItemId, quantity: 1, unit_price: 1 }] }]), "choose a product");

    await one(O.owner.id, "select public.sales_order_transition($1,'confirm')", [so]);
    expect((await soRow(so)).status).toBe("confirmed");
    expect(await bal(fg)).toMatchObject({ on_hand: "30.0000", reserved: "30.0000", available: "0.0000" });
    const lines = await as(O.owner.id, (q) => q<{ id: string; allocated: string; shortfall: string }>("select * from public.sales_order_lines($1)", [so]));
    line = lines[0].id;
    expect(Number(lines[0].allocated)).toBe(30);
    expect(Number(lines[0].shortfall)).toBe(20);
    // confirmed orders are locked
    await expectError(one(O.owner.id, "select public.sales_order_save($1,$2,$3)", [O.org, so, { customer_id: customer, warehouse_id: O.wh, lines: [{ stock_item_id: fg, quantity: 1, unit_price: 1 }] }]), "Only draft");

    // a second order can't take stock already held for the first
    so2 = (await one<{ id: string }>(O.owner.id, "select public.sales_order_save($1,null,$2) id", [O.org, { customer_id: customer, warehouse_id: O.wh, lines: [{ stock_item_id: fg, quantity: 10, unit_price: 5000 }] }])).id;
    await one(O.owner.id, "select public.sales_order_transition($1,'confirm')", [so2]);
    expect(Number((await admin<{ quantity_allocated: string }>("select quantity_allocated from sales_order_items where sales_order_id=$1", [so2]))[0].quantity_allocated)).toBe(0);
    const alerts = await as(O.owner.id, (q) => q<{ kind: string; entity_id: string }>("select kind, entity_id from public.operational_alerts($1)", [O.org]));
    expect(alerts.some((a) => a.kind === "so_needs_production" && a.entity_id === so)).toBe(true);
  });

  it("plans production for the shortfall, dispatches what's in stock and blocks over-dispatch", async () => {
    prod = (await one<{ id: string }>(O.owner.id, "select public.sales_order_make($1,$2) id", [line, { factory_id: O.factory }])).id;
    const p = (await admin<{ quantity_planned: string; source: string; source_reference: string; sales_order_item_id: string; status: string }>("select * from production_orders where id=$1", [prod]))[0];
    expect(Number(p.quantity_planned)).toBe(20);
    expect(p).toMatchObject({ source: "customer_order", sales_order_item_id: line, status: "awaiting_approval" });
    expect(p.source_reference).toBe((await soRow(so)).number);
    let lines = await as(O.owner.id, (q) => q<{ in_production: string; shortfall: string; dispatched: string }>("select * from public.sales_order_lines($1)", [so]));
    expect(Number(lines[0].in_production)).toBe(20);
    expect(Number(lines[0].shortfall)).toBe(0);
    // the link can't be forged by a client
    await expectError(as(O.owner.id, (q) => q("update production_orders set sales_order_item_id = null where id=$1", [prod])), "set by the workflow");

    // a sales coordinator can't dispatch; the store can
    const sales = await addMember(O.owner.id, O.org, "sales_coordinator", "Sade Sales");
    await expectError(one(sales.id, "select public.dispatch_post($1,$2)", [so, { lines: [{ so_item_id: line, quantity: 1 }] }]), "missing permission");
    const d1 = (await one<{ id: string }>(O.owner.id, "select public.dispatch_post($1,$2,'idem-d1') id", [so, { carrier: "GIG Logistics", lines: [{ so_item_id: line, quantity: 30 }] }])).id;
    // idempotent replay returns the same dispatch and doesn't move stock twice
    expect((await one<{ id: string }>(O.owner.id, "select public.dispatch_post($1,$2,'idem-d1') id", [so, { lines: [{ so_item_id: line, quantity: 30 }] }])).id).toBe(d1);
    expect(await bal(fg)).toMatchObject({ on_hand: "0.0000", reserved: "0.0000" });
    expect((await soRow(so)).status).toBe("partially_dispatched");
    const txn = (await admin<{ txn_type: string; quantity: string; unit_cost: string }>("select txn_type, quantity, unit_cost from inventory_transactions where reference_id=$1", [d1]))[0];
    expect(txn).toMatchObject({ txn_type: "sales_dispatch", quantity: "-30.0000" });
    expect(Number(txn.unit_cost)).toBe(12000); // valued at average cost
    await expectError(one(O.owner.id, "select public.dispatch_post($1,$2)", [so, { lines: [{ so_item_id: line, quantity: 21 }] }]), "only 20 left");
    // dispatch movements can't be reversed in the ledger
    const t = (await admin<{ id: string }>("select id from inventory_transactions where reference_id=$1", [d1]))[0].id;
    await expectError(one(O.owner.id, "select public.inventory_reverse($1,'oops')", [t]), "corrected from the customer order");
    // the dispatch itself is permanent
    await expectError(admin("update dispatches set carrier='x' where id=$1", [d1]), "permanent");
    lines = await as(O.owner.id, (q) => q<{ in_production: string; shortfall: string; dispatched: string }>("select * from public.sales_order_lines($1)", [so]));
    expect(Number(lines[0].dispatched)).toBe(30);
  });

  it("allocates finished goods to the order automatically when its production completes", async () => {
    await one(O.owner.id, "select public.production_order_transition($1,'approved')", [prod]);
    await one(O.owner.id, "select public.production_issue_materials($1)", [prod]);
    await one(O.owner.id, "select public.production_order_transition($1,'in_progress')", [prod]);
    for (const op of await admin<{ id: string }>("select id from production_operations where production_order_id=$1 order by sequence", [prod])) {
      await one(O.owner.id, "select public.production_operation_action($1,'progress',20,0)", [op.id]);
      await one(O.owner.id, "select public.production_operation_action($1,'complete')", [op.id]);
    }
    await one(O.owner.id, "select public.production_order_complete($1,20,0)", [prod]);
    // the 20 new units go to this order, not to SO #2 which was waiting too
    expect(await bal(fg)).toMatchObject({ on_hand: "20.0000", reserved: "20.0000" });
    expect(Number((await admin<{ quantity_allocated: string }>("select quantity_allocated from sales_order_items where id=$1", [line]))[0].quantity_allocated)).toBe(20);
    const d2 = (await one<{ id: string }>(O.owner.id, "select public.dispatch_post($1,$2) id", [so, { lines: [{ so_item_id: line, quantity: 20 }] }])).id;
    expect((await soRow(so)).status).toBe("dispatched");
    await expectError(one(O.owner.id, "select public.dispatch_confirm_delivery($1,'')", [d2]), "who received");
    const d1 = (await admin<{ id: string }>("select id from dispatches where sales_order_id=$1 and id<>$2", [so, d2]))[0].id;
    await one(O.owner.id, "select public.dispatch_confirm_delivery($1,'Mrs Eko')", [d2]);
    expect((await soRow(so)).status).toBe("dispatched"); // the first dispatch isn't confirmed yet
    await one(O.owner.id, "select public.dispatch_confirm_delivery($1,'Mrs Eko')", [d1]);
    expect((await soRow(so)).status).toBe("delivered");
  });

  it("records payments up to the balance due and voids with a reason", async () => {
    await one(O.owner.id, "select public.payment_record($1,$2)", [so, { amount: 135375, method: "bank_transfer", reference: "TRF-1" }]);
    await expectError(one(O.owner.id, "select public.payment_record($1,$2)", [so, { amount: 135376 }]), "exceeds the balance");
    const pid = (await one<{ id: string }>(O.owner.id, "select public.payment_record($1,$2) id", [so, { amount: 135375, method: "cash" }])).id;
    expect(Number((await soRow(so)).amount_paid)).toBe(270750);
    await expectError(one(O.owner.id, "select public.payment_void($1,'')", [pid]), "reason");
    await one(O.owner.id, "select public.payment_void($1,'Duplicate entry')", [pid]);
    expect(Number((await soRow(so)).amount_paid)).toBe(135375);
    const b = await as(O.owner.id, (q) => q<{ balance_due: string }>("select balance_due from customer_balances where customer_id=$1", [customer]));
    // order 1 owes 135,375; order 2 (10 × 5,000) owes 50,000
    expect(Number(b[0].balance_due)).toBe(185375);
  });

  it("cancelling releases allocations; dispatched orders can only be closed", async () => {
    await one(O.owner.id, "select public.inventory_receive($1,$2,$3,5,12000,'goods_receipt',null,null,null)", [O.org, fg, O.wh]);
    await one(O.owner.id, "select public.sales_order_allocate($1)", [so2]);
    expect(Number((await bal(fg)).reserved)).toBe(5);
    await expectError(one(O.owner.id, "select public.sales_order_transition($1,'cancel')", [so2]), "reason");
    await one(O.owner.id, "select public.sales_order_transition($1,'cancel','Customer changed their mind')", [so2]);
    expect(Number((await bal(fg)).reserved)).toBe(0);
    await expectError(one(O.owner.id, "select public.sales_order_transition($1,'cancel','x')", [so]), "closed, not cancelled");
  });

  it("workforce: employees without logins, private pay, attendance hours and labour cost from the employee rate", async () => {
    const dept = (await one<{ id: string }>(O.owner.id, "insert into departments (organization_id, name) values ($1,'Sewing') returning id", [O.org])).id;
    const shift = (await one<{ id: string }>(O.owner.id, "insert into shifts (organization_id, name, start_time, end_time, break_minutes) values ($1,'Day','08:00','17:00',60) returning id", [O.org])).id;
    const emp = (await one<{ id: string }>(O.owner.id,
      "insert into employees (organization_id, code, full_name, department_id, default_shift_id, skills) values ($1,'EMP-001','Bisi Adewale',$2,$3,'{sewing,pattern cutting}') returning id",
      [O.org, dept, shift])).id;
    await as(O.owner.id, (q) => q("insert into employee_pay (employee_id, organization_id, hourly_rate) values ($1,$2,800)", [emp, O.org]));

    // a supervisor takes attendance and sees employees but not pay
    const sup = await addMember(O.owner.id, O.org, "supervisor", "Seyi Supervisor");
    expect(await as(sup.id, (q) => q("select id from employees where id=$1", [emp]))).toHaveLength(1);
    expect(await as(sup.id, (q) => q("select * from employee_pay where employee_id=$1", [emp]))).toHaveLength(0);
    await expectError(as(sup.id, (q) => q("insert into employees (organization_id, code, full_name) values ($1,'EMP-9','X Y')", [O.org])), "row-level security");
    const yday = (await admin<{ d: string }>("select (current_date - 1)::text d"))[0].d;
    await one(sup.id, "select public.attendance_record($1,$2)", [O.org, { work_date: yday, entries: [{ employee_id: emp, status: "present", clock_in: "08:00", clock_out: "19:00" }] }]);
    let a = (await admin<{ hours_worked: string; overtime_hours: string }>("select * from attendance_records where employee_id=$1", [emp]))[0];
    expect(Number(a.hours_worked)).toBe(10); // 11 h − 1 h break
    expect(Number(a.overtime_hours)).toBe(2); // shift is 8 h
    // re-recording the same day updates rather than duplicates
    await one(sup.id, "select public.attendance_record($1,$2)", [O.org, { work_date: yday, entries: [{ employee_id: emp, status: "half_day" }] }]);
    a = (await admin<{ hours_worked: string; overtime_hours: string }>("select * from attendance_records where employee_id=$1", [emp]))[0];
    expect(Number(a.hours_worked)).toBe(4);
    await expectError(one(sup.id, "select public.attendance_record($1,$2)", [O.org, { work_date: "2099-01-01", entries: [{ employee_id: emp, status: "present" }] }]), "future");
    const sum = await as(O.owner.id, (q) => q<{ half_days: string; hours: string }>("select * from public.attendance_summary($1, current_date - 7, current_date)", [O.org]));
    expect(sum.find((s) => Number(s.half_days) === 1)).toBeTruthy();

    // labour cost uses the employee's own rate before the default
    await as(O.owner.id, (q) => q("insert into cost_rates (organization_id, kind, name, basis, rate) values ($1,'labour','Standard','per_hour',500)", [O.org]));
    const p2 = (await one<{ id: string }>(O.owner.id, "select public.production_order_create($1,$2) id", [O.org, { product_id: product, factory_id: O.factory, quantity: 5, submit: true }])).id;
    await one(O.owner.id, "select public.production_order_transition($1,'approved')", [p2]);
    await one(O.owner.id, "select public.cost_entry_add($1,$2)", [p2, { entry_type: "labour", hours: 5, employee_id: emp }]);
    const e = (await admin<{ rate: string; amount: string; worker_name: string; employee_id: string }>("select * from labour_cost_entries where production_order_id=$1", [p2]))[0];
    expect(e).toMatchObject({ worker_name: "Bisi Adewale", employee_id: emp });
    expect(Number(e.amount)).toBe(4000);
  });

  it("isolates customer orders and staff between organisations", async () => {
    const B = await setupOrg("PhaseThreeRival");
    expect(await as(B.owner.id, (q) => q("select id from customers where id=$1", [customer]))).toHaveLength(0);
    expect(await as(B.owner.id, (q) => q("select id from sales_orders where id=$1", [so]))).toHaveLength(0);
    expect(await as(B.owner.id, (q) => q("select id from employees where organization_id=$1", [O.org]))).toHaveLength(0);
    expect(await as(B.owner.id, (q) => q("select * from public.sales_order_lines($1)", [so]))).toHaveLength(0);
    await expectError(one(B.owner.id, "select public.dispatch_post($1,$2)", [so, { lines: [] }]), "missing permission");
    await expectError(one(B.owner.id, "select public.payment_record($1,$2)", [so, { amount: 1 }]), "missing permission");
    await expectError(one(B.owner.id, "select public.attendance_record($1,$2)", [O.org, { work_date: "2026-01-01", entries: [] }]), "missing permission");
  });
});
