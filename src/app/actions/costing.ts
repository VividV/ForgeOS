"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { actionContext } from "@/lib/auth";
import { friendlyError, type ActionResult } from "@/lib/errors";
import { optDate, optText, optUuid, parseOrFields } from "@/lib/validation/common";

type R = ActionResult<{ id?: string; redirect?: string }>;
const fail = (e: { code?: string; message?: string }): R => ({ ok: false, error: friendlyError(e) });
const optNum = z.preprocess((v) => (v === "" || v == null ? undefined : Number(v)), z.number().min(0).optional());

const entrySchema = z.discriminatedUnion("entry_type", [
  z.object({
    entry_type: z.literal("labour"),
    hours: z.preprocess((v) => Number(v), z.number().positive("Enter hours worked")),
    rate: optNum,
    worker_id: optUuid,
    worker_name: optText(120),
    operation_id: optUuid,
    entry_date: optDate,
    notes: optText(300),
  }),
  z.object({
    entry_type: z.literal("machine"),
    hours: z.preprocess((v) => Number(v), z.number().positive("Enter machine hours")),
    rate: optNum,
    work_centre_id: z.uuid("Choose a work centre"),
    operation_id: optUuid,
    entry_date: optDate,
    notes: optText(300),
  }),
  z.object({
    entry_type: z.literal("overhead"),
    category: z.enum(["overhead", "packaging", "utilities", "transport", "other"]),
    description: z.string().trim().min(2, "Describe the cost").max(200),
    amount: z.preprocess((v) => Number(v), z.number().min(0, "Enter an amount")),
  }),
]);

export async function addCostEntry(orderId: string, values: Record<string, unknown>): Promise<R> {
  const p = parseOrFields(entrySchema, values);
  if (!p.ok) return p.error;
  const c = await actionContext("costing.manage");
  if ("error" in c) return { ok: false, error: c.error! };
  const { error } = await c.supabase.rpc("cost_entry_add", { p_order: orderId, p: p.data });
  if (error) return fail(error);
  revalidatePath(`/operations/production-orders/${orderId}`);
  return { ok: true, message: "Cost recorded" };
}

export async function removeCostEntry(orderId: string, entryId: string, kind: "labour" | "overhead"): Promise<R> {
  const c = await actionContext("costing.manage");
  if ("error" in c) return { ok: false, error: c.error! };
  const { error } = await c.supabase.rpc("cost_entry_remove", { p_entry: entryId, p_kind: kind });
  if (error) return fail(error);
  revalidatePath(`/operations/production-orders/${orderId}`);
  return { ok: true, message: "Entry removed" };
}

const rateSchema = z
  .object({
    kind: z.enum(["labour", "overhead"]),
    name: z.string().trim().min(2, "Name the rate").max(80),
    basis: z.enum(["per_hour", "per_unit", "percent_material", "per_order"]),
    rate: z.preprocess((v) => Number(v), z.number().min(0, "Enter a rate")),
    is_default: z.boolean().optional(),
  })
  .refine((v) => v.kind !== "labour" || v.basis === "per_hour", { path: ["basis"], message: "Labour rates are per hour" });

export async function saveCostRate(id: string | null, values: Record<string, unknown>): Promise<R> {
  const p = parseOrFields(rateSchema, values);
  if (!p.ok) return p.error;
  const c = await actionContext("costing.manage");
  if ("error" in c) return { ok: false, error: c.error! };
  const row = { ...p.data, is_default: p.data.is_default ?? true };
  const org = c.ctx.org.id;
  if (row.kind === "labour" && row.is_default) {
    await c.supabase.from("cost_rates").update({ is_default: false }).eq("organization_id", org).eq("kind", "labour").neq("id", id ?? "00000000-0000-0000-0000-000000000000");
  }
  const q = id ? c.supabase.from("cost_rates").update(row).eq("id", id).eq("organization_id", org) : c.supabase.from("cost_rates").insert({ ...row, organization_id: org });
  const { error } = await q;
  if (error) return error.code === "23505" ? { ok: false, error: "A rate with this name already exists" } : fail(error);
  revalidatePath("/commerce/costing");
  return { ok: true, message: "Rate saved" };
}

export async function setCostRateActive(id: string, active: boolean): Promise<R> {
  const c = await actionContext("costing.manage");
  if ("error" in c) return { ok: false, error: c.error! };
  const { error } = await c.supabase.from("cost_rates").update({ is_active: active }).eq("id", id).eq("organization_id", c.ctx.org.id);
  if (error) return fail(error);
  revalidatePath("/commerce/costing");
  return { ok: true, message: active ? "Rate activated" : "Rate deactivated" };
}

export async function saveProductEstimate(productId: string): Promise<R> {
  const c = await actionContext("costing.manage");
  if ("error" in c) return { ok: false, error: c.error! };
  const { error } = await c.supabase.rpc("product_cost_estimate", { p_product: productId, p_save: true });
  if (error) return fail(error);
  revalidatePath("/commerce/costing");
  return { ok: true, message: "Standard cost saved" };
}
