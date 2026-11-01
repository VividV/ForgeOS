"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { actionContext } from "@/lib/auth";
import { friendlyError, type ActionResult } from "@/lib/errors";
import { nonNegative, optDate, optText, optUuid, parseOrFields, positive } from "@/lib/validation/common";

type R = ActionResult<{ id?: string; redirect?: string }>;
const fail = (e: { code?: string; message?: string }): R => ({ ok: false, error: friendlyError(e) });
const touch = () => {
  revalidatePath("/commerce", "layout");
  revalidatePath("/inventory", "layout");
};

const reqSchema = z.object({
  source: z.enum(["manual", "reorder", "production_shortage"]).default("manual"),
  production_order_id: optUuid,
  warehouse_id: optUuid,
  needed_by: optDate,
  notes: optText(1000),
  lines: z.array(z.object({ stock_item_id: z.uuid("Choose a material"), quantity: positive(), notes: optText(200) })).min(1, "Add at least one material").max(200),
});

export async function createRequisition(values: unknown): Promise<R> {
  const p = parseOrFields(reqSchema, values);
  if (!p.ok) return p.error;
  const c = await actionContext("requisitions.create");
  if ("error" in c) return { ok: false, error: c.error! };
  const { data, error } = await c.supabase.rpc("requisition_create", { p_org: c.ctx.org.id, p: p.data });
  if (error) return fail(error);
  touch();
  return { ok: true, data: { id: data as string, redirect: `/commerce/requisitions/${data}` }, message: "Requisition submitted for approval" };
}

export async function decideRequisition(id: string, decision: "approve" | "reject" | "cancel", note?: string): Promise<R> {
  const c = await actionContext();
  if ("error" in c) return { ok: false, error: c.error! };
  const { error } = await c.supabase.rpc("requisition_decide", { p_req: id, p_decision: decision, p_note: note?.trim() || null });
  if (error) return fail(error);
  touch();
  return { ok: true, message: { approve: "Requisition approved", reject: "Requisition rejected", cancel: "Requisition cancelled" }[decision] };
}

const poSchema = z.object({
  supplier_id: z.uuid("Choose a supplier"),
  warehouse_id: z.uuid("Choose where it will be delivered"),
  expected_date: optDate,
  payment_terms: optText(200),
  notes: optText(2000),
  shipping_cost: z.preprocess((v) => (v === "" || v == null ? 0 : Number(v)), z.number().min(0)),
  requisition_id: optUuid,
  lines: z
    .array(
      z.object({
        stock_item_id: z.uuid("Choose a material"),
        quantity: positive(),
        unit_price: nonNegative("Enter a unit price"),
        discount_pct: z.preprocess((v) => (v === "" || v == null ? 0 : Number(v)), z.number().min(0).max(100)),
        tax_pct: z.preprocess((v) => (v === "" || v == null ? 0 : Number(v)), z.number().min(0).max(100)),
        description: optText(200),
        requisition_item_id: optUuid,
      }),
    )
    .min(1, "Add at least one line")
    .max(200),
});

export async function savePurchaseOrder(id: string | null, values: unknown): Promise<R> {
  const p = parseOrFields(poSchema, values);
  if (!p.ok) return p.error;
  const c = await actionContext("procurement.create");
  if ("error" in c) return { ok: false, error: c.error! };
  const { data, error } = await c.supabase.rpc("purchase_order_save", { p_org: c.ctx.org.id, p_po: id, p: p.data });
  if (error) return fail(error);
  touch();
  return { ok: true, data: { id: data as string, redirect: `/commerce/purchase-orders/${data}` }, message: id ? "Purchase order updated" : "Purchase order created" };
}

export async function transitionPurchaseOrder(id: string, action: "submit" | "approve" | "reject" | "send" | "close" | "cancel", note?: string): Promise<R> {
  const c = await actionContext();
  if ("error" in c) return { ok: false, error: c.error! };
  const { data, error } = await c.supabase.rpc("purchase_order_transition", { p_po: id, p_action: action, p_note: note?.trim() || null });
  if (error) return fail(error);
  touch();
  return { ok: true, message: `Purchase order is now ${String(data).replace(/_/g, " ")}` };
}

const grnSchema = z.object({
  delivery_note: optText(120),
  notes: optText(1000),
  warehouse_id: optUuid,
  idem: z.string().max(80).optional(),
  lines: z.array(
    z.object({
      po_item_id: z.uuid(),
      received: z.preprocess((v) => (v === "" || v == null ? 0 : Number(v)), z.number().min(0)),
      rejected: z.preprocess((v) => (v === "" || v == null ? 0 : Number(v)), z.number().min(0)),
      rejection_reason: optText(300),
      discrepancy_note: optText(300),
    }),
  ),
});

export async function postGoodsReceipt(poId: string, values: unknown): Promise<R> {
  const p = parseOrFields(grnSchema, values);
  if (!p.ok) return p.error;
  const c = await actionContext("procurement.create");
  if ("error" in c) return { ok: false, error: c.error! };
  const { idem, ...rest } = p.data;
  const { data, error } = await c.supabase.rpc("goods_receipt_post", { p_po: poId, p: rest, p_idem: idem ?? null });
  if (error) return fail(error);
  touch();
  return { ok: true, data: { id: data as string, redirect: `/commerce/goods-received/${data}` }, message: "Goods receipt posted. Accepted quantities are now in stock." };
}
