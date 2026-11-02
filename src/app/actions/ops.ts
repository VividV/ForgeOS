"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { actionContext } from "@/lib/auth";
import { friendlyError, type ActionResult } from "@/lib/errors";
import { optDate, optText, optUuid, parseOrFields, positive, reqText } from "@/lib/validation/common";

type R = ActionResult<{ id?: string; redirect?: string }>;
const fail = (e: { code?: string; message?: string }): R => ({ ok: false, error: friendlyError(e) });

// Stock counts -----------------------------------------------------------------------------------
export async function startStockCount(values: Record<string, unknown>): Promise<R> {
  const p = parseOrFields(z.object({ warehouse_id: z.uuid("Choose a warehouse"), scope: z.enum(["all", "materials", "finished_goods"]).default("all"), blind: z.boolean().optional(), notes: optText(500) }), values);
  if (!p.ok) return p.error;
  const c = await actionContext("inventory.adjust");
  if ("error" in c) return { ok: false, error: c.error! };
  const { data, error } = await c.supabase.rpc("stock_count_start", { p_org: c.ctx.org.id, p: p.data });
  if (error) return fail(error);
  revalidatePath("/inventory/counts");
  return { ok: true, data: { id: data as string, redirect: `/inventory/counts/${data}` }, message: "Count sheet created" };
}

export async function saveStockCount(countId: string, lines: { line_id: string; counted: string; note: string }[]): Promise<R> {
  const c = await actionContext("inventory.adjust");
  if ("error" in c) return { ok: false, error: c.error! };
  const clean = lines.map((l) => ({ line_id: l.line_id, counted: l.counted === "" ? null : Number(l.counted), note: l.note?.trim() || null }));
  if (clean.some((l) => l.counted !== null && (!Number.isFinite(l.counted) || l.counted < 0))) return { ok: false, error: "Counts must be zero or more" };
  const { error } = await c.supabase.rpc("stock_count_record", { p_count: countId, p_lines: clean });
  if (error) return fail(error);
  revalidatePath(`/inventory/counts/${countId}`);
  return { ok: true, message: "Counts saved" };
}

export async function transitionStockCount(countId: string, action: "submit" | "approve" | "reopen" | "cancel", note?: string): Promise<R> {
  const c = await actionContext();
  if ("error" in c) return { ok: false, error: c.error! };
  const { error } = await c.supabase.rpc("stock_count_transition", { p_count: countId, p_action: action, p_note: note?.trim() || null });
  if (error) return fail(error);
  revalidatePath("/inventory", "layout");
  const msg = { submit: "Count submitted for approval", approve: "Count approved. Stock now matches what was counted.", reopen: "Count sent back for recounting", cancel: "Count cancelled" };
  return { ok: true, message: msg[action] };
}

// Returns, credit notes, invoices ------------------------------------------------------------------
const returnSchema = z.object({
  reason: reqText("a reason", 300),
  notes: optText(1000),
  warehouse_id: optUuid,
  credit: z.boolean().optional(),
  idem: z.string().max(80).optional(),
  lines: z.array(z.object({ so_item_id: z.uuid(), quantity: z.preprocess((v) => (v === "" || v == null ? 0 : Number(v)), z.number().min(0)), condition: z.enum(["restock", "damaged"]) })).min(1),
});
export async function recordReturn(orderId: string, values: unknown): Promise<R> {
  const p = parseOrFields(returnSchema, values);
  if (!p.ok) return p.error;
  const c = await actionContext("sales_orders.dispatch");
  if ("error" in c) return { ok: false, error: c.error! };
  const { idem, ...rest } = p.data;
  const { error } = await c.supabase.rpc("sales_return_post", { p_so: orderId, p: rest, p_idem: idem ?? null });
  if (error) return fail(error);
  revalidatePath("/commerce", "layout");
  revalidatePath("/inventory", "layout");
  return { ok: true, data: { redirect: `/commerce/customer-orders/${orderId}` }, message: p.data.credit ? "Return recorded and credit note issued" : "Return recorded" };
}

export async function issueCreditNote(orderId: string, values: Record<string, unknown>): Promise<R> {
  const p = parseOrFields(z.object({ amount: positive("Enter an amount"), reason: reqText("a reason", 300) }), values);
  if (!p.ok) return p.error;
  const c = await actionContext("sales_orders.manage");
  if ("error" in c) return { ok: false, error: c.error! };
  const { error } = await c.supabase.rpc("credit_note_issue", { p_so: orderId, p_amount: p.data.amount, p_reason: p.data.reason });
  if (error) return fail(error);
  revalidatePath("/commerce", "layout");
  return { ok: true, message: "Credit note issued" };
}

