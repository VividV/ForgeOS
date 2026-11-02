"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { actionContext } from "@/lib/auth";
import { friendlyError, type ActionResult } from "@/lib/errors";
import { nonNegative, optDate, optText, optUuid, parseOrFields, positive } from "@/lib/validation/common";

type R = ActionResult<{ id?: string; redirect?: string }>;
const fail = (e: { code?: string; message?: string }): R => ({ ok: false, error: friendlyError(e) });
const touch = (id?: string) => {
  revalidatePath("/operations", "layout");
  if (id) revalidatePath(`/operations/production-orders/${id}`);
};

const orderSchema = z
  .object({
    product_id: z.uuid("Choose a product"),
    variant_id: optUuid,
    factory_id: z.uuid("Choose a factory"),
    quantity: positive("Enter the quantity to produce"),
    priority: z.enum(["low", "normal", "high", "urgent"]),
    planned_start_date: optDate,
    due_date: optDate,
    manager_id: optUuid,
    material_warehouse_id: optUuid,
    output_warehouse_id: optUuid,
    source: z.enum(["manual", "customer_order", "replenishment"]),
    source_reference: optText(120),
    notes: optText(2000),
    submit: z.boolean().optional(),
  })
  .refine((v) => !v.due_date || !v.planned_start_date || v.due_date >= v.planned_start_date, { path: ["due_date"], message: "Due date must be on or after the start date" });

export async function createProductionOrder(values: Record<string, unknown>): Promise<R> {
  const p = parseOrFields(orderSchema, values);
  if (!p.ok) return p.error;
  const c = await actionContext("production_orders.create");
  if ("error" in c) return { ok: false, error: c.error! };
  const { quantity, ...rest } = p.data;
  const { data, error } = await c.supabase.rpc("production_order_create", { p_org: c.ctx.org.id, p: { ...rest, quantity } });
  if (error) return fail(error);
  touch();
  return { ok: true, data: { id: data as string, redirect: `/operations/production-orders/${data}` }, message: "Production order created" };
}

const editSchema = z.object({
  priority: z.enum(["low", "normal", "high", "urgent"]),
  planned_start_date: optDate,
  due_date: optDate,
  manager_id: optUuid,
  notes: optText(2000),
});

export async function updateProductionOrder(id: string, values: Record<string, unknown>): Promise<R> {
  const p = parseOrFields(editSchema, values);
  if (!p.ok) return p.error;
  const c = await actionContext("production_orders.update");
  if ("error" in c) return { ok: false, error: c.error! };
  const { error } = await c.supabase.from("production_orders").update(p.data).eq("id", id).eq("organization_id", c.ctx.org.id);
  if (error) return fail(error);
  touch(id);
  return { ok: true, message: "Order updated" };
}

const STATUSES = ["awaiting_approval", "approved", "draft", "ready_to_start", "in_progress", "paused", "quality_inspection", "cancelled"] as const;

export async function transitionOrder(id: string, to: (typeof STATUSES)[number], note?: string): Promise<R> {
  if (!STATUSES.includes(to)) return { ok: false, error: "Invalid status" };
  const c = await actionContext();
  if ("error" in c) return { ok: false, error: c.error! };
  const { data, error } = await c.supabase.rpc("production_order_transition", { p_order: id, p_to: to, p_note: note?.trim() || null });
  if (error) return fail(error);
  touch(id);
  const label = String(data).replace(/_/g, " ");
  return { ok: true, message: `Order is now ${label}` };
}

export async function reserveMaterials(id: string): Promise<R> {
  const c = await actionContext("production_orders.manage", "production_orders.approve", "production_orders.update");
  if ("error" in c) return { ok: false, error: c.error! };
  const { data, error } = await c.supabase.rpc("production_order_reserve", { p_order: id });
  if (error) return fail(error);
  touch(id);
  const short = (data as { shortage: number }[]).filter((r) => Number(r.shortage) > 0).length;
  return { ok: true, message: short ? `Reserved what's available. ${short} material(s) still short.` : "All materials reserved" };
}

const linesSchema = z.object({
  lines: z.array(z.object({ material_id: z.uuid(), quantity: nonNegative() })).min(1),
  operation_id: optUuid,
  idem: z.string().max(80).optional(),
});

