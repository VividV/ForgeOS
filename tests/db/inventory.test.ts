import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { admin, as, createMaterial, expectError, one, pool, setupOrg } from "./helpers";

// Acceptance test 3 (inventory) at the database layer.
describe("inventory engine", () => {
  let O: Awaited<ReturnType<typeof setupOrg>>;
  let item: string;
  let wh2: string;

  const level = async (wh: string) =>
    (await admin<{ on_hand: string; reserved: string; available: string }>(
      "select on_hand, reserved, available from inventory_balances where stock_item_id=$1 and warehouse_id=$2",
      [item, wh],
    ))[0];
  const avg = async () => Number((await admin<{ average_cost: string }>("select average_cost from stock_items where id=$1", [item]))[0].average_cost);

  beforeAll(async () => {
    O = await setupOrg("Inv");
    item = (await createMaterial(O.owner.id, O.org, "BTN-01", "Buttons", await O.uom("pcs"), { reorder_level: 50 })).stockItemId;
    wh2 = (await one<{ id: string }>(O.owner.id, "insert into warehouses (organization_id, code, name) values ($1,'WH2','Second store') returning id", [O.org])).id;
  });
  afterAll(() => pool.end());

  it("receives stock and maintains weighted average cost", async () => {
    await one(O.owner.id, "select public.inventory_receive($1,$2,$3,100,50,'opening_balance')", [O.org, item, O.wh]);
    await one(O.owner.id, "select public.inventory_receive($1,$2,$3,100,70,'goods_receipt','GRN-1')", [O.org, item, O.wh]);
    expect(Number((await level(O.wh)).on_hand)).toBe(200);
    expect(await avg()).toBe(60);
    const types = await admin<{ txn_type: string }>("select txn_type from inventory_transactions where stock_item_id=$1 order by created_at", [item]);
    expect(types.map((t) => t.txn_type)).toEqual(["opening_balance", "goods_receipt"]);
  });

  it("is idempotent for repeated submissions", async () => {
    await one(O.owner.id, "select public.inventory_receive($1,$2,$3,10,60,'goods_receipt',null,null,'idem-1')", [O.org, item, O.wh]);
    await one(O.owner.id, "select public.inventory_receive($1,$2,$3,10,60,'goods_receipt',null,null,'idem-1')", [O.org, item, O.wh]);
    expect(Number((await level(O.wh)).on_hand)).toBe(210);
  });

  it("transfers between warehouses at average cost", async () => {
    await one(O.owner.id, "select public.inventory_transfer($1,$2,$3,$4,30)", [O.org, item, O.wh, wh2]);
    expect(Number((await level(O.wh)).on_hand)).toBe(180);
    expect(Number((await level(wh2)).on_hand)).toBe(30);
    expect(await avg()).toBe(60);
  });

  it("prevents negative stock by default", async () => {
    await expectError(one(O.owner.id, "select public.inventory_transfer($1,$2,$3,$4,31)", [O.org, item, wh2, O.wh]), "Insufficient available stock");
    await expectError(
      one(O.owner.id, "select public.inventory_adjust($1,$2,'damaged',$3)", [O.org, wh2, JSON.stringify([{ stock_item_id: item, quantity: -40 }])]),
      "Insufficient available stock",
    );
  });

  it("posts adjustments with reasons, and audits them", async () => {
    const adj = await one<{ id: string }>(O.owner.id, "select public.inventory_adjust($1,$2,'damaged',$3,'Water damage') id", [
      O.org, wh2, JSON.stringify([{ stock_item_id: item, quantity: -10 }]),
    ]);
    expect(Number((await level(wh2)).on_hand)).toBe(20);
    await expectError(
      one(O.owner.id, "select public.inventory_adjust($1,$2,'damaged',$3)", [O.org, wh2, JSON.stringify([{ stock_item_id: item, quantity: 5 }])]),
      "negative quantity",
    );
    await expectError(
      one(O.owner.id, "select public.inventory_adjust($1,$2,'count_correction',$3)", [O.org, wh2, JSON.stringify([{ stock_item_id: item, quantity: 5 }])]),
      "Explain the reason",
    );
    const audit = await as(O.owner.id, (q) => q("select action from audit_logs where entity_id = $1", [adj.id]));
    expect(audit.map((a) => a.action)).toContain("stock_adjustment");
  });

  it("allows negative stock only with approval permission and a note, and audits the override", async () => {
    await expectError(
      one(O.owner.id, "select public.inventory_adjust($1,$2,'other',$3,'',true)", [O.org, wh2, JSON.stringify([{ stock_item_id: item, quantity: -25 }])]),
      "note is required",
    );
    await one(O.owner.id, "select public.inventory_adjust($1,$2,'other',$3,'Counted wrong at handover',true)", [
      O.org, wh2, JSON.stringify([{ stock_item_id: item, quantity: -25 }]),
    ]);
    expect(Number((await level(wh2)).on_hand)).toBe(-5);
    const audit = await admin("select 1 from audit_logs where organization_id=$1 and action='negative_stock_override'", [O.org]);
    expect(audit.length).toBe(1);
    await one(O.owner.id, "select public.inventory_transfer($1,$2,$3,$4,5)", [O.org, item, O.wh, wh2]);
  });

  it("reverses with a compensating entry instead of deleting", async () => {
    const rcpt = (await admin<{ id: string }>("select id from inventory_transactions where stock_item_id=$1 and reference_type='manual_receipt' and reason='GRN-1'", [item]))[0].id;
    await expectError(one(O.owner.id, "select public.inventory_reverse($1,'')", [rcpt]), "reason is required");
    await one(O.owner.id, "select public.inventory_reverse($1,'Wrong supplier delivery')", [rcpt]);
    await expectError(one(O.owner.id, "select public.inventory_reverse($1,'again')", [rcpt]), "already been reversed");
    const before = 175; // 180 - 5 transferred out
    expect(Number((await level(O.wh)).on_hand)).toBe(before - 100);
    // weighted average: (175 x 60 - 100 x 70) / 75 = 46.666667
    expect(await avg()).toBeCloseTo(46.666667, 5);
  });

  it("computes available = on hand - reserved and flags low stock", async () => {
    const row = (await as(O.owner.id, (q) => q<{ on_hand: string; available: string; stock_status: string }>(
      "select on_hand, available, stock_status from stock_levels where stock_item_id = $1", [item])))[0];
    expect(Number(row.available)).toBe(Number(row.on_hand));
    expect(row.stock_status).toBe("ok");
    await one(O.owner.id, "select public.inventory_adjust($1,$2,'wastage',$3,'Spoiled')", [O.org, O.wh, JSON.stringify([{ stock_item_id: item, quantity: -40 }])]);
    const after = (await as(O.owner.id, (q) => q<{ stock_status: string }>("select stock_status from stock_levels where stock_item_id = $1", [item])))[0];
    expect(after.stock_status).toBe("low");
    const notes = await admin("select 1 from notifications where organization_id=$1 and type='low_stock'", [O.org]);
    expect(notes.length).toBeGreaterThan(0);
  });
});
