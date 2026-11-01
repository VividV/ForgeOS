"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { actionContext } from "@/lib/auth";
import { friendlyError, type ActionResult } from "@/lib/errors";
import { optDate, optText, parseOrFields, positive, reqText } from "@/lib/validation/common";
import { customerSchema } from "@/lib/validation/sales";

type R = ActionResult<{ id?: string; redirect?: string }>;
const fail = (e: { code?: string; message?: string }): R => ({ ok: false, error: friendlyError(e) });
const touch = () => {
  revalidatePath("/commerce", "layout");
  revalidatePath("/inventory", "layout");
  revalidatePath("/operations", "layout");
};
const money = z.preprocess((v) => (v === "" || v == null ? 0 : Number(String(v).replace(/,/g, ""))), z.number().min(0, "Must be zero or more"));
const pct100 = z.preprocess((v) => (v === "" || v == null ? 0 : Number(v)), z.number().min(0, "0–100").max(100, "0–100"));

export async function saveCustomer(id: string | null, values: Record<string, unknown>): Promise<R> {
  const p = parseOrFields(customerSchema, values);
  if (!p.ok) return p.error;
  const c = await actionContext("customers.manage");
  if ("error" in c) return { ok: false, error: c.error! };
  const org = c.ctx.org.id;
  const q = id
    ? c.supabase.from("customers").update(p.data).eq("id", id).eq("organization_id", org).select("id").single()
    : c.supabase.from("customers").insert({ ...p.data, organization_id: org }).select("id").single();
  const { data, error } = await q;
  if (error) return error.code === "23505" ? { ok: false, error: "A customer with this code already exists", fieldErrors: { code: "Already used" } } : fail(error);
  revalidatePath("/commerce/customers", "layout");
  return { ok: true, data: { id: data.id }, message: id ? "Customer updated" : "Customer added" };
}

export async function setCustomerActive(id: string, active: boolean): Promise<R> {
  const c = await actionContext("customers.manage");
  if ("error" in c) return { ok: false, error: c.error! };
  const { error } = await c.supabase.from("customers").update({ is_active: active }).eq("id", id).eq("organization_id", c.ctx.org.id);
  if (error) return fail(error);
  revalidatePath("/commerce/customers", "layout");
  return { ok: true, message: active ? "Customer reactivated" : "Customer archived" };
}

const orderSchema = z.object({
  customer_id: z.uuid("Choose a customer"),
  warehouse_id: z.uuid("Choose where goods ship from"),
  requested_date: optDate,
  customer_reference: optText(80),
  payment_terms: optText(120),
  shipping_address: optText(400),
  notes: optText(2000),
  shipping_charge: money,
  lines: z
    .array(z.object({ stock_item_id: z.uuid("Choose a product"), quantity: positive(), unit_price: money, discount_pct: pct100, tax_pct: pct100, description: optText(200) }))
    .min(1, "Add at least one product")
    .max(200),
});

export async function saveCustomerOrder(id: string | null, values: unknown): Promise<R> {
  const p = parseOrFields(orderSchema, values);
  if (!p.ok) return p.error;
  const c = await actionContext("sales_orders.create");
  if ("error" in c) return { ok: false, error: c.error! };
  const { data, error } = await c.supabase.rpc("sales_order_save", { p_org: c.ctx.org.id, p_so: id, p: p.data });
  if (error) return fail(error);
  touch();
  return { ok: true, data: { id: data as string, redirect: `/commerce/customer-orders/${data}` }, message: id ? "Order updated" : "Customer order created" };
}

export async function transitionCustomerOrder(id: string, action: "confirm" | "cancel" | "close", note?: string): Promise<R> {
  const c = await actionContext();
  if ("error" in c) return { ok: false, error: c.error! };
  const { data, error } = await c.supabase.rpc("sales_order_transition", { p_so: id, p_action: action, p_note: note?.trim() || null });
  if (error) return fail(error);
  touch();
  const msg: Record<string, string> = { confirmed: "Order confirmed. Available stock has been allocated.", cancelled: "Order cancelled", closed: "Order closed" };
  return { ok: true, message: msg[String(data)] ?? "Done" };
}

