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
  require_final_inspection: boolean;
  po_approval_threshold: number;
};

export type Billing = {
  plan: string; plan_name: string; status: string; trial_ends_at: string | null; current_period_end: string | null; cancel_at_period_end: boolean;
  max_users: number | null; max_factories: number | null; ai_requests_monthly: number | null; users: number; factories: number;
  ends_at: string | null; locked: boolean; in_grace: boolean;
};

export type OrgContext = {
  user: { id: string; email: string };
  profile: { full_name: string; email: string; is_platform_admin: boolean };
  org: { id: string; name: string; slug: string; is_demo: boolean; onboarding_completed_at: string | null; country: string; logo_url: string | null; status: string };
  billing: Billing | null;
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
    supabase.from("profiles").select("full_name, email, last_organization_id, is_platform_admin").eq("id", user.id).single(),
    supabase.rpc("my_organizations"),
  ]);
  const list = (orgs ?? []) as { id: string; name: string; slug: string; is_demo: boolean; onboarding_completed_at: string | null; role_names: string[] }[];
  if (list.length === 0) return null;
  const active = list.find((o) => o.id === profile?.last_organization_id) ?? list[0];

  const [{ data: org }, { data: settings }, { data: perms }, { data: billing }] = await Promise.all([
    supabase.from("organizations").select("id, name, slug, is_demo, onboarding_completed_at, country, logo_url, status").eq("id", active.id).single(),
    supabase.from("organization_settings").select("*").eq("organization_id", active.id).single(),
    supabase.rpc("my_permissions", { p_org: active.id }),
    supabase.rpc("billing_state", { p_org: active.id }),
  ]);
  if (!org || !settings) return null;
  const permissions = new Set<string>((perms as string[] | null) ?? []);
  return {
    user: { id: user.id, email: user.email ?? "" },
    profile: { full_name: profile?.full_name ?? "", email: profile?.email ?? user.email ?? "", is_platform_admin: Boolean(profile?.is_platform_admin) },
    billing: (billing as Billing | null) ?? null,
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
  if (ctx.org.status === "suspended") redirect("/suspended");
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

/**
 * Server-action guard: returns the context and an authenticated client, or an error string.
 * Changes are blocked once a subscription's grace period has ended (viewing still works).
 */
export async function actionContext(...anyOf: Permission[]) {
  const c = await billingFreeActionContext(...anyOf);
  if ("error" in c) return c;
  if (c.ctx.org.status === "suspended") return { error: "This organisation is suspended. Contact ForgeOS support." as const };
  if (c.ctx.billing?.locked)
    return { error: (c.ctx.can("billing.manage") ? "Your subscription has ended. Choose a plan under Billing to keep making changes." : "This organisation's subscription has ended. Ask the owner to renew it under Billing.") as "Your subscription has ended." };
  return c;
}

/** Like actionContext, but still allowed when the subscription has lapsed (billing, sign-out, switching organisation). */
export async function billingFreeActionContext(...anyOf: Permission[]) {
  const ctx = await getOrgContext();
  if (!ctx) return { error: "Your session has expired. Sign in again." as const };
  if (anyOf.length && !ctx.canAny(...anyOf)) return { error: "You don't have permission to do this." as const };
  const { supabase } = await getSession();
  return { ctx, supabase };
}
