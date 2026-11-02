import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { appUrl } from "@/lib/env";
import { integrations, serverEnv } from "@/lib/server-env";
import { createAdminClient } from "@/lib/supabase/admin";

/** WhatsApp Cloud API (Meta). Free-form text is only delivered inside the 24-hour customer-service window;
 *  outside it Meta requires approved templates, so failures are recorded rather than retried forever. */
export async function sendWhatsApp(phone: string, body: string): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  if (!integrations.whatsapp) return { ok: false, error: "WhatsApp is not configured" };
  const res = await fetch(`https://graph.facebook.com/v21.0/${serverEnv.WHATSAPP_PHONE_NUMBER_ID}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${serverEnv.WHATSAPP_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", to: phone.replace(/^\+/, ""), type: "text", text: { body: body.slice(0, 4000), preview_url: false } }),
    cache: "no-store",
  });
  const j = (await res.json().catch(() => ({}))) as { messages?: { id: string }[]; error?: { message?: string } };
  if (!res.ok || !j.messages?.[0]?.id) return { ok: false, error: j.error?.message ?? `HTTP ${res.status}` };
  return { ok: true, id: j.messages[0].id };
}

export function validWhatsAppSignature(raw: string, header: string | null) {
  const secret = serverEnv.WHATSAPP_APP_SECRET;
  if (!secret || !header?.startsWith("sha256=")) return false;
  const expected = "sha256=" + createHmac("sha256", secret).update(raw).digest("hex");
  return expected.length === header.length && timingSafeEqual(Buffer.from(expected), Buffer.from(header));
}

/** Sends queued alert messages. Messages older than a day are skipped rather than delivered late. */
export async function flushWhatsAppOutbox(limit = 50) {
  if (!integrations.whatsapp || !serverEnv.SUPABASE_SERVICE_ROLE_KEY) return { sent: 0, failed: 0 };
  const admin = createAdminClient();
  await admin.from("whatsapp_outbox").update({ status: "skipped", error: "Too old to send" }).eq("status", "pending").lt("created_at", new Date(Date.now() - 86400000).toISOString());
  const { data } = await admin.from("whatsapp_outbox").select("id, phone, body, link, attempts").eq("status", "pending").order("created_at").limit(limit);
  let sent = 0;
  let failed = 0;
  for (const m of data ?? []) {
    const r = await sendWhatsApp(m.phone, m.link ? `${m.body}\n${appUrl()}${m.link}` : m.body);
    if (r.ok) sent++;
    else failed++;
    await admin
      .from("whatsapp_outbox")
      .update(r.ok ? { status: "sent", sent_at: new Date().toISOString(), provider_id: r.id, attempts: m.attempts + 1 } : { status: m.attempts + 1 >= 3 ? "failed" : "pending", error: r.error, attempts: m.attempts + 1 })
      .eq("id", m.id);
  }
  return { sent, failed };
}

/** Daily summary to everyone who asked for one (called once a day by the scheduled job). */
export async function sendDailySummaries() {
  if (!integrations.whatsapp || !serverEnv.SUPABASE_SERVICE_ROLE_KEY) return 0;
  const admin = createAdminClient();
  const { data: contacts } = await admin.from("whatsapp_contacts").select("organization_id, user_id, phone").eq("daily_summary", true);
  const byOrg = new Map<string, string>();
  for (const c of contacts ?? []) {
    if (!byOrg.has(c.organization_id)) {
      const { data } = await admin.rpc("whatsapp_daily_summary", { p_org: c.organization_id });
      byOrg.set(c.organization_id, String(data ?? ""));
    }
    await admin.from("whatsapp_outbox").insert({ organization_id: c.organization_id, user_id: c.user_id, phone: c.phone, body: byOrg.get(c.organization_id)!, link: "/overview" });
  }
  return (contacts ?? []).length;
}
