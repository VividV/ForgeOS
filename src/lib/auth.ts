import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type Permission = string;

export type OrgSettings = {
  currency: "NGN" | "USD" | "GBP" | "EUR";
  date_format: string;
  timezone: string;
  measurement_system: string;
  fiscal_year_start_month: number;
  inventory_valuation: string;
  costing_method: string;
  allow_negative_stock: boolean;
  require_production_approval: boolean;
};

export type OrgContext = {
  user: { id: string; email: string };
  profile: { full_name: string; email: string };
  org: { id: string; name: string; slug: string; is_demo: boolean; onboarding_completed_at: string | null; country: string; logo_url: string | null };
  orgs: { id: string; name: string; is_demo: boolean; role_names: string[] }[];
  roles: string[];
  settings: OrgSettings;
  permissions: Set<Permission>;
  can: (p: Permission) => boolean;
  canAny: (...p: Permission[]) => boolean;
};

export const getSession = cache(async () => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
});

export async function requireUser() {
  const { supabase, user } = await getSession();
  if (!user) redirect("/login");
  return { supabase, user };
}

/** Resolves the signed-in user's active organisation and permissions (once per request). */
export const getOrgContext = cache(async (): Promise<OrgContext | null> => {
  const { supabase, user } = await requireUser();
  const [{ data: profile }, { data: orgs }] = await Promise.all([
    supabase.from("profiles").select("full_name, email, last_organization_id").eq("id", user.id).single(),
    supabase.rpc("my_organizations"),
  ]);
  const list = (orgs ?? []) as { id: string; name: string; slug: string; is_demo: boolean; onboarding_completed_at: string | null; role_names: string[] }[];
  if (list.length === 0) return null;
  const active = list.find((o) => o.id === profile?.last_organization_id) ?? list[0];

  const [{ data: org }, { data: settings }, { data: perms }] = await Promise.all([
    supabase.from("organizations").select("id, name, slug, is_demo, onboarding_completed_at, country, logo_url").eq("id", active.id).single(),
    supabase.from("organization_settings").select("*").eq("organization_id", active.id).single(),
    supabase.rpc("my_permissions", { p_org: active.id }),
  ]);
  if (!org || !settings) return null;
  const permissions = new Set<string>((perms as string[] | null) ?? []);
  return {
    user: { id: user.id, email: user.email ?? "" },
    profile: { full_name: profile?.full_name ?? "", email: profile?.email ?? user.email ?? "" },
    org,
    orgs: list.map(({ id, name, is_demo, role_names }) => ({ id, name, is_demo, role_names })),
    roles: active.role_names,
    settings: settings as OrgSettings,
    permissions,
    can: (p) => permissions.has(p),
    canAny: (...p) => p.some((x) => permissions.has(x)),
  };
});

/** For pages inside the app shell: requires a fully onboarded organisation. */
export async function requireOrg(): Promise<OrgContext> {
  const ctx = await getOrgContext();
  if (!ctx) redirect("/onboarding");
  // Only people who can finish setup are sent back to it; invited members carry on.
  if (!ctx.org.onboarding_completed_at && ctx.can("settings.manage")) redirect("/onboarding");
  return ctx;
}

/** Page-level permission gate. The database enforces the same rule independently. */
export async function requirePermission(...anyOf: Permission[]): Promise<OrgContext> {
  const ctx = await requireOrg();
  if (!ctx.canAny(...anyOf)) redirect(`/forbidden`);
  return ctx;
}

/** Server-action guard: returns the context and an authenticated client, or an error string. */
export async function actionContext(...anyOf: Permission[]) {
  const ctx = await getOrgContext();
  if (!ctx) return { error: "Your session has expired. Sign in again." as const };
  if (anyOf.length && !ctx.canAny(...anyOf)) return { error: "You don't have permission to do this." as const };
  const { supabase } = await getSession();
  return { ctx, supabase };
}
