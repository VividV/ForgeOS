import "server-only";
import { integrations, serverEnv } from "@/lib/server-env";

export type EmailResult = { sent: boolean; reason?: string };

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

/**
 * Transactional email through Resend. When RESEND_API_KEY / EMAIL_FROM are not
 * configured this returns { sent: false } and callers fall back (e.g. showing a
 * copyable invite link). It never pretends an email was sent.
 */
export async function sendEmail(to: string, subject: string, text: string, html?: string): Promise<EmailResult> {
  if (!integrations.email) return { sent: false, reason: "Email is not configured" };
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${serverEnv.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: serverEnv.EMAIL_FROM, to, subject, text, html }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return { sent: false, reason: `Email provider returned ${res.status}` };
    return { sent: true };
  } catch (e) {
    return { sent: false, reason: (e as Error).message };
  }
}

export function inviteEmail(orgName: string, roleName: string, inviter: string, link: string) {
  const subject = `${inviter} invited you to ${orgName} on ForgeOS`;
  const text = `${inviter} has invited you to join ${orgName} on ForgeOS as ${roleName}.\n\nAccept the invitation: ${link}\n\nThis link expires in 14 days.`;
  const html = `<div style="font-family:Inter,Arial,sans-serif;font-size:14px;color:#20252B;max-width:480px">
  <p><strong>${escapeHtml(inviter)}</strong> has invited you to join <strong>${escapeHtml(orgName)}</strong> on ForgeOS as ${escapeHtml(roleName)}.</p>
  <p><a href="${escapeHtml(link)}" style="display:inline-block;background:#E87532;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none">Accept invitation</a></p>
  <p style="color:#646c78;font-size:12px">This link expires in 14 days. If you weren't expecting it, you can ignore this email.</p></div>`;
  return { subject, text, html };
}
