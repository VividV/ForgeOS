import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Handles email confirmation and password-recovery links. Works with both:
 * - custom templates using the token-hash flow (?token_hash=…&type=…), which work in any browser, and
 * - Supabase's default templates ({{ .ConfirmationURL }}), which verify the email and then redirect
 *   here with a PKCE ?code=… (only exchangeable in the browser that started sign-up).
 */
export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type") as EmailOtpType | null;
  const code = url.searchParams.get("code");
  const nextParam = url.searchParams.get("next") ?? "/";
  const next = nextParam.startsWith("/") && !nextParam.startsWith("//") ? nextParam : "/";
  const fail = (msg: string, param = "error") => NextResponse.redirect(new URL(`/login?${param}=` + encodeURIComponent(msg), url.origin));

  if (tokenHash && type) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error) return NextResponse.redirect(new URL(type === "recovery" ? "/account/password" : next, url.origin));
    return fail("That link is invalid or has expired.");
  }
  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(next, url.origin));
    // Supabase already confirmed the email before redirecting here; the code can only be used in the
    // browser where sign-up started. Ask the person to sign in instead of showing an error.
    if (next === "/account/password") return fail("Open the reset link in the same browser you requested it from, or request a new one.");
    return fail("Your email is confirmed. Sign in to continue.", "notice");
  }
  if (url.searchParams.get("error_description")) return fail(url.searchParams.get("error_description")!);
  return fail("That link is invalid or has expired.");
}
