/**
 * Provider-independent copilot loop over any OpenAI-compatible Chat Completions API
 * (OpenAI, Anthropic's compatibility endpoint, OpenRouter, Groq, local servers…).
 * The model can only call the tools we pass; tools that change data return proposals that a person must confirm.
 */
export type ChatMessage =
  | { role: "system" | "user"; content: string }
  | { role: "assistant"; content: string | null; tool_calls?: ToolCall[] }
  | { role: "tool"; tool_call_id: string; content: string };
export type ToolCall = { id: string; type: "function"; function: { name: string; arguments: string } };
export type ToolDef = { name: string; description: string; parameters: Record<string, unknown> };
export type Proposal = { kind: "requisition" | "production_order"; title: string; summary: string[]; payload: Record<string, unknown> };
export type ToolResult = { data: unknown; proposal?: Proposal };
export type Provider = { baseUrl: string; apiKey: string; model: string };

export type CopilotResult = { text: string; proposals: Proposal[]; usage: { input: number; output: number; tools: number }; toolsUsed: string[] };

export async function runCopilot(opts: {
  provider: Provider;
  system: string;
  history: { role: "user" | "assistant"; content: string }[];
  tools: ToolDef[];
  execute: (name: string, args: Record<string, unknown>) => Promise<ToolResult>;
  fetchImpl?: typeof fetch;
  maxRounds?: number;
  timeoutMs?: number;
}): Promise<CopilotResult> {
  const f = opts.fetchImpl ?? fetch;
  const messages: ChatMessage[] = [{ role: "system", content: opts.system }, ...opts.history.slice(-12)];
  const proposals: Proposal[] = [];
  const usage = { input: 0, output: 0, tools: 0 };
  const toolsUsed: string[] = [];
  for (let round = 0; round < (opts.maxRounds ?? 6); round++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 45_000);
    let res: Response;
    try {
      res = await f(`${opts.provider.baseUrl.replace(/\/$/, "")}/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${opts.provider.apiKey}` },
        body: JSON.stringify({
          model: opts.provider.model,
          messages,
          tools: opts.tools.map((t) => ({ type: "function", function: t })),
          tool_choice: "auto",
          max_tokens: 1200,
          temperature: 0.2,
        }),
        signal: ctrl.signal,
      });
    } finally {
      clearTimeout(timer);
    }
    if (!res.ok) throw new CopilotProviderError(`AI provider returned ${res.status}`, res.status);
    const body = (await res.json()) as { choices?: { message?: { content?: string | null; tool_calls?: ToolCall[] } }[]; usage?: { prompt_tokens?: number; completion_tokens?: number } };
    usage.input += body.usage?.prompt_tokens ?? 0;
    usage.output += body.usage?.completion_tokens ?? 0;
    const msg = body.choices?.[0]?.message;
    if (!msg) throw new CopilotProviderError("AI provider returned no answer", 502);
    const calls = (msg.tool_calls ?? []).slice(0, 6);
    if (calls.length === 0) return { text: (msg.content ?? "").trim(), proposals, usage, toolsUsed };
    messages.push({ role: "assistant", content: msg.content ?? null, tool_calls: calls });
    for (const call of calls) {
      usage.tools++;
      toolsUsed.push(call.function.name);
      let out: ToolResult;
      try {
        const args = call.function.arguments ? (JSON.parse(call.function.arguments) as Record<string, unknown>) : {};
        out = opts.tools.some((t) => t.name === call.function.name) ? await opts.execute(call.function.name, args) : { data: { error: "Unknown tool" } };
      } catch (e) {
        out = { data: { error: e instanceof Error ? e.message : "Tool failed" } };
      }
      if (out.proposal) proposals.push(out.proposal);
      messages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify(out.data).slice(0, 12_000) });
    }
  }
  return { text: "I couldn't finish working that out. Try asking a narrower question.", proposals, usage, toolsUsed };
}

export class CopilotProviderError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}
