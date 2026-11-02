import { NextResponse, type NextRequest } from "next/server";
import { recordPaystackCharge } from "@/lib/billing";
import { verifyTransaction } from "@/lib/paystack";

/** Paystack redirects here after checkout. We confirm the payment server-to-server before granting anything. */
export async function GET(req: NextRequest) {
  const ref = req.nextUrl.searchParams.get("reference") ?? req.nextUrl.searchParams.get("trxref");
  const back = (q: string) => NextResponse.redirect(new URL(`/admin/billing?${q}`, req.nextUrl.origin));
  if (!ref) return back("error=" + encodeURIComponent("Payment reference missing."));
  try {
    const t = await verifyTransaction(ref);
    if (t.status !== "success") return back("error=" + encodeURIComponent("The payment wasn't completed."));
    const r = await recordPaystackCharge(t);
    if (!r.ok) return back("error=" + encodeURIComponent(r.error));
    return back("paid=1");
  } catch (e) {
    console.error("[billing] callback failed", e);
    return back("error=" + encodeURIComponent("We couldn't confirm the payment yet. If you were charged, it will be applied within a few minutes."));
  }
}
