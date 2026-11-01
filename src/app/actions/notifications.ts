"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { actionContext } from "@/lib/auth";
import { friendlyError, type ActionResult } from "@/lib/errors";

export async function markNotificationRead(id: string): Promise<ActionResult> {
  if (!z.uuid().safeParse(id).success) return { ok: false, error: "Invalid notification" };
  const c = await actionContext();
  if ("error" in c) return { ok: false, error: c.error! };
  const { error } = await c.supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("id", id).eq("user_id", c.ctx.user.id);
  if (error) return { ok: false, error: friendlyError(error) };
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function markAllNotificationsRead(): Promise<ActionResult> {
  const c = await actionContext();
  if ("error" in c) return { ok: false, error: c.error! };
  const { error } = await c.supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("organization_id", c.ctx.org.id)
    .eq("user_id", c.ctx.user.id)
    .is("read_at", null);
  if (error) return { ok: false, error: friendlyError(error) };
  revalidatePath("/", "layout");
  return { ok: true };
}
