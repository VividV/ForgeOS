"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { actionContext, getSession } from "@/lib/auth";
import { inviteEmail, sendEmail } from "@/lib/email";
import { appUrl } from "@/lib/env";
import { friendlyError, zodFieldErrors, type ActionResult } from "@/lib/errors";

const inviteSchema = z.object({ email: z.email("Enter a valid email"), role_id: z.uuid("Choose a role") });

export async function inviteMember(values: Record<string, unknown>): Promise<ActionResult<{ link?: string; emailed?: boolean }>> {
  const parsed = inviteSchema.safeParse(values);
  if (!parsed.success) return { ok: false, error: "Check the highlighted fields", fieldErrors: zodFieldErrors(parsed.error.issues) };
  const c = await actionContext("team.manage");
  if ("error" in c) return { ok: false, error: c.error! };
  const { data, error } = await c.supabase.rpc("create_invitation", { p_org: c.ctx.org.id, p_email: parsed.data.email, p_role: parsed.data.role_id });
  if (error) return { ok: false, error: friendlyError(error) };
  const token = (data as { token: string }[])[0].token;
  const link = `${appUrl()}/invite/${token}`;
  const { data: role } = await c.supabase.from("roles").select("name").eq("id", parsed.data.role_id).single();
  const mail = inviteEmail(c.ctx.org.name, role?.name ?? "team member", c.ctx.profile.full_name || c.ctx.user.email, link);
  const sent = await sendEmail(parsed.data.email, mail.subject, mail.text, mail.html);
  revalidatePath("/admin/team");
  return {
    ok: true,
    data: { link: sent.sent ? undefined : link, emailed: sent.sent },
    message: sent.sent ? `Invitation emailed to ${parsed.data.email}` : "Invitation created. Email isn't configured, so share the link below.",
  };
}

export async function acceptInvitation(token: string): Promise<ActionResult<{ redirect?: string }>> {
  if (typeof token !== "string" || token.length < 20 || token.length > 128) return { ok: false, error: "Invalid invitation" };
  const { supabase, user } = await getSession();
  if (!user) return { ok: false, error: "Sign in first" };
  const { error } = await supabase.rpc("accept_invitation", { p_token: token });
  if (error) return { ok: false, error: friendlyError(error) };
  revalidatePath("/", "layout");
  return { ok: true, data: { redirect: "/" } };
}

export async function revokeInvitation(id: string): Promise<ActionResult> {
  const c = await actionContext("team.manage");
  if ("error" in c) return { ok: false, error: c.error! };
  const { error } = await c.supabase.rpc("revoke_invitation", { p_invitation: id });
  if (error) return { ok: false, error: friendlyError(error) };
  revalidatePath("/admin/team");
  return { ok: true, message: "Invitation revoked" };
}

export async function setMemberRoles(memberId: string, roleIds: string[]): Promise<ActionResult> {
  if (!z.uuid().safeParse(memberId).success || !z.array(z.uuid()).min(1).safeParse(roleIds).success) return { ok: false, error: "Choose at least one role" };
  const c = await actionContext("team.manage");
  if ("error" in c) return { ok: false, error: c.error! };
  const { error } = await c.supabase.rpc("set_member_roles", { p_member: memberId, p_roles: roleIds });
  if (error) return { ok: false, error: friendlyError(error) };
  revalidatePath("/admin/team");
  return { ok: true, message: "Roles updated" };
}

const memberSchema = z.object({
  status: z.enum(["active", "suspended", "removed"]),
  job_title: z.string().max(80).optional().default(""),
  factory_id: z.union([z.uuid(), z.literal("")]).optional(),
});

export async function updateMember(memberId: string, values: Record<string, unknown>): Promise<ActionResult> {
  const parsed = memberSchema.safeParse(values);
  if (!parsed.success) return { ok: false, error: "Check the highlighted fields", fieldErrors: zodFieldErrors(parsed.error.issues) };
  const c = await actionContext("team.manage");
  if ("error" in c) return { ok: false, error: c.error! };
  const { error } = await c.supabase.rpc("update_member", {
    p_member: memberId,
    p_status: parsed.data.status,
    p_job_title: parsed.data.job_title ?? "",
    p_factory: parsed.data.factory_id || null,
  });
  if (error) return { ok: false, error: friendlyError(error) };
  revalidatePath("/admin/team");
  return { ok: true, message: "Member updated" };
}

export async function saveRolePermissions(roleId: string, permissions: string[]): Promise<ActionResult> {
  if (!z.uuid().safeParse(roleId).success || !z.array(z.string().regex(/^[a-z_]+\.[a-z_]+$/)).safeParse(permissions).success) {
    return { ok: false, error: "Invalid permissions" };
  }
  const c = await actionContext("roles.manage");
  if ("error" in c) return { ok: false, error: c.error! };
  const { error } = await c.supabase.rpc("set_role_permissions", { p_role: roleId, p_permissions: permissions });
  if (error) return { ok: false, error: friendlyError(error) };
  revalidatePath("/admin/roles");
  return { ok: true, message: "Permissions saved" };
}

const roleSchema = z.object({
  name: z.string().trim().min(2, "Name the role").max(60),
  description: z.string().trim().max(240).optional(),
});

export async function createRole(values: Record<string, unknown>): Promise<ActionResult<{ redirect?: string }>> {
  const parsed = roleSchema.safeParse(values);
  if (!parsed.success) return { ok: false, error: "Check the highlighted fields", fieldErrors: zodFieldErrors(parsed.error.issues) };
  const c = await actionContext("roles.manage");
  if ("error" in c) return { ok: false, error: c.error! };
  const key = parsed.data.name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 30) || "role";
  const { data, error } = await c.supabase
    .from("roles")
    .insert({ organization_id: c.ctx.org.id, key: `custom_${key}`, name: parsed.data.name, description: parsed.data.description || null })
    .select("id")
    .single();
  if (error) return { ok: false, error: error.code === "23505" ? "A role with this name already exists" : friendlyError(error) };
  revalidatePath("/admin/roles");
  return { ok: true, message: "Role created", data: { redirect: `/admin/roles?role=${data.id}` } };
}

export async function deleteRole(roleId: string): Promise<ActionResult> {
  const c = await actionContext("roles.manage");
  if ("error" in c) return { ok: false, error: c.error! };
  const { count } = await c.supabase.from("member_roles").select("member_id", { count: "exact", head: true }).eq("role_id", roleId);
  if (count && count > 0) return { ok: false, error: "This role is still assigned to members. Reassign them first." };
  const { error, count: deleted } = await c.supabase.from("roles").delete({ count: "exact" }).eq("id", roleId).eq("is_system", false);
  if (error) return { ok: false, error: friendlyError(error) };
  if (!deleted) return { ok: false, error: "System roles cannot be deleted" };
  revalidatePath("/admin/roles");
  return { ok: true, message: "Role deleted" };
}