export async function allocateCustomerOrder(id: string): Promise<R> {
  const c = await actionContext();
  if ("error" in c) return { ok: false, error: c.error! };
  const { error } = await c.supabase.rpc("sales_order_allocate", { p_so: id });
  if (error) return fail(error);
  touch();
  return { ok: true, message: "Allocation refreshed from available stock" };
}

const makeSchema = z.object({
  factory_id: z.uuid("Choose a factory"),
  quantity: positive(),
  due_date: optDate,
  priority: z.enum(["low", "normal", "high", "urgent"]).default("normal"),
});

export async function planProductionForLine(lineId: string, values: Record<string, unknown>): Promise<R> {
  const p = parseOrFields(makeSchema, values);
  if (!p.ok) return p.error;
  const c = await actionContext("production_orders.create");
  if ("error" in c) return { ok: false, error: c.error! };
  const { data, error } = await c.supabase.rpc("sales_order_make", { p_item: lineId, p: { ...p.data, submit: true } });
  if (error) return fail(error);
  touch();
  return { ok: true, data: { id: data as string }, message: "Production order created and sent for approval" };
}

const dispatchSchema = z.object({
  carrier: optText(120),
  vehicle: optText(60),
  driver_name: optText(120),
  tracking_reference: optText(120),
  notes: optText(1000),
  idem: z.string().max(80).optional(),
  lines: z.array(z.object({ so_item_id: z.uuid(), quantity: z.preprocess((v) => (v === "" || v == null ? 0 : Number(v)), z.number().min(0)) })).min(1),
});

export async function dispatchGoods(orderId: string, values: unknown): Promise<R> {
  const p = parseOrFields(dispatchSchema, values);
  if (!p.ok) return p.error;
  const c = await actionContext("sales_orders.dispatch");
  if ("error" in c) return { ok: false, error: c.error! };
  const { idem, ...rest } = p.data;
  const { data, error } = await c.supabase.rpc("dispatch_post", { p_so: orderId, p: rest, p_idem: idem ?? null });
  if (error) return fail(error);
  touch();
  return { ok: true, data: { id: data as string, redirect: `/commerce/dispatches/${data}` }, message: "Dispatch recorded. Stock has left the warehouse." };
}

export async function confirmDelivery(dispatchId: string, values: Record<string, unknown>): Promise<R> {
  const p = parseOrFields(z.object({ received_by: reqText("who received the goods", 120), notes: optText(500) }), values);
  if (!p.ok) return p.error;
  const c = await actionContext("sales_orders.dispatch");
  if ("error" in c) return { ok: false, error: c.error! };
  const { error } = await c.supabase.rpc("dispatch_confirm_delivery", { p_dispatch: dispatchId, p_received_by: p.data.received_by, p_notes: p.data.notes });
  if (error) return fail(error);
  touch();
  return { ok: true, message: "Delivery confirmed" };
}

const paymentSchema = z.object({
  amount: positive("Enter an amount greater than zero"),
  paid_on: optDate,
  method: z.enum(["cash", "bank_transfer", "card", "pos", "cheque", "mobile_money", "other"]),
  reference: optText(120),
  notes: optText(500),
});

export async function recordPayment(orderId: string, values: Record<string, unknown>): Promise<R> {
  const p = parseOrFields(paymentSchema, values);
  if (!p.ok) return p.error;
  const c = await actionContext("sales_orders.create");
  if ("error" in c) return { ok: false, error: c.error! };
  const { error } = await c.supabase.rpc("payment_record", { p_so: orderId, p: p.data });
  if (error) return fail(error);
  touch();
  return { ok: true, message: "Payment recorded" };
}

export async function voidPayment(paymentId: string, reason?: string): Promise<R> {
  const c = await actionContext("sales_orders.manage");
  if ("error" in c) return { ok: false, error: c.error! };
  const { error } = await c.supabase.rpc("payment_void", { p_payment: paymentId, p_reason: reason?.trim() || "" });
  if (error) return fail(error);
  touch();
  return { ok: true, message: "Payment voided" };
}

