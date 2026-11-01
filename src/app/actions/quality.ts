"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { actionContext } from "@/lib/auth";
import { friendlyError, type ActionResult } from "@/lib/errors";
import { optDate, optText, optUuid, parseOrFields } from "@/lib/validation/common";

type R = ActionResult<{ id?: string; redirect?: string }>;
const fail = (e: { code?: string; message?: string }): R => ({ ok: false, error: friendlyError(e) });
const num0 = z.preprocess((v) => (v === "" || v == null ? 0 : Number(v)), z.number().min(0));

const checkSchema = z.object({
  check_type: z.enum(["production", "goods_receipt"]),
  production_order_id: optUuid,
  goods_receipt_id: optUuid,
  operation_id: optUuid,
  is_final: z.boolean().optional(),
  template_id: optUuid,
  quantity_inspected: z.preprocess((v) => Number(v), z.number().positive("Enter the quantity inspected")),
  quantity_rejected: num0,
  result: z.enum(["pass", "fail", "conditional"]),
  conditional_note: optText(1000),
  notes: optText(2000),
  items: z.array(z.object({ template_item_id: optUuid, name: z.string().max(200), result: z.enum(["pass", "fail", "na"]), value: optText(200), notes: optText(300) })).max(100).default([]),
  defects: z.array(z.object({ category: z.string().trim().min(1, "Defect category").max(80), severity: z.enum(["minor", "major", "critical"]), quantity: z.preprocess((v) => Number(v), z.number().positive()), description: optText(500) })).max(50).default([]),
  actions: z.array(z.object({ description: z.string().trim().max(500), assigned_to: optUuid, due_date: optDate })).max(20).default([]),
});

export async function recordInspection(values: unknown): Promise<R> {
  const p = parseOrFields(checkSchema, values);
  if (!p.ok) return p.error;
  const c = await actionContext("quality.create");
  if ("error" in c) return { ok: false, error: c.error! };
  const { data, error } = await c.supabase.rpc("quality_check_record", { p_org: c.ctx.org.id, p: p.data });
  if (error) return fail(error);
  revalidatePath("/operations", "layout");
  revalidatePath("/commerce", "layout");
  return { ok: true, data: { id: data as string }, message: "Inspection recorded" };
}

export async function updateCorrectiveAction(id: string, status: string, resolution?: string): Promise<R> {
  const c = await actionContext();
  if ("error" in c) return { ok: false, error: c.error! };
  const { error } = await c.supabase.rpc("corrective_action_update", { p_action: id, p_status: status, p_resolution: resolution?.trim() || null });
  if (error) return fail(error);
  revalidatePath("/operations/quality", "layout");
  return { ok: true, message: "Corrective action updated" };
}

const templateSchema = z.object({
  name: z.string().trim().min(2, "Name the checklist").max(120),
  applies_to: z.enum(["production", "goods_receipt"]),
  stage_id: optUuid,
  product_id: optUuid,
  description: optText(500),
  items: z
    .array(z.object({ name: z.string().trim().min(1, "Name each check").max(200), check_type: z.enum(["pass_fail", "measurement", "text"]), target: optText(120), required: z.boolean() }))
    .min(1, "Add at least one check")
    .max(60),
});

export async function saveTemplate(id: string | null, values: unknown): Promise<R> {
  const p = parseOrFields(templateSchema, values);
  if (!p.ok) return p.error;
  const c = await actionContext("quality.manage");
  if ("error" in c) return { ok: false, error: c.error! };
  const { items, ...head } = p.data;
  const org = c.ctx.org.id;
  let tid = id;
  if (tid) {
    const { error } = await c.supabase.from("quality_templates").update(head).eq("id", tid).eq("organization_id", org);
    if (error) return fail(error);
    const del = await c.supabase.from("quality_template_items").delete().eq("template_id", tid);
    if (del.error) return fail(del.error);
  } else {
    const { data, error } = await c.supabase.from("quality_templates").insert({ ...head, organization_id: org }).select("id").single();
    if (error) return error.code === "23505" ? { ok: false, error: "A checklist with this name already exists" } : fail(error);
    tid = data.id;
  }
  const { error } = await c.supabase.from("quality_template_items").insert(items.map((it, i) => ({ ...it, organization_id: org, template_id: tid, sequence: i + 1 })));
  if (error) return fail(error);
  revalidatePath("/operations/quality", "layout");
  return { ok: true, data: { id: tid!, redirect: "/operations/quality/templates" }, message: "Checklist saved" };
}

export async function setTemplateActive(id: string, active: boolean): Promise<R> {
  const c = await actionContext("quality.manage");
  if ("error" in c) return { ok: false, error: c.error! };
  const { error } = await c.supabase.from("quality_templates").update({ is_active: active }).eq("id", id).eq("organization_id", c.ctx.org.id);
  if (error) return fail(error);
  revalidatePath("/operations/quality/templates");
  return { ok: true, message: active ? "Checklist activated" : "Checklist deactivated" };
}
