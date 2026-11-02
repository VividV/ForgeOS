import { createHash } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { orgForCustomer, recordPaystackCharge } from "@/lib/billing";
import { validSignature, type PaystackTxn } from "@/lib/paystack";
import { createAdminClient } from "@/lib/supabase/admin";

/** Paystack webhooks: renewals, subscription changes and failed payments. Signed and idempotent. */
export async function POST(req: NextRequest) {
  const raw = await req.text();
  if (!validSignature(raw, req.headers.get("x-paystack-signature"))) return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  const evt = JSON.parse(raw) as { event: string; data: Record<string, unknown> };
  const admin = createAdminClient();
  const id = createHash("sha256").update(raw).digest("hex");
  const { error: dup } = await admin.from("billing_events").insert({ id, event: evt.event, payload: evt });
  if (dup) return NextResponse.json({ ok: true, duplicate: true });
  const d = evt.data as Record<string, unknown> & { customer?: { customer_code?: string }; subscription_code?: string; email_token?: string; plan?: { plan_code?: string } };
  try {
    if (evt.event === "charge.success") {
      const r = await recordPaystackCharge(d as unknown as PaystackTxn);
      if (!r.ok) console.warn("[billing] charge not applied", r.error);
    } else if (evt.event === "subscription.create") {
      const org = await orgForCustomer(d.customer?.customer_code);
      if (org) await admin.rpc("billing_update_subscription", { p_org: org, p: { subscription_code: d.subscription_code, email_token: d.email_token, customer_code: d.customer?.customer_code } });
    } else if (evt.event === "subscription.not_renew" || evt.event === "subscription.disable") {
      const org = await orgForCustomer(d.customer?.customer_code);
      if (org) await admin.rpc("billing_update_subscription", { p_org: org, p: evt.event === "subscription.disable" ? { status: "cancelled", cancel_at_period_end: true } : { cancel_at_period_end: true } });
    } else if (evt.event === "invoice.payment_failed") {
      const org = await orgForCustomer(d.customer?.customer_code);
      if (org) await admin.rpc("billing_update_subscription", { p_org: org, p: { status: "past_due" } });
    }
  } catch (e) {
    console.error("[billing] webhook handling failed", evt.event, e);
    return NextResponse.json({ error: "Processing failed" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