export async function issueMaterials(id: string, values: unknown): Promise<R> {
  const p = parseOrFields(linesSchema, values);
  if (!p.ok) return p.error;
  const c = await actionContext("production_orders.manage");
  if ("error" in c) return { ok: false, error: c.error! };
  const lines = p.data.lines.filter((l) => l.quantity > 0);
  if (!lines.length) return { ok: false, error: "Enter at least one quantity to issue" };
  const { data, error } = await c.supabase.rpc("production_issue_materials", { p_order: id, p_lines: lines, p_operation: p.data.operation_id, p_idem: p.data.idem ?? null });
  if (error) return fail(error);
  touch(id);
  return { ok: true, message: `Issued ${data} material line(s)` };
}

export async function returnMaterials(id: string, values: unknown): Promise<R> {
  const p = parseOrFields(linesSchema, values);
  if (!p.ok) return p.error;
  const c = await actionContext("production_orders.manage");
  if ("error" in c) return { ok: false, error: c.error! };
  const lines = p.data.lines.filter((l) => l.quantity > 0);
  if (!lines.length) return { ok: false, error: "Enter at least one quantity to return" };
  const { error } = await c.supabase.rpc("production_return_materials", { p_order: id, p_lines: lines, p_idem: p.data.idem ?? null });
  if (error) return fail(error);
  touch(id);
  return { ok: true, message: "Materials returned to stock" };
}

const wastageSchema = z.object({ material_id: z.uuid("Choose a material"), quantity: positive(), reason: z.string().trim().min(2, "Give a reason").max(300), operation_id: optUuid });

export async function recordWastage(id: string, values: Record<string, unknown>): Promise<R> {
  const p = parseOrFields(wastageSchema, values);
  if (!p.ok) return p.error;
  const c = await actionContext("production_orders.update");
  if ("error" in c) return { ok: false, error: c.error! };
  const { error } = await c.supabase.rpc("production_record_wastage", { p_order: id, p_material: p.data.material_id, p_quantity: p.data.quantity, p_reason: p.data.reason, p_operation: p.data.operation_id });
  if (error) return fail(error);
  touch(id);
  return { ok: true, message: "Wastage recorded" };
}

const progressSchema = z.object({ good: nonNegative(), rejected: nonNegative(), message: optText(500) }).refine((v) => v.good + v.rejected > 0, { path: ["good"], message: "Enter a completed or rejected quantity" });

export async function operationAction(orderId: string, opId: string, action: "start" | "pause" | "complete" | "skip" | "progress", values?: Record<string, unknown>): Promise<R> {
  const c = await actionContext("production_orders.update");
  if ("error" in c) return { ok: false, error: c.error! };
  let good: number | null = null;
  let rejected: number | null = null;
  let message: string | null = null;
  if (action === "progress") {
    const p = parseOrFields(progressSchema, values ?? {});
    if (!p.ok) return p.error;
    good = p.data.good;
    rejected = p.data.rejected;
    message = p.data.message;
  }
  const { error } = await c.supabase.rpc("production_operation_action", { p_op: opId, p_action: action, p_good: good, p_rejected: rejected, p_message: message });
  if (error) return fail(error);
  touch(orderId);
  return { ok: true, message: { start: "Step started", pause: "Step paused", complete: "Step completed", skip: "Step skipped", progress: "Progress recorded" }[action] };
}

const downtimeSchema = z.object({ operation_id: optUuid, minutes: z.preprocess((v) => Number(v), z.number().int().min(1, "At least 1 minute").max(10080)), reason: z.string().trim().min(2, "Give a reason").max(300) });

export async function recordDowntime(orderId: string, values: Record<string, unknown>): Promise<R> {
  const p = parseOrFields(downtimeSchema, values);
  if (!p.ok) return p.error;
  const c = await actionContext("production_orders.update");
  if ("error" in c) return { ok: false, error: c.error! };
  const { error } = await c.supabase.rpc("production_record_downtime", { p_order: orderId, p_operation: p.data.operation_id, p_minutes: p.data.minutes, p_reason: p.data.reason });
  if (error) return fail(error);
  touch(orderId);
  return { ok: true, message: "Downtime recorded" };
}