export async function voidCreditNote(id: string, reason?: string): Promise<R> {
  const c = await actionContext("sales_orders.manage");
  if ("error" in c) return { ok: false, error: c.error! };
  const { error } = await c.supabase.rpc("credit_note_void", { p_note: id, p_reason: reason?.trim() || "" });
  if (error) return fail(error);
  revalidatePath("/commerce", "layout");
  return { ok: true, message: "Credit note voided" };
}

export async function issueInvoice(orderId: string, values: Record<string, unknown>): Promise<R> {
  const p = parseOrFields(z.object({ basis: z.enum(["dispatched", "ordered"]).default("dispatched"), due_date: optDate, notes: optText(1000) }), values);
  if (!p.ok) return p.error;
  const c = await actionContext("sales_orders.create");
  if ("error" in c) return { ok: false, error: c.error! };
  const { data, error } = await c.supabase.rpc("invoice_issue", { p_so: orderId, p: p.data });
  if (error) return fail(error);
  revalidatePath("/commerce", "layout");
  return { ok: true, data: { id: data as string, redirect: `/commerce/invoices/${data}` }, message: "Invoice issued" };
}

export async function voidInvoice(id: string, reason?: string): Promise<R> {
  const c = await actionContext("sales_orders.manage");
  if ("error" in c) return { ok: false, error: c.error! };
  const { error } = await c.supabase.rpc("invoice_void", { p_invoice: id, p_reason: reason?.trim() || "" });
  if (error) return fail(error);
  revalidatePath("/commerce", "layout");
  return { ok: true, message: "Invoice voided" };
}

// Attachments ----------------------------------------------------------------------------------------
const TYPES = ["organization", "quality_check", "production_order", "sales_order", "goods_receipt", "dispatch", "stock_count", "purchase_order"] as const;
const MIME: Record<string, (b: Uint8Array) => boolean> = {
  "image/jpeg": (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  "image/png": (b) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47,
  "image/webp": (b) => b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45,
  "application/pdf": (b) => b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46,
};
const MAX_UPLOAD = 4 * 1024 * 1024;

export async function uploadAttachment(form: FormData): Promise<R> {
  const entityType = String(form.get("entity_type") ?? "");
  const entityId = String(form.get("entity_id") ?? "");
  const caption = String(form.get("caption") ?? "").trim().slice(0, 200) || null;
  const file = form.get("file");
  if (!TYPES.includes(entityType as (typeof TYPES)[number]) || !z.uuid().safeParse(entityId).success) return { ok: false, error: "Invalid record" };
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "Choose a file" };
  if (file.size > MAX_UPLOAD) return { ok: false, error: "Files must be 4 MB or smaller" };
  const bytes = new Uint8Array(await file.arrayBuffer());
  const check = MIME[file.type];
  // trust the file's contents, not its name or declared type
  if (!check || !check(bytes)) return { ok: false, error: "Only JPEG, PNG, WebP images and PDFs can be uploaded" };
  const c = await actionContext();
  if ("error" in c) return { ok: false, error: c.error! };
  const org = c.ctx.org.id;
  const { data, error } = await c.supabase
    .from("attachments")
    .insert({ organization_id: org, entity_type: entityType, entity_id: entityType === "organization" ? org : entityId, file_name: file.name.slice(0, 200) || "file", content_type: file.type, size_bytes: file.size, data: "\\x" + Buffer.from(bytes).toString("hex"), caption, uploaded_by: c.ctx.user.id })
    .select("id")
    .single();
  if (error) return error.code === "42501" ? { ok: false, error: "You don't have permission to add files here." } : fail(error);
  if (entityType === "organization" && form.get("as_logo") === "1") {
    const u = await c.supabase.from("organizations").update({ logo_url: `/api/files/${data.id}` }).eq("id", org);
    if (u.error) return fail(u.error);
    revalidatePath("/", "layout");
  }
  revalidatePath("/", "layout");
  return { ok: true, data: { id: data.id }, message: "File uploaded" };
}

export async function deleteAttachment(id: string): Promise<R> {
  const c = await actionContext();
  if ("error" in c) return { ok: false, error: c.error! };
  const { data, error } = await c.supabase.from("attachments").delete().eq("id", id).select("id");
  if (error) return fail(error);
  if (!data?.length) return { ok: false, error: "You can only remove files you uploaded." };
  revalidatePath("/", "layout");
  return { ok: true, message: "File removed" };
}
