import { describe, expect, it } from "vitest";
import { CopilotProviderError, runCopilot, type ToolDef } from "@/lib/copilot/engine";

const provider = { baseUrl: "https://ai.example.test/v1", apiKey: "k", model: "m" };
const tools: ToolDef[] = [
  { name: "list_alerts", description: "alerts", parameters: { type: "object", properties: {} } },
  { name: "propose_purchase_requisition", description: "propose", parameters: { type: "object", properties: {} } },
];

function fakeFetch(replies: unknown[]) {
  const sent: { messages: { role: string; content?: string; tool_call_id?: string }[]; tools: unknown[] }[] = [];
  const f = (async (_url: string, init: RequestInit) => {
    sent.push(JSON.parse(String(init.body)));
    const r = replies.shift();
    if (r instanceof Response) return r;
    return new Response(JSON.stringify(r), { status: 200, headers: { "Content-Type": "application/json" } });
  }) as unknown as typeof fetch;
  return { f, sent };
}

describe("copilot engine", () => {
  it("runs tools the model asks for, feeds results back, and returns the answer with any proposals", async () => {
    const { f, sent } = fakeFetch([
      { choices: [{ message: { content: null, tool_calls: [{ id: "c1", type: "function", function: { name: "list_alerts", arguments: "{}" } }, { id: "c2", type: "function", function: { name: "propose_purchase_requisition", arguments: '{"lines":[{"code":"FAB","quantity":10}]}' } }] } }], usage: { prompt_tokens: 100, completion_tokens: 20 } },
      { choices: [{ message: { content: "PRD-00002 is late. I've prepared a requisition for 10 m of fabric." } }], usage: { prompt_tokens: 150, completion_tokens: 30 } },
    ]);
    const calls: string[] = [];
    const r = await runCopilot({
      provider,
      system: "sys",
      history: [{ role: "user", content: "What needs attention?" }],
      tools,
      fetchImpl: f,
      execute: async (name) => {
        calls.push(name);
        return name === "list_alerts"
          ? { data: [{ kind: "overdue", title: "PRD-00002 is overdue" }] }
          : { data: { prepared: true }, proposal: { kind: "requisition", title: "Purchase requisition", summary: ["Fabric: 10 m"], payload: {} } };
      },
    });
    expect(calls).toEqual(["list_alerts", "propose_purchase_requisition"]);
    expect(r.text).toMatch(/PRD-00002 is late/);
    expect(r.proposals).toHaveLength(1);
    expect(r.usage).toEqual({ input: 250, output: 50, tools: 2 });
    // tool results were sent back to the model with the right ids, and the tool list was offered
    const second = sent[1].messages;
    expect(second.filter((m) => m.role === "tool").map((m) => m.tool_call_id)).toEqual(["c1", "c2"]);
    expect(JSON.stringify(second)).toContain("PRD-00002 is overdue");
    expect(sent[0].tools).toHaveLength(2);
    expect(sent[0].messages[0]).toMatchObject({ role: "system", content: "sys" });
  });

  it("refuses tools it wasn't given and survives tool errors", async () => {
    const { f, sent } = fakeFetch([
      { choices: [{ message: { content: null, tool_calls: [{ id: "x", type: "function", function: { name: "delete_everything", arguments: "{}" } }, { id: "y", type: "function", function: { name: "list_alerts", arguments: "not json" } }] } }] },
      { choices: [{ message: { content: "Done." } }] },
    ]);
    let executed = 0;
    const r = await runCopilot({ provider, system: "s", history: [{ role: "user", content: "hi" }], tools, fetchImpl: f, execute: async () => ((executed++), { data: 1 }) });
    expect(executed).toBe(0);
    expect(r.text).toBe("Done.");
    const toolMsgs = sent[1].messages.filter((m) => m.role === "tool").map((m) => m.content);
    expect(toolMsgs[0]).toContain("Unknown tool");
    expect(toolMsgs[1]).toContain("error");
  });

  it("raises a provider error when the AI service fails, so the app can fall back", async () => {
    const { f } = fakeFetch([new Response("busy", { status: 503 })]);
    await expect(runCopilot({ provider, system: "s", history: [{ role: "user", content: "hi" }], tools, fetchImpl: f, execute: async () => ({ data: null }) })).rejects.toBeInstanceOf(CopilotProviderError);
  });

  it("stops after the round limit instead of looping forever", async () => {
    const loop = { choices: [{ message: { content: null, tool_calls: [{ id: "a", type: "function", function: { name: "list_alerts", arguments: "{}" } }] } }] };
    const { f } = fakeFetch([loop, loop, loop]);
    const r = await runCopilot({ provider, system: "s", history: [{ role: "user", content: "hi" }], tools, fetchImpl: f, maxRounds: 3, execute: async () => ({ data: [] }) });
    expect(r.text).toMatch(/couldn't finish/);
  });
});
