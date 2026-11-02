import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { addMember, admin, as, createUser, expectError, one, pool, setupOrg } from "./helpers";

// Billing (trials, limits, lock, payments), platform administration and the demo workspace.
describe("billing, platform admin and demo workspace", () => {
  let O: Awaited<ReturnType<typeof setupOrg>>;
  beforeAll(async () => {
    O = await setupOrg("PhaseFive");
  });
  afterAll(() => pool.end());

  const state = async (uid: string, org: string) => (await one<{ s: Record<string, unknown> }>(uid, "select public.billing_state($1) s", [org])).s;

  it("new organisations start a 14-day Growth trial", async () => {
    const s = await state(O.owner.id, O.org);
    expect(s).toMatchObject({ plan: "growth", status: "trialing", locked: false, in_grace: false, max_factories: 3 });
    const days = (Date.parse(String(s.trial_ends_at)) - Date.now()) / 86400000;
    expect(days).toBeGreaterThan(13.9);
    expect(days).toBeLessThan(14.1);
    // members can't touch subscriptions directly
    await expectError(as(O.owner.id, (q) => q("update subscriptions set status='comped' where organization_id=$1", [O.org])), "permission denied");
  });

  it("plan limits are enforced in the database", async () => {
    await admin("update subscriptions set plan_key='starter' where organization_id=$1", [O.org]);
    await expectError(one(O.owner.id, "select public.create_factory($1,$2)", [O.org, { name: "Second plant" }]), "plan allows 1 factories");
    await admin("update subscriptions set plan_key='growth' where organization_id=$1", [O.org]);
    await one(O.owner.id, "select public.create_factory($1,$2)", [O.org, { name: "Second plant" }]);
  });

  it("after the trial and 7-day grace, changes are refused but reading still works", async () => {
    const ref = `ref-${Date.now().toString(36)}`;
    await admin("update subscriptions set trial_ends_at = now() - interval '3 days' where organization_id=$1", [O.org]);
    expect(await state(O.owner.id, O.org)).toMatchObject({ in_grace: true, locked: false });
    await admin("update subscriptions set trial_ends_at = now() - interval '8 days' where organization_id=$1", [O.org]);
    expect(await state(O.owner.id, O.org)).toMatchObject({ locked: true });
    await expectError(one(O.owner.id, "select public.create_factory($1,$2)", [O.org, { name: "Third plant" }]), "subscription ended");
    expect(await as(O.owner.id, (q) => q("select id from factories where organization_id=$1", [O.org]))).toHaveLength(2);
    // the owner can still start a checkout to renew
    const r = await one<{ r: { amount: number } }>(O.owner.id, "select public.billing_start_checkout($1,'starter',$2) r", [O.org, ref]);
    expect(Number(r.r.amount)).toBe(40000);
    // only the server (service role) can confirm a payment
    await expectError(one(O.owner.id, "select public.billing_record_payment($1,$2,'starter',40000,now())", [O.org, ref]), "permission denied");
    await admin("select public.billing_record_payment($1,$2,'starter',40000,now(),'CUS_x','owner@x.test')", [O.org, ref]);
    await admin("select public.billing_record_payment($1,$2,'starter',40000,now(),'CUS_x','owner@x.test')", [O.org, ref]); // idempotent
    const s = await state(O.owner.id, O.org);
    expect(s).toMatchObject({ plan: "starter", status: "active", locked: false });
    const days = (Date.parse(String(s.current_period_end)) - Date.now()) / 86400000;
    expect(days).toBeGreaterThan(27);
    expect(days).toBeLessThan(32);
    expect(await admin("select * from billing_payments where reference=$1 and status='success'", [ref])).toHaveLength(1);
    const w = await addMember(O.owner.id, O.org, "production_worker", "Wura Worker");
    await expectError(one(w.id, "select public.billing_start_checkout($1,'starter','ref-other')", [O.org]), "missing permission");
    expect(await as(w.id, (q) => q("select * from billing_payments where organization_id=$1", [O.org]))).toHaveLength(0);
  });

  it("platform admin functions are closed to everyone else; admins can comp and suspend", async () => {
    await expectError(one(O.owner.id, "select public.platform_overview()"), "platform admins only");
    const pa = await createUser("Pat Platform");
    await expectError(as(pa.id, (q) => q("update profiles set is_platform_admin = true where id = $1", [pa.id])), "cannot be changed");
    await admin("update profiles set is_platform_admin = true where id=$1", [pa.id]);
    const ov = (await one<{ o: Record<string, number> }>(pa.id, "select public.platform_overview() o")).o;
    expect(Number(ov.organizations)).toBeGreaterThan(0);
    const list = await as(pa.id, (q) => q<{ id: string }>("select * from public.platform_organizations($1)", ["PhaseFive"]));
    expect(list.some((x) => x.id === O.org)).toBe(true);
    await expectError(one(pa.id, "select public.platform_update_organization($1,$2)", [O.org, { status: "comped" }]), "note");
    await one(pa.id, "select public.platform_update_organization($1,$2)", [O.org, { plan: "professional", status: "comped", note: "Pilot customer" }]);
    expect(await state(O.owner.id, O.org)).toMatchObject({ plan: "professional", status: "comped", locked: false });
    await one(pa.id, "select public.platform_update_organization($1,$2)", [O.org, { org_status: "suspended", note: "Test suspension" }]);
    await expectError(one(O.owner.id, "select public.create_factory($1,$2)", [O.org, { name: "Blocked plant" }]), /missing permission|subscription ended/);
    await one(pa.id, "select public.platform_update_organization($1,$2)", [O.org, { org_status: "active", note: "Restored" }]);
  });

  it("demo workspace: separate, free, full of sample data, and can be left", async () => {
    const u = await createUser("Dami Demo");
    const demo = (await one<{ id: string }>(u.id, "select public.create_demo_organization() id")).id;
    const org = (await admin<{ is_demo: boolean; onboarding_completed_at: string | null }>("select * from organizations where id=$1", [demo]))[0];
    expect(org.is_demo).toBe(true);
    expect(org.onboarding_completed_at).not.toBeNull();
    expect(await state(u.id, demo)).toMatchObject({ status: "comped", locked: false });
    const counts = (await admin<Record<string, string>>(`select
      (select count(*) from materials where organization_id=$1) materials,
      (select count(*) from production_orders where organization_id=$1) orders,
      (select count(*) from production_orders where organization_id=$1 and status='completed') completed,
      (select count(*) from sales_orders where organization_id=$1) sales,
      (select count(*) from employees where organization_id=$1) employees,
      (select count(*) from purchase_orders where organization_id=$1 and status='sent') pos`, [demo]))[0];
    expect(counts).toMatchObject({ materials: "7", completed: "1", sales: "2", employees: "4", pos: "1" });
    expect(Number(counts.orders)).toBe(3);
    await expectError(one(u.id, "select public.create_demo_organization()"), "already have a demo");
    await expectError(one(O.owner.id, "select public.leave_demo_organization($1)", [O.org]), "Only demo");
    await one(u.id, "select public.leave_demo_organization($1)", [demo]);
    expect(await as(u.id, (q) => q("select id from sales_orders where organization_id=$1", [demo]))).toHaveLength(0);
  });
});
