import { NextResponse, type NextRequest } from "next/server";
import { sendWhatsApp, validWhatsAppSignature } from "@/lib/whatsapp";
import { integrations, serverEnv } from "@/lib/server-env";
import { createAdminClient } from "@/lib/supabase/admin";

/** Meta's webhook verification handshake. */
export function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  if (serverEnv.WHATSAPP_VERIFY_TOKEN && sp.get("hub.mode") === "subscribe" && sp.get("hub.verify_token") === serverEnv.WHATSAPP_VERIFY_TOKEN) {
    return new NextResponse(sp.get("hub.challenge") ?? "", { status: 200 });
  }
  return new NextResponse("Forbidden", { status: 403 });
}

/** Incoming WhatsApp messages: commands from linked team members (HELP, STATUS PRD-…, JC-… 40). */
export async function POST(req: NextRequest) {
  if (!integrations.whatsapp || !serverEnv.WHATSAPP_APP_SECRET) return NextResponse.json({ error: "WhatsApp is not configured" }, { status: 503 });
  const raw = await req.text();
  if (!validWhatsAppSignature(raw, req.headers.get("x-hub-signature-256"))) return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  const payload = JSON.parse(raw) as { entry?: { changes?: { value?: { messages?: { from: string; type: string; text?: { body: string } }[] } }[] }[] };
  const admin = createAdminClient();
  for (const e of payload.entry ?? [])
    for (const c of e.changes ?? [])
      for (const m of c.value?.messages ?? []) {
        if (m.type !== "text" || !m.text?.body) continue;
        const phone = `+${m.from.replace(/\D/g, "")}`;
        const { data, error } = await admin.rpc("whatsapp_handle_message", { p_phone: phone, p_text: m.text.body.slice(0, 500) });
        await sendWhatsApp(phone, error ? "Sorry, something went wrong. Try again later." : String(data));
      }
  return NextResponse.json({ ok: true });
}
