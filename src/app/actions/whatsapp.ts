"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { billingFreeActionContext } from "@/lib/auth";
import { friendlyError, type ActionResult } from "@/lib/errors";
import { parseOrFields } from "@/lib/validation/common";

const schema = z.object({
  phone: z.string().trim().transform((v) => v.replace(/[\s()-]/g, "")).pipe(z.string().regex(/^\+[1-9]\d{7,14}$/, "Use international format, e.g. +2348012345678")),
  alerts: z.boolean().optional(),
  daily_summary: z.boolean().optional(),
});

export async function saveWhatsApp(values: Record<string, unknown>): Promise<ActionResult> {
  const p = parseOrFields(schema, values);
  if (!p.ok) return p.error;
  const c = await billingFreeActionContext();
  if ("error" in c) return { ok: false, error: c.error! };
  const { error } = await c.supabase.from("whatsapp_contacts").upsert({ organization_id: c.ctx.org.id, user_id: c.ctx.user.id, phone: p.data.phone, alerts: p.data.alerts ?? true, daily_summary: p.data.daily_summary ?? false, opted_in_at: new Date().toISOString() });
  if (error) return error.code === "23505" ? { ok: false, error: "That number is already linked to someone else in this organisation." } : { ok: false, error: friendlyError(error) };
  revalidatePath("/account");
  return { ok: true, message: "WhatsApp settings saved" };
}

export async function removeWhatsApp(): Promise<ActionResult> {
  const c = await billingFreeActionContext();
  if ("error" in c) return { ok: false, error: c.error! };
  const { error } = await c.supabase.from("whatsapp_contacts").delete().eq("organization_id", c.ctx.org.id).eq("user_id", c.ctx.user.id);
  if (error) return { ok: false, error: friendlyError(error) };
  revalidatePath("/account");
  return { ok: true, message: "WhatsApp turned off" };
}
