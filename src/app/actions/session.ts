"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { appUrl } from "@/lib/env";
import { friendlyError, zodFieldErrors, type ActionResult } from "@/lib/errors";
import { integrations } from "@/lib/server-env";
import { createClient } from "@/lib/supabase/server";

export async function switchOrganization(orgId: string): Promise<ActionResult> {
  if (!z.uuid().safeParse(orgId).success) return { ok: false, error: "Invalid organisation" };
  const { supabase } = await getSession();
  const { error } = await supabase.rpc("set_active_organization", { p_org: orgId });
  if (error) return { ok: false, error: friendlyError(error) };
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function signOut(): Promise<ActionResult> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  return { ok: true };
}

const safeNext = (n: unknown) => (typeof n === "string" && n.startsWith("/") && !n.startsWith("//") ? n : "/");

const signInSchema = z.object({
  email: z.email("Enter a valid email address"),
  password: z.string().min(1, "Enter your password"),
  next: z.string().optional(),
});

export async function signIn(values: Record<string, unknown>): Promise<ActionResult<{ redirect?: string }>> {
  const parsed = signInSchema.safeParse(values);
  if (!parsed.success) return { ok: false, error: "Check the highlighted fields", fieldErrors: zodFieldErrors(parsed.error.issues) };
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email: parsed.data.email.trim().toLowerCase(), password: parsed.data.password });
  if (error) {
    if (/confirm/i.test(error.message)) return { ok: false, error: "Please confirm your email address first. Check your inbox for the verification link." };
    if (error.status === 429) return { ok: false, error: "Too many attempts. Wait a minute and try again." };
    return { ok: false, error: "Incorrect email or password." };
  }
  return { ok: true, data: { redirect: safeNext(parsed.data.next) }, message: "Signed in" };
}

const passwordRule = z
  .string()
  .min(10, "Use at least 10 characters")
  .regex(/[A-Za-z]/, "Include at least one letter")
  .regex(/[0-9]/, "Include at least one number");

const signUpSchema = z.object({
  full_name: z.string().trim().min(2, "Enter your full name").max(120),
  email: z.email("Enter a valid work email"),
  password: passwordRule,
  next: z.string().optional(),
});

export async function signUp(values: Record<string, unknown>): Promise<ActionResult<{ redirect?: string }>> {
  const parsed = signUpSchema.safeParse(values);
  if (!parsed.success) return { ok: false, error: "Check the highlighted fields", fieldErrors: zodFieldErrors(parsed.error.issues) };
  const supabase = await createClient();
  const next = safeNext(parsed.data.next);
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email.trim().toLowerCase(),
    password: parsed.data.password,
    options: {
      data: { full_name: parsed.data.full_name },
      emailRedirectTo: `${appUrl()}/auth/confirm?next=${encodeURIComponent(next === "/" ? "/onboarding" : next)}`,
    },
  });
  if (error) {
    if (error.status === 429) return { ok: false, error: "Too many sign-up attempts. Try again shortly." };
    if (/registered|exists/i.test(error.message)) return { ok: false, error: "An account with this email already exists. Sign in instead." };
    if (/password/i.test(error.message)) return { ok: false, error: error.message };
    return { ok: false, error: "We couldn't create your account. Try again." };
  }
  // With email confirmation enabled, no session is returned until the link is clicked.
  if (!data.session) return { ok: true, data: { redirect: `/auth/check-email?email=${encodeURIComponent(parsed.data.email)}` } };
  return { ok: true, data: { redirect: next === "/" ? "/onboarding" : next }, message: "Account created" };
}

export async function requestPasswordReset(values: Record<string, unknown>): Promise<ActionResult> {
  const parsed = z.object({ email: z.email("Enter a valid email") }).safeParse(values);
  if (!parsed.success) return { ok: false, error: "Enter a valid email", fieldErrors: zodFieldErrors(parsed.error.issues) };
  const supabase = await createClient();
  await supabase.auth.resetPasswordForEmail(parsed.data.email.trim().toLowerCase(), {
    redirectTo: `${appUrl()}/auth/confirm?next=/account/password`,
  });
  // Same response whether or not the account exists (no account enumeration).
  return { ok: true, message: "If an account exists for that email, a reset link is on its way." };
}

export async function updatePassword(values: Record<string, unknown>): Promise<ActionResult<{ redirect?: string }>> {
  const parsed = z.object({ password: passwordRule }).safeParse(values);
  if (!parsed.success) return { ok: false, error: "Check the password rules", fieldErrors: zodFieldErrors(parsed.error.issues) };
  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) return { ok: false, error: error.message };
  return { ok: true, message: "Password updated", data: { redirect: "/" } };
}

export async function updateProfile(values: Record<string, unknown>): Promise<ActionResult> {
  const parsed = z.object({ full_name: z.string().trim().min(2).max(120), phone: z.string().trim().max(40).optional() }).safeParse(values);
  if (!parsed.success) return { ok: false, error: "Check the highlighted fields", fieldErrors: zodFieldErrors(parsed.error.issues) };
  const { supabase, user } = await getSession();
  if (!user) return { ok: false, error: "Sign in again" };
  const { error } = await supabase.from("profiles").update({ full_name: parsed.data.full_name, phone: parsed.data.phone || null }).eq("id", user.id);
  if (error) return { ok: false, error: friendlyError(error) };
  revalidatePath("/", "layout");
  return { ok: true, message: "Profile updated" };
}

export async function signInWithGoogle(next?: string) {
  if (!integrations.google) return { ok: false, error: "Google sign-in is not configured" } as const;
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: `${appUrl()}/auth/callback?next=${encodeURIComponent(safeNext(next))}` },
  });
  if (error || !data.url) return { ok: false, error: "Could not start Google sign-in" } as const;
  redirect(data.url);
}
