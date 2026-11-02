import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getOrgContext, getSession } from "@/lib/auth";
import { CopilotProviderError, runCopilot } from "@/lib/copilot/engine";
import { copilotExecutor, copilotTools } from "@/lib/copilot/tools";
import { friendlyError } from "@/lib/errors";
import { todayIn } from "@/lib/format";
import { integrations, serverEnv } from "@/lib/server-env";

const body = z.object({ messages: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(4000) })).min(1).max(30) });

export async function POST(req: NextRequest) {
  const ctx = await getOrgContext();
  if (!ctx) return NextResponse.json({ error: "Sign in again." }, { status: 401 });
  if (!ctx.can("ai.use")) return NextResponse.json({ error: "You don't have access to the copilot." }, { status: 403 });
  if (!integrations.ai) return NextResponse.json({ error: "The AI copilot isn't configured yet.", fallback: true }, { status: 503 });
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const { supabase } = await getSession();
  const { data: reservation, error: rErr } = await supabase.rpc("ai_reserve_request", { p_org: ctx.org.id });
  if (rErr) return NextResponse.json({ error: friendlyError(rErr) }, { status: 429 });
  const usageId = (reservation as { usage_id: number }).usage_id;
  const system = [
    `You are Forge, the operations copilot inside ForgeOS for ${ctx.org.name}, a manufacturer. Today is ${todayIn(ctx.settings.timezone)} (${ctx.settings.timezone}). Money is in ${ctx.settings.currency}.`,
    "Answer from tool results only. Never invent numbers, orders, people or dates. If the tools don't cover something, say what you can't see.",
    "Alerts and anomalies come from fixed rules in ForgeOS; explain them, don't second-guess them without data.",
    "You cannot change anything yourself. To suggest a purchase requisition or production order, call the propose_* tool; the user confirms it in the app.",
    "Be brief and practical: lead with the answer, then at most a few bullet points. Use order numbers and material codes so people can find them.",
    ctx.can("costing.read") ? "" : "This user cannot see costs or margins; don't discuss them.",
  ].join("\n");
  try {
    const result = await runCopilot({
      provider: { baseUrl: serverEnv.AI_BASE_URL!, apiKey: serverEnv.AI_API_KEY!, model: serverEnv.AI_MODEL! },
      system,
      history: parsed.data.messages,
      tools: copilotTools(ctx),
      execute: copilotExecutor(ctx, supabase),
    });
    await supabase.rpc("ai_finish_request", { p_usage: usageId, p_model: serverEnv.AI_MODEL!, p_in: result.usage.input, p_out: result.usage.output, p_tools: result.usage.tools, p_ok: true });
    return NextResponse.json({ text: result.text, proposals: result.proposals, tools: result.toolsUsed });
  } catch (e) {
    await supabase.rpc("ai_finish_request", { p_usage: usageId, p_model: serverEnv.AI_MODEL!, p_in: 0, p_out: 0, p_tools: 0, p_ok: false });
    console.error("[copilot] provider failure", e instanceof Error ? e.message : e);
    const status = e instanceof CopilotProviderError ? e.status : 504;
    return NextResponse.json({ error: "The AI service isn't responding right now. The rule-based alerts and insights below still work.", fallback: true }, { status: status >= 500 ? 502 : 502 });
  }
}
