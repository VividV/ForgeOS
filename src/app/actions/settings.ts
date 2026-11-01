"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { actionContext } from "@/lib/auth";
import { friendlyError, type ActionResult } from "@/lib/errors";
import { parseOrFields } from "@/lib/validation/common";
import { configSchema, orgSchema } from "@/lib/validation/onboarding";

export async function saveOrgDetails(values: Record<string, unknown>): Promise<ActionResult> {
  const p = parseOrFields(orgSchema, values);
  if (!p.ok) return p.error;
  const c = await actionContext("settings.manage");
  if ("error" in c) return { ok: false, error: c.error! };
  const d = p.data;
  const { error } = await c.supabase
    .from("organizations")
    .update({ ...d, website: d.website || null, email: d.email || null })
    .eq("id", c.ctx.org.id);
  if (error) return { ok: false, error: friendlyError(error) };
  revalidatePath("/", "layout");
  return { ok: true, message: "Company details saved" };
}

export async function saveConfigurationSettings(values: Record<string, unknown>): Promise<ActionResult> {
  const p = parseOrFields(configSchema.extend({ timezone: z.string().min(3).max(60) }), values);
  if (!p.ok) return p.error;
  if (p.data.inventory_valuation === "fifo") return { ok: false, error: "FIFO valuation is not available yet.", fieldErrors: { inventory_valuation: "Not available yet" } };
  const c = await actionContext("settings.manage");
  if ("error" in c) return { ok: false, error: c.error! };
  const { error } = await c.supabase
    .from("organization_settings")
    .update({ ...p.data, require_production_approval: p.data.require_production_approval ?? false })
    .eq("organization_id", c.ctx.org.id);
  if (error) return { ok: false, error: friendlyError(error) };
  revalidatePath("/", "layout");
  return { ok: true, message: "Preferences saved" };
}
