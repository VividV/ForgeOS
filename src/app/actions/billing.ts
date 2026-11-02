"use server";
import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { billingFreeActionContext } from "@/lib/auth";
import { appUrl } from "@/lib/env";
import { friendlyError, type ActionResult } from "@/lib/errors";
import { disableSubscription, initializeTransaction, planCode } from "@/lib/paystack";
import { integrations } from "@/lib/server-env";
import { createAdminClient } from "@/lib/supabase/admin";

type R = ActionResult<{ redirect?: string }>;

export async function startCheckout(plan: string): Promise<R> {
  if (!["starter", "growth", "professional"].includes(plan)) return { ok: false, error: "Choose a plan" };
  const c = await billingFreeActionContext("billing.manage");
  if ("error" in c) return { ok: false, error: c.error! };
  if (!integrations.paystack) return { ok: false, error: "Online payments aren't set up yet (PAYSTACK_SECRET_KEY). Contact ForgeOS to activate your plan." };
  const reference = `fos_${c.ctx.org.id.slice(0, 8)}_${randomBytes(8).toString("hex")}`;
  const { data, error } = await c.supabase.rpc("billing_start_checkout", { p_org: c.ctx.org.id, p_plan: plan, p_reference: reference });
  if (error) return { ok: false, error: friendlyError(error) };
  const d = data as { amount: number; email: string };
  try {
    const t = await initializeTransaction({
      email: d.email || c.ctx.user.email,
      amountNaira: Number(d.amount),
      reference,
      callbackUrl: `${appUrl()}/api/billing/paystack/callback`,
      plan: planCode(plan),
      metadata: { organization_id: c.ctx.org.id, plan, cancel_action: `${appUrl()}/admin/billing` },
    });
    return { ok: true, data: { redirect: t.authorization_url } };
  } catch (e) {
    console.error("[billing] initialize failed", e);
    return { ok: false, error: "Couldn't start the payment with Paystack. Try again in a moment." };
  }
}

export async function cancelSubscription(): Promise<R> {
  const c = await billingFreeActionContext("billing.manage");
  if ("error" in c) return { ok: false, error: c.error! };
  if (!integrations.paystack) return { ok: false, error: "Online payments aren't set up yet." };
  const admin = createAdminClient();
  const { data: s } = await admin.from("subscriptions").select("paystack_subscription_code, paystack_email_token").eq("organization_id", c.ctx.org.id).single();
  try {
    if (s?.paystack_subscription_code && s.paystack_email_token) await disableSubscription(s.paystack_subscription_code, s.paystack_email_token);
  } catch (e) {
    console.error("[billing] disable failed", e);
    return { ok: false, error: "Paystack couldn't cancel the subscription. Try again or contact support." };
  }
  const { error } = await admin.rpc("billing_update_subscription", { p_org: c.ctx.org.id, p: { cancel_at_period_end: true } });
  if (error) return { ok: false, error: friendlyError(error) };
  revalidatePath("/", "layout");
  return { ok: true, message: "Your plan won't renew. You keep access until the end of the paid period." };
}
