import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { addMember, admin, as, createMaterial, expectError, one, pool, setupOrg } from "./helpers";

// Acceptance test 10 (security) and test 1 (permission restrictions) at the database layer.
describe("tenant isolation and RBAC", () => {
  let A: Awaited<ReturnType<typeof setupOrg>>;
  let B: Awaited<ReturnType<typeof setupOrg>>;
  let aStock: string;

  beforeAll(async () => {
    A = await setupOrg("Alpha");
    B = await setupOrg("Bravo");
    const m = await createMaterial(A.owner.id, A.org, "COT-001", "Cotton fabric", await A.uom("m"));
    aStock = m.stockItemId;
    await one(A.owner.id, "select public.inventory_receive($1,$2,$3,100,50)", [A.org, aStock, A.wh]);
  });
  afterAll(() => pool.end());

  it("owners get the full permission set; other orgs see nothing", async () => {
    const perms = (await one<{ p: string[] }>(A.owner.id, "select public.my_permissions($1) p", [A.org])).p;
    expect(perms).toContain("billing.manage");
    const none = (await one<{ p: string[] }>(B.owner.id, "select public.my_permissions($1) p", [A.org])).p;
    expect(none).toEqual([]);
  });

  it("blocks cross-organisation reads", async () => {
    const rows = await as(B.owner.id, (q) => q("select id from materials where organization_id = $1", [A.org]));
    expect(rows).toHaveLength(0);
    const txns = await as(B.owner.id, (q) => q("select id from inventory_transactions where organization_id = $1", [A.org]));
    expect(txns).toHaveLength(0);
    const orgs = await as(B.owner.id, (q) => q("select id from organizations where id = $1", [A.org]));
    expect(orgs).toHaveLength(0);
    const audit = await as(B.owner.id, (q) => q("select id from audit_logs where organization_id = $1", [A.org]));
    expect(audit).toHaveLength(0);
  });

  it("blocks cross-organisation writes and RPCs", async () => {
    const bUom = await B.uom("m");
    await expectError(
      as(B.owner.id, (q) => q("insert into materials (organization_id, code, name, stock_uom_id) values ($1,'X1','X',$2)", [A.org, bUom])),
      /row-level security|violates/,
    );
    await expectError(one(B.owner.id, "select public.inventory_receive($1,$2,$3,10,1)", [A.org, aStock, A.wh]), "missing permission");
    // passing your own org id with another org's stock item / warehouse is rejected too
    await expectError(one(B.owner.id, "select public.inventory_receive($1,$2,$3,10,1)", [B.org, aStock, B.wh]), "Stock item not found");
    const upd = await as(B.owner.id, (q) => q("update materials set name = 'hacked' where organization_id = $1 returning id", [A.org]));
    expect(upd).toHaveLength(0);
  });

  it("anonymous users cannot read anything", async () => {
    await expectError(as(null, (q) => q("select * from materials")), /permission denied/);
    await expectError(one(null, "select public.create_organization($1)", [{ name: "Anon Co" }]), "authentication required");
  });

  it("organization_id cannot be moved to another tenant", async () => {
    const mat = (await admin<{ id: string }>("select id from materials where organization_id = $1 limit 1", [A.org]))[0].id;
    await expectError(as(A.owner.id, (q) => q("update materials set organization_id = $1 where id = $2", [B.org, mat])), /cannot change|row-level/);
  });

  it("production workers only see their own job cards and cannot touch inventory", async () => {
    const worker = await addMember(A.owner.id, A.org, "production_worker", "Wale Worker");
    const perms = (await one<{ p: string[] }>(worker.id, "select public.my_permissions($1) p", [A.org])).p;
    expect(perms).toEqual(["job_cards.work"]);
    expect(await as(worker.id, (q) => q("select id from materials"))).toHaveLength(0);
    expect(await as(worker.id, (q) => q("select id from production_orders"))).toHaveLength(0);
    await expectError(one(worker.id, "select public.inventory_receive($1,$2,$3,10,1)", [A.org, aStock, A.wh]), "missing permission");
    await expectError(one(worker.id, "select public.production_order_create($1,$2)", [A.org, {}]), "missing permission");
  });

  it("invitations are bound to the invited email", async () => {
    const role = (await admin<{ id: string }>("select id from roles where organization_id = $1 and key = 'supervisor'", [A.org]))[0].id;
    const inv = await one<{ token: string }>(A.owner.id, "select token from public.create_invitation($1,$2,$3)", [A.org, "someone@else.test", role]);
    await expectError(one(B.owner.id, "select public.accept_invitation($1)", [inv.token]), "different email");
  });

  it("prevents privilege escalation", async () => {
    const admin1 = await addMember(A.owner.id, A.org, "administrator", "Ada Admin");
    const ownerRole = (await admin<{ id: string }>("select id from roles where organization_id = $1 and is_owner", [A.org]))[0].id;
    const myMember = (await admin<{ id: string }>("select id from organization_members where organization_id=$1 and user_id=$2", [A.org, admin1.id]))[0].id;
    await expectError(one(admin1.id, "select public.set_member_roles($1, $2)", [myMember, [ownerRole]]), "Only an owner");
    // an inventory manager with roles.manage removed cannot edit roles
    const inv = await addMember(A.owner.id, A.org, "inventory_manager", "Ike Inventory");
    const supRole = (await admin<{ id: string }>("select id from roles where organization_id=$1 and key='supervisor'", [A.org]))[0].id;
    await expectError(one(inv.id, "select public.set_role_permissions($1, $2)", [supRole, ["billing.manage"]]), "missing permission");
    // the last owner cannot be demoted
    const ownerMember = (await admin<{ id: string }>("select id from organization_members where organization_id=$1 and user_id=$2", [A.org, A.owner.id]))[0].id;
    await expectError(one(A.owner.id, "select public.set_member_roles($1, $2)", [ownerMember, [supRole]]), "at least one owner");
    // users cannot make themselves platform admins
    await expectError(as(admin1.id, (q) => q("update profiles set is_platform_admin = true where id = $1", [admin1.id])), "cannot be changed");
  });

  it("role changes are audited", async () => {
    const sup = await addMember(A.owner.id, A.org, "supervisor", "Sola Supervisor");
    const member = (await admin<{ id: string }>("select id from organization_members where organization_id=$1 and user_id=$2", [A.org, sup.id]))[0].id;
    const pm = (await admin<{ id: string }>("select id from roles where organization_id=$1 and key='production_manager'", [A.org]))[0].id;
    await one(A.owner.id, "select public.set_member_roles($1, $2)", [member, [pm]]);
    const rows = await as(A.owner.id, (q) => q("select action from audit_logs where organization_id = $1 and action = 'role_change'", [A.org]));
    expect(rows.length).toBeGreaterThan(0);
  });

  it("ledger and audit rows are immutable even for the database owner", async () => {
    await expectError(admin("update inventory_transactions set quantity = 1 where stock_item_id = $1", [aStock]), "immutable");
    await expectError(admin("delete from audit_logs where organization_id = $1", [A.org]), "immutable");
  });
});