export async function addNote(orderId: string, values: Record<string, unknown>): Promise<R> {
  const p = parseOrFields(z.object({ message: z.string().trim().min(1, "Write a note").max(2000), operation_id: optUuid }), values);
  if (!p.ok) return p.error;
  const c = await actionContext("production_orders.update");
  if ("error" in c) return { ok: false, error: c.error! };
  const { error } = await c.supabase.rpc("production_add_note", { p_order: orderId, p_operation: p.data.operation_id, p_message: p.data.message });
  if (error) return fail(error);
  touch(orderId);
  return { ok: true, message: "Note added" };
}

const jobCardSchema = z.object({
  operation_id: z.uuid("Choose a step"),
  assigned_user_id: optUuid,
  assigned_employee_id: optUuid,
  assigned_team: optText(80),
  target_quantity: positive(),
  instructions: optText(1000),
}).refine((v) => v.assigned_user_id || v.assigned_team || v.assigned_employee_id, { path: ["assigned_user_id"], message: "Assign to a person, an employee or a team" });

export async function issueJobCard(orderId: string, values: Record<string, unknown>): Promise<R> {
  const p = parseOrFields(jobCardSchema, values);
  if (!p.ok) return p.error;
  const c = await actionContext("job_cards.create");
  if ("error" in c) return { ok: false, error: c.error! };
  const d = p.data;
  const { data, error } = await c.supabase.rpc("job_card_issue", { p_operation: d.operation_id, p_assignee: d.assigned_user_id, p_team: d.assigned_team, p_target: d.target_quantity, p_instructions: d.instructions, p_employee: d.assigned_employee_id });
  if (error) return fail(error);
  touch(orderId);
  return { ok: true, data: { id: data as string }, message: "Job card issued" };
}

const completeSchema = z.object({
  good: nonNegative("Enter accepted units"),
  rejected: nonNegative("Enter rejected units"),
  note: optText(1000),
  allow_exception: z.boolean().optional(),
  idem: z.string().max(80).optional(),
}).refine((v) => v.good + v.rejected > 0, { path: ["good"], message: "Enter the output" });

export async function completeOrder(id: string, values: Record<string, unknown>): Promise<R> {
  const p = parseOrFields(completeSchema, values);
  if (!p.ok) return p.error;
  const c = await actionContext("production_orders.manage");
  if ("error" in c) return { ok: false, error: c.error! };
  const d = p.data;
  const { error } = await c.supabase.rpc("production_order_complete", {
    p_order: id, p_good: d.good, p_rejected: d.rejected, p_note: d.note, p_allow_material_exception: d.allow_exception ?? false, p_idem: d.idem ?? null,
  });
  if (error) return fail(error);
  touch(id);
  revalidatePath("/inventory", "layout");
  return { ok: true, message: `Order completed. ${d.good} accepted units added to finished goods.` };
}

/** Worker job card actions (also used offline-replay: idempotent per client_ref). */
const cardActionSchema = z.object({
  action: z.enum(["start", "resume", "pause", "progress", "defect", "shortage", "note", "complete"]),
  good: z.preprocess((v) => (v === "" || v == null ? undefined : Number(v)), z.number().min(0).optional()),
  rejected: z.preprocess((v) => (v === "" || v == null ? undefined : Number(v)), z.number().min(0).optional()),
  message: optText(1000),
  client_ref: z.string().min(8).max(80).optional(),
});

export async function jobCardAction(cardId: string, values: Record<string, unknown>): Promise<ActionResult<{ status: string; job_card_status?: string }>> {
  if (!z.uuid().safeParse(cardId).success) return { ok: false, error: "Invalid job card" };
  const p = parseOrFields(cardActionSchema, values);
  if (!p.ok) return p.error;
  const c = await actionContext("job_cards.work", "job_cards.update");
  if ("error" in c) return { ok: false, error: c.error! };
  const d = p.data;
  const { data, error } = await c.supabase.rpc("job_card_action", {
    p_card: cardId, p_action: d.action, p_good: d.good ?? null, p_rejected: d.rejected ?? null, p_message: d.message, p_client_ref: d.client_ref ?? null,
  });
  if (error) return { ok: false, error: friendlyError(error) };
  revalidatePath("/floor", "layout");
  revalidatePath("/operations", "layout");
  return { ok: true, data: data as { status: string; job_card_status?: string } };
}
