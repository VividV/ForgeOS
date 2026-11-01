"use server";
import { revalidatePath } from "next/cache";
import { actionContext, getSession } from "@/lib/auth";
import { friendlyError, zodFieldErrors, type ActionResult } from "@/lib/errors";
import { configSchema, factorySchema, orgSchema, profileSchema } from "@/lib/validation/onboarding";

type R = ActionResult<{ redirect?: string; id?: string }>;

export async function createOrganization(values: Record<string, unknown>): Promise<R> {
  const parsed = orgSchema.safeParse(values);
  if (!parsed.success) return { ok: false, error: "Check the highlighted fields", fieldErrors: zodFieldErrors(parsed.error.issues) };
  const { supabase, user } = await getSession();
  if (!user) return { ok: false, error: "Sign in again" };
  const { data, error } = await supabase.rpc("create_organization", { p: parsed.data });
  if (error) return { ok: false, error: friendlyError(error) };
  revalidatePath("/", "layout");
  return { ok: true, data: { id: data as string, redirect: "/onboarding?step=profile" }, message: "Organisation created" };
}

async function markStep(orgId: string, step: string) {
  const { supabase } = await getSession();
  const { data } = await supabase.from("organizations").select("onboarding_state").eq("id", orgId).single();
  await supabase.from("organizations").update({ onboarding_state: { ...(data?.onboarding_state ?? {}), [step]: true } }).eq("id", orgId);
}

export async function saveProfile(values: Record<string, unknown>): Promise<R> {
  const parsed = profileSchema.safeParse(values);
  if (!parsed.success) return { ok: false, error: "Check the highlighted fields", fieldErrors: zodFieldErrors(parsed.error.issues) };
  const c = await actionContext("settings.manage");
  if ("error" in c) return { ok: false, error: c.error! };
  const d = parsed.data;
  const { error } = await c.supabase
    .from("organizations")
    .update({
      main_products: d.main_products || null,
      employee_count_range: d.employee_count_range || null,
      factory_count: d.factory_count ?? null,
      production_model: d.production_model || null,
      production_challenges: d.production_challenges ?? [],
    })
    .eq("id", c.ctx.org.id);
  if (error) return { ok: false, error: friendlyError(error) };
  await markStep(c.ctx.org.id, "profile");
  return { ok: true, data: { redirect: "/onboarding?step=factory" } };
}

export async function createFirstFactory(values: Record<string, unknown>): Promise<R> {
  const parsed = factorySchema.safeParse(values);
  if (!parsed.success) return { ok: false, error: "Check the highlighted fields", fieldErrors: zodFieldErrors(parsed.error.issues) };
  const c = await actionContext("work_centres.manage");
  if ("error" in c) return { ok: false, error: c.error! };
  const { stage_template, ...f } = parsed.data;
  const { data, error } = await c.supabase.rpc("create_factory", { p_org: c.ctx.org.id, p: f });
  if (error) return { ok: false, error: friendlyError(error) };
  if (stage_template !== "generic") {
    const r = await c.supabase.rpc("apply_stage_template", { p_org: c.ctx.org.id, p_template: stage_template });
    if (r.error) return { ok: false, error: friendlyError(r.error) };
  }
  await c.supabase.from("organization_settings").update({ timezone: f.timezone }).eq("organization_id", c.ctx.org.id);
  return { ok: true, data: { id: data as string, redirect: "/onboarding?step=configuration" }, message: "Factory added" };
}

export async function saveConfiguration(values: Record<string, unknown>): Promise<R> {
  const parsed = configSchema.safeParse(values);
  if (!parsed.success) return { ok: false, error: "Check the highlighted fields", fieldErrors: zodFieldErrors(parsed.error.issues) };
  if (parsed.data.inventory_valuation === "fifo") return { ok: false, error: "FIFO valuation is not available yet. Use weighted average for now.", fieldErrors: { inventory_valuation: "Not available yet" } };
  const c = await actionContext("settings.manage");
  if ("error" in c) return { ok: false, error: c.error! };
  const { error } = await c.supabase
    .from("organization_settings")
    .update({ ...parsed.data, require_production_approval: parsed.data.require_production_approval ?? true })
    .eq("organization_id", c.ctx.org.id);
  if (error) return { ok: false, error: friendlyError(error) };
  await markStep(c.ctx.org.id, "configuration");
  return { ok: true, data: { redirect: "/onboarding?step=team" } };
}

export async function skipStep(step: "team" | "profile"): Promise<R> {
  const c = await actionContext();
  if ("error" in c) return { ok: false, error: c.error! };
  await markStep(c.ctx.org.id, step);
  return { ok: true, data: { redirect: step === "team" ? "/onboarding?step=data" : "/onboarding?step=factory" } };
}

export async function finishOnboarding(): Promise<R> {
  const c = await actionContext("settings.manage");
  if ("error" in c) return { ok: false, error: c.error! };
  const { error } = await c.supabase.rpc("complete_onboarding", { p_org: c.ctx.org.id });
  if (error) return { ok: false, error: friendlyError(error) };
  revalidatePath("/", "layout");
  return { ok: true, data: { redirect: "/overview" }, message: "Setup complete" };
}
