import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { serverEnv } from "@/lib/server-env";

/** Minimal Paystack client (https://paystack.com/docs/api). Amounts are sent in kobo. */
const BASE = "https://api.paystack.co";

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const key = serverEnv.PAYSTACK_SECRET_KEY;
  if (!key) throw new Error("Paystack is not configured");
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", ...(init?.headers ?? {}) },
    cache: "no-store",
  });
  const body = (await res.json().catch(() => ({}))) as { status?: boolean; message?: string; data?: T };
  if (!res.ok || !body.status) throw new Error(body.message || `Paystack error ${res.status}`);
  return body.data as T;
}

export const planCode = (plan: string) =>
  ({ starter: serverEnv.PAYSTACK_PLAN_STARTER, growth: serverEnv.PAYSTACK_PLAN_GROWTH, professional: serverEnv.PAYSTACK_PLAN_PROFESSIONAL })[plan];

export function initializeTransaction(p: { email: string; amountNaira: number; reference: string; callbackUrl: string; plan?: string; metadata: Record<string, unknown> }) {
  return call<{ authorization_url: string; reference: string }>("/transaction/initialize", {
    method: "POST",
    body: JSON.stringify({
      email: p.email,
      amount: Math.round(p.amountNaira * 100),
      currency: "NGN",
      reference: p.reference,
      callback_url: p.callbackUrl,
      ...(p.plan ? { plan: p.plan } : {}),
      metadata: p.metadata,
    }),
  });
}

export type PaystackTxn = {
  status: string;
  reference: string;
  amount: number;
  currency: string;
  paid_at: string | null;
  metadata: { organization_id?: string; plan?: string } | string | null;
  customer: { email: string; customer_code: string };
};
export const verifyTransaction = (reference: string) => call<PaystackTxn>(`/transaction/verify/${encodeURIComponent(reference)}`);

export const disableSubscription = (code: string, token: string) =>
  call<unknown>("/subscription/disable", { method: "POST", body: JSON.stringify({ code, token }) });

/** Paystack signs webhooks with HMAC-SHA512 of the raw body using the secret key. */
export function validSignature(raw: string, signature: string | null) {
  const key = serverEnv.PAYSTACK_SECRET_KEY;
  if (!key || !signature) return false;
  const expected = createHmac("sha512", key).update(raw).digest("hex");
  return expected.length === signature.length && timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
}

export function txnMeta(t: PaystackTxn): { organization_id?: string; plan?: string } {
  if (!t.metadata) return {};
  if (typeof t.metadata === "string") {
    try {
      return JSON.parse(t.metadata);
    } catch {
      return {};
    }
  }
  return t.metadata;
}
