"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { actionContext } from "@/lib/auth";
import { friendlyError, type ActionResult } from "@/lib/errors";
import { nonNegative, num, optText, parseOrFields, positive } from "@/lib/validation/common";

type R = ActionResult<{ id?: string; redirect?: string }>;

function touch() {
  revalidatePath("/inventory", "layout");
}

const receiveSchema = z.object({
  stock_item_id: z.uuid(),
  warehouse_id: z.uuid("Choose a warehouse"),
  quantity: positive(),
  unit_cost: nonNegative("Enter the unit cost (0 if free)"),
  type: z.enum(["goods_receipt", "opening_balance"]),
  reference: optText(120),
  notes: optText(500),
  idem: z.string().max(80).optional(),
});

export async function receiveStock(values: Record<string, unknown>): Promise<R> {
  const p = parseOrFields(receiveSchema, values);
  if (!p.ok) return p.error;
  const c = await actionContext("inventory.create");
  if ("error" in c) return { ok: false, error: c.error! };
  const d = p.data;
  const { data, error } = await c.supabase.rpc("inventory_receive", {
    p_org: c.ctx.org.id,
    p_item: d.stock_item_id,
    p_warehouse: d.warehouse_id,
    p_quantity: d.quantity,
    p_unit_cost: d.unit_cost,
    p_type: d.type,
    p_reference: d.reference,
    p_notes: d.notes,
    p_idem: d.idem ?? null,
  });
  if (error) return { ok: false, error: friendlyError(error) };
  touch();
  return { ok: true, data: { id: data as string }, message: d.type === "opening_balance" ? "Opening balance recorded" : "Stock received" };
}

const transferSchema = z.object({
  stock_item_id: z.uuid(),
  from_warehouse_id: z.uuid("Choose where it's coming from"),
  to_warehouse_id: z.uuid("Choose where it's going"),
  quantity: positive(),
  notes: optText(500),
  idem: z.string().max(80).optional(),
}).refine((v) => v.from_warehouse_id !== v.to_warehouse_id, { path: ["to_warehouse_id"], message: "Choose a different warehouse" });

export async function transferStock(values: Record<string, unknown>): Promise<R> {
  const p = parseOrFields(transferSchema, values);
  if (!p.ok) return p.error;
  const c = await actionContext("inventory.create");
  if ("error" in c) return { ok: false, error: c.error! };
  const d = p.data;
  const { error } = await c.supabase.rpc("inventory_transfer", {
    p_org: c.ctx.org.id, p_item: d.stock_item_id, p_from: d.from_warehouse_id, p_to: d.to_warehouse_id, p_quantity: d.quantity, p_notes: d.notes, p_idem: d.idem ?? null,
  });
  if (error) return { ok: false, error: friendlyError(error) };
  touch();
  return { ok: true, message: "Stock transferred" };
}

const adjustSchema = z.object({
  warehouse_id: z.uuid("Choose a warehouse"),
  reason: z.enum(["count_correction", "damaged", "wastage", "found", "expired", "other"]),
  notes: optText(1000),
  allow_negative: z.boolean().optional(),
  idem: z.string().max(80).optional(),
  lines: z
    .array(z.object({ stock_item_id: z.uuid("Choose an item"), quantity: num().refine((n) => n !== 0, "Cannot be zero"), unit_cost: z.union([nonNegative(), z.literal(""), z.undefined()]).optional() }))
    .min(1, "Add at least one line")
    .max(200),
});

export async function adjustStock(values: unknown): Promise<R> {
  const p = parseOrFields(adjustSchema, values);
  if (!p.ok) return p.error;
  const c = await actionContext("inventory.adjust");
  if ("error" in c) return { ok: false, error: c.error! };
  const d = p.data;
  const { data, error } = await c.supabase.rpc("inventory_adjust", {
    p_org: c.ctx.org.id,
    p_warehouse: d.warehouse_id,
    p_reason: d.reason,
    p_lines: d.lines.map((l) => ({ stock_item_id: l.stock_item_id, quantity: l.quantity, unit_cost: l.unit_cost === "" ? undefined : l.unit_cost })),
    p_notes: d.notes,
    p_allow_negative: d.allow_negative ?? false,
    p_idem: d.idem ?? null,
  });
  if (error) return { ok: false, error: friendlyError(error) };
  touch();
  return { ok: true, data: { id: data as string }, message: "Adjustment posted" };
}

export async function reverseTransaction(txnId: string, reason?: string): Promise<R> {
  if (!z.uuid().safeParse(txnId).success) return { ok: false, error: "Invalid transaction" };
  if (!reason?.trim()) return { ok: false, error: "Give a reason for the reversal" };
  const c = await actionContext("inventory.approve");
  if ("error" in c) return { ok: false, error: c.error! };
  const { error } = await c.supabase.rpc("inventory_reverse", { p_txn: txnId, p_reason: reason.trim() });
  if (error) return { ok: false, error: friendlyError(error) };
  touch();
  return { ok: true, message: "Reversal posted" };
}
