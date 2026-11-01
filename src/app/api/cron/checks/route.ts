import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { serverEnv } from "@/lib/server-env";

/**
 * Scheduled operational checks (overdue orders → notifications).
 * Called by Vercel Cron (see vercel.json) with `Authorization: Bearer $CRON_SECRET`.
 * Low-stock alerts are raised immediately inside stock movements, not here.
 */
export async function GET(req: NextRequest) {
  const secret = serverEnv.CRON_SECRET;
  const got = (req.headers.get("authorization") ?? "").replace(/^Bearer /, "");
  if (!secret || got.length !== secret.length || !timingSafeEqual(Buffer.from(got), Buffer.from(secret))) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }
  if (!serverEnv.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY is not configured; scheduled checks are disabled." }, { status: 503 });
  }
  const { data, error } = await createAdminClient().rpc("run_scheduled_checks");
  if (error) {
    console.error("[cron] run_scheduled_checks failed", error);
    return NextResponse.json({ error: "Checks failed" }, { status: 500 });
  }
  return NextResponse.json({ ok: true, result: data });
}
