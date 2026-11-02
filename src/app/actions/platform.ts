"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { billingFreeActionContext } from "@/lib/auth";
import { friendlyError, type ActionResult } from "@/lib/errors";
import { optDate, parseOrFields, reqText } from "@/lib/validation/common";

const schema = z.object({
  plan: z.enum(["starter", "growth", "professional", "enterprise"]),
  status: z.enum(["trialing", "active", "past_due", "cancelled", "expired", "comped"]),
  trial_ends_at: optDate,
  current_period_end: optDate,
  org_status: z.enum(["active", "suspended"]),
  note: reqText("a note explaining the change", 300),
});

export async function updateOrganization(orgId: string, values: Record<string, unknown>): Promise<ActionResult> {
  const p = parseOrFields(schema, values);
  if (!p.ok) return p.error;
  const c = await billingFreeActionContext();
  if ("error" in c) return { ok: false, error: c.error! };
  if (!c.ctx.profile.is_platform_admin) return { ok: false, error: "Platform admins only" };
  const end = (d: string | null) => (d ? `${d}T23:59:59Z` : null);
  const { error } = await c.supabase.rpc("platform_update_organization", { p_org: orgId, p: { ...p.data, trial_ends_at: end(p.data.trial_ends_at), current_period_end: end(p.data.current_period_end) } });
  if (error) return { ok: false, error: friendlyError(error) };
  revalidatePath("/platform", "layout");
  return { ok: true, message: "Organisation updated" };
}
