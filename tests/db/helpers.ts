import { randomUUID } from "node:crypto";
import pg from "pg";

export const pool = new pg.Pool({
  connectionString: process.env.TEST_DATABASE_URL ?? "postgres://postgres@127.0.0.1:54322/postgres",
  max: 4,
});

export type Q = <T = Record<string, unknown>>(sql: string, params?: unknown[]) => Promise<T[]>;

/** Creates an auth user directly (bypassing the Auth API) and returns its id. */
export async function createUser(name: string): Promise<{ id: string; email: string }> {
  const id = randomUUID();
  const email = `${name.toLowerCase().replace(/\W+/g, ".")}.${id.slice(0, 8)}@test.forgeos.dev`;
  await pool.query(
    `insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_user_meta_data, created_at, updated_at)
     values ($1, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', $2, '', now(), $3, now(), now())`,
    [id, email, JSON.stringify({ full_name: name })],
  );
  return { id, email };
}

/** Runs fn as the given user with the `authenticated` role, exactly as PostgREST would. Commits on success. */
export async function as<T>(userId: string | null, fn: (q: Q) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query(`set local role ${userId ? "authenticated" : "anon"}`);
    await client.query("select set_config('request.jwt.claims', $1, true)", [
      JSON.stringify(userId ? { sub: userId, role: "authenticated" } : { role: "anon" }),
    ]);
    const q: Q = async (sql, params) => (await client.query(sql, params)).rows;
    const result = await fn(q);
    await client.query("commit");
    return result;
  } catch (e) {
    await client.query("rollback");
    throw e;
  } finally {
    client.release();
  }
}

export async function one<T = Record<string, unknown>>(userId: string | null, sql: string, params?: unknown[]): Promise<T> {
  return as(userId, async (q) => (await q<T>(sql, params))[0]);
}

export async function admin<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]> {
  return (await pool.query(sql, params)).rows as T[];
}

/** Creates a user with an organisation, a factory (with its store) and returns ids. */
export async function setupOrg(label: string) {
  const owner = await createUser(`${label} Owner`);
  const org = (await one<{ id: string }>(owner.id, "select public.create_organization($1) as id", [
    { name: `${label} Manufacturing`, country: "NG" },
  ])).id;
  const factory = (await one<{ id: string }>(owner.id, "select public.create_factory($1, $2) as id", [
    org,
    { name: `${label} Plant`, code: label.toUpperCase().slice(0, 6), work_centre_count: 2 },
  ])).id;
  const wh = (await admin<{ default_warehouse_id: string }>("select default_warehouse_id from factories where id = $1", [factory]))[0]
    .default_warehouse_id;
  const uom = async (code: string) =>
    (await admin<{ id: string }>("select id from units_of_measure where organization_id = $1 and code = $2", [org, code]))[0].id;
  return { owner, org, factory, wh, uom };
}

export async function createMaterial(userId: string, org: string, code: string, name: string, uomId: string, extra: Record<string, unknown> = {}) {
  const m = await one<{ id: string }>(
    userId,
    `insert into materials (organization_id, code, name, stock_uom_id, reorder_level, standard_cost)
     values ($1, $2, $3, $4, $5, $6) returning id`,
    [org, code, name, uomId, extra.reorder_level ?? 0, extra.standard_cost ?? null],
  );
  const si = (await admin<{ id: string }>("select id from stock_items where material_id = $1", [m.id]))[0].id;
  return { materialId: m.id, stockItemId: si };
}

export async function addMember(ownerId: string, org: string, roleKey: string, name: string) {
  const user = await createUser(name);
  const role = (await admin<{ id: string }>("select id from roles where organization_id = $1 and key = $2", [org, roleKey]))[0].id;
  const inv = await one<{ token: string }>(ownerId, "select token from public.create_invitation($1, $2, $3)", [org, user.email, role]);
  await one(user.id, "select public.accept_invitation($1)", [inv.token]);
  return user;
}

export async function expectError(p: Promise<unknown>, match: RegExp | string) {
  try {
    await p;
  } catch (e) {
    const msg = (e as Error).message;
    if (typeof match === "string" ? msg.includes(match) : match.test(msg)) return msg;
    throw new Error(`Expected error matching ${match}, got: ${msg}`);
  }
  throw new Error(`Expected error matching ${match}, but the call succeeded`);
}
