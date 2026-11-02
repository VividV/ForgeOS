import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { addMember, admin, as, createUser, expectError, one, pool, setupOrg } from "./helpers";

// Forecasting, material planning, bottlenecks, anomalies, copilot usage limits and WhatsApp.
describe("intelligence", () => {
  let O: Awaited<ReturnType<typeof setupOrg>>;
  let demo: string;
  let user: { id: string };
  beforeAll(async () => {
    O = await setupOrg("PhaseSix");
    user = await createUser("Ivy Insight");
    demo = (await one<{ id: string }>(user.id, "select public.create_demo_organization() id")).id;
  });
  afterAll(() => pool.end());

  it("forecasts demand from dispatches and open orders, and plans materials through the BOM", async () => {
    const fc = await as(user.id, (q) => q<{ code: string; weekly_avg: string; open_orders: string; projected_gap: string }>("select * from public.demand_forecast($1, 4)", [demo]));
    const shirt = fc.find((f) => f.code === "SHIRT-ANK")!;
    // 30 shirts dispatched this week → weighted weekly average 30 × 8 / 36
    expect(Number(shirt.weekly_avg)).toBeCloseTo((30 * 8) / 36, 1);
    const dress = fc.find((f) => f.code === "DRESS-LIN")!;
    expect(Number(dress.open_orders)).toBe(30);
    const mr = await as(user.id, (q) => q<{ code: string; for_open_production: string; on_order: string; net_requirement: string }>("select * from public.material_requirements($1, 4)", [demo]));
    const ank = mr.find((m) => m.code === "FAB-ANK")!;
    // the waiting 120-shirt order needs 120 × 1.8 m × 1.05 = 226.8 m that isn't reserved yet
    expect(Number(ank.for_open_production)).toBeCloseTo(226.8, 1);
    expect(Number(mr.find((m) => m.code === "FAB-LIN")!.on_order)).toBe(200);
  });

  it("bottleneck analysis and anomaly detection run on the organisation's own data only", async () => {
    const bn = await as(user.id, (q) => q<{ stage: string; queued: string }>("select * from public.bottleneck_analysis($1, 30)", [demo]));
    expect(bn.length).toBe(9);
    expect(bn.some((b) => Number(b.queued) > 0)).toBe(true); // the dress order is waiting at sewing
    expect(await as(user.id, (q) => q("select * from public.detect_anomalies($1)", [demo]))).toBeInstanceOf(Array);
    expect(await as(O.owner.id, (q) => q("select * from public.demand_forecast($1, 4)", [demo]))).toHaveLength(0);
    await expectError(one(O.owner.id, "select * from public.detect_anomalies($1)", [demo]), "missing permission");
  });

  it("copilot requests are counted against the plan's monthly allowance", async () => {
    await admin("update plans set ai_requests_monthly = 2 where key = 'growth'");
    try {
      await one(O.owner.id, "select public.ai_reserve_request($1)", [O.org]);
      await one(O.owner.id, "select public.ai_reserve_request($1)", [O.org]);
      await expectError(one(O.owner.id, "select public.ai_reserve_request($1)", [O.org]), "questions for this month have been used");
    } finally {
      await admin("update plans set ai_requests_monthly = 500 where key = 'growth'");
    }
    const w = await addMember(O.owner.id, O.org, "production_worker", "Wole Worker");
    await expectError(one(w.id, "select public.ai_reserve_request($1)", [O.org]), "missing permission: ai.use");
  });

  it("WhatsApp: opted-in people get warning alerts queued; replies can update their job cards", async () => {
    await as(user.id, (q) => q("insert into whatsapp_contacts (organization_id, user_id, phone, alerts) values ($1, $2, '+2348011112222', true)", [demo, user.id]));
    // someone else can't add or read another person's number
    expect(await as(O.owner.id, (q) => q("select * from whatsapp_contacts where user_id=$1", [user.id]))).toHaveLength(0);
    await admin("select app.notify_user($1, $2, 'test', 'warning', 'Materials short for PRD-00099', 'Fabric is short', '/operations/production-orders', null, null)", [demo, user.id]);
    await admin("select app.notify_user($1, $2, 'test', 'info', 'Just FYI', null, null, null, null)", [demo, user.id]);
    const out = await admin<{ body: string; link: string }>("select body, link from whatsapp_outbox where organization_id=$1 order by id", [demo]);
    expect(out).toHaveLength(1); // info isn't sent
    expect(out[0].body).toContain("Materials short for PRD-00099");

    expect(await admin<{ r: string }>("select public.whatsapp_handle_message('+2340000000000','HELP') r")).toEqual([{ r: expect.stringContaining("isn't linked") }]);
    const help = (await admin<{ r: string }>("select public.whatsapp_handle_message('+2348011112222','help') r"))[0].r;
    expect(help).toContain("STATUS");
    const num = (await admin<{ number: string }>("select number from production_orders where organization_id=$1 and status='in_progress' limit 1", [demo]))[0].number;
    const st = (await admin<{ r: string }>("select public.whatsapp_handle_message('+2348011112222', $1) r", [`status ${num}`]))[0].r;
    expect(st).toContain(num);
    // a job card for the linked person, updated by message
    const op = (await admin<{ id: string }>("select op.id from production_operations op join production_orders o on o.id=op.production_order_id where o.organization_id=$2 and o.number=$1 and op.status <> 'completed' order by op.sequence limit 1", [num, demo]))[0].id;
    const jc = (await one<{ id: string }>(user.id, "select public.job_card_issue($1,$2,null,40) id", [op, user.id])).id;
    const code = (await admin<{ code: string }>("select code from job_cards where id=$1", [jc]))[0].code;
    const r = (await admin<{ r: string }>("select public.whatsapp_handle_message('+2348011112222', $1) r", [`${code} 12 1`]))[0].r;
    expect(r).toContain("Recorded on " + code);
    expect((await admin<{ q: string }>("select quantity_completed q from job_cards where id=$1", [jc]))[0].q).toBe("12.0000");
    // nobody can call the message handler through the API
    await expectError(one(user.id, "select public.whatsapp_handle_message('+2348011112222','HELP')"), "permission denied");
  });
});
