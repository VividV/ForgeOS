import "server-only";
import { serverEnv } from "@/lib/server-env";
import { txnMeta, type PaystackTxn } from "@/lib/paystack";
import { createAdminClient } from "@/lib/supabase/admin";

export function planForCode(code?: string | null) {
  if (!code) return null;
  if (code === serverEnv.PAYSTACK_PLAN_STARTER) return "starter";
  if (code === serverEnv.PAYSTACK_PLAN_GROWTH) return "growth";
  if (code === serverEnv.PAYSTACK_PLAN_PROFESSIONAL) return "professional";
  return null;
}

export async function orgForCustomer(customerCode?: string | null) {
  if (!customerCode) return null;
  const { data } = await createAdminClient().from("subscriptions").select("organization_id").eq("paystack_customer_code", customerCode).maybeSingle();
  return (data?.organization_id as string | undefined) ?? null;
}

/**
 * Applies a successful Paystack charge to the right organisation. The organisation comes from our own
 * pending checkout record (or the customer code for renewals), never only from data the payer controls,
 * and the amount must cover the plan price.
 */
export async function recordPaystackCharge(t: PaystackTxn & { plan?: { plan_code?: string } }): Promise<{ ok: true } | { ok: false; error: string }> {
  if (t.status !== "success") return { ok: false, error: "Payment not successful" };
  if (t.currency && t.currency !== "NGN") return { ok: false, error: "Unexpected currency" };
  const admin = createAdminClient();
  const { data: pending } = await admin.from("billing_payments").select("organization_id, plan_key, amount").eq("reference", t.reference).maybeSingle();
  let org = pending?.organization_id as string | undefined;
  let plan = (pending?.plan_key as string | undefined) ?? planForCode(t.plan?.plan_code) ?? undefined;
  if (!org) {
    org = (await orgForCustomer(t.customer?.customer_code)) ?? undefined;
    if (!org) return { ok: false, error: "No matching checkout for this payment" };
    if (!plan) {
      const { data: s } = await admin.from("subscriptions").select("plan_key").eq("organization_id", org).single();
      plan = s?.plan_key as string;
    }
  }
  const meta = txnMeta(t);
  if (meta.organization_id && meta.organization_id !== org) return { ok: false, error: "Payment belongs to a different organisation" };
  const { data: p } = await admin.from("plans").select("price_monthly").eq("key", plan).single();
  const paid = Number(t.amount) / 100;
  if (!p?.price_monthly || paid + 0.005 < Number(p.price_monthly)) return { ok: false, error: "Amount paid is less than the plan price" };
  const { error } = await admin.rpc("billing_record_payment", {
    p_org: org, p_reference: t.reference, p_plan: plan, p_amount: paid, p_paid_at: t.paid_at ?? new Date().toISOString(),
    p_customer_code: t.customer?.customer_code ?? null, p_email: t.customer?.email ?? null,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
