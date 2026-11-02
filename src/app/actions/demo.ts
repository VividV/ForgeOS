"use server";
import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/auth";
import { friendlyError, type ActionResult } from "@/lib/errors";

export async function openDemoWorkspace(): Promise<ActionResult<{ redirect?: string }>> {
  const { supabase, user } = await getSession();
  if (!user) return { ok: false, error: "Sign in first" };
  const { data: existing } = await supabase.rpc("my_organizations");
  const demo = ((existing ?? []) as { id: string; is_demo: boolean }[]).find((o) => o.is_demo);
  if (demo) {
    const { error } = await supabase.rpc("set_active_organization", { p_org: demo.id });
    if (error) return { ok: false, error: friendlyError(error) };
  } else {
    const { error } = await supabase.rpc("create_demo_organization");
    if (error) return { ok: false, error: friendlyError(error) };
  }
  revalidatePath("/", "layout");
  return { ok: true, data: { redirect: "/overview" }, message: demo ? "Switched to the demo workspace" : "Demo workspace ready" };
}

export async function leaveDemoWorkspace(orgId: string): Promise<ActionResult<{ redirect?: string }>> {
  const { supabase } = await getSession();
  const { error } = await supabase.rpc("leave_demo_organization", { p_org: orgId });
  if (error) return { ok: false, error: friendlyError(error) };
  revalidatePath("/", "layout");
  return { ok: true, data: { redirect: "/" }, message: "You've left the demo workspace" };
}
