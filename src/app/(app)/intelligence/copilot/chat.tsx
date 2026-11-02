"use client";
import { Check, SendHorizontal, Sparkles } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";
import { createRequisition } from "@/app/actions/procurement";
import { createProductionOrder } from "@/app/actions/production";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/form";

type Proposal = { kind: "requisition" | "production_order"; title: string; summary: string[]; payload: Record<string, unknown> };
type Msg = { role: "user" | "assistant"; content: string; proposals?: Proposal[]; error?: boolean };

const SUGGESTIONS = ["What needs my attention today?", "Which materials should I order this week?", "Where is the bottleneck in production?", "Which customer orders are at risk of being late?", "Anything unusual in the last few days?"];

function ProposalCard({ p }: { p: Proposal }) {
  const router = useRouter();
  const [state, setState] = React.useState<"idle" | "done">("idle");
  const [pending, start] = React.useTransition();
  const confirm = () =>
    start(async () => {
      const r = p.kind === "requisition" ? await createRequisition(p.payload) : await createProductionOrder(p.payload);
      if (!r.ok) return void toast.error(r.error);
      setState("done");
      toast.success(r.message ?? "Created");
      if (r.data?.redirect) router.push(r.data.redirect);
    });
  return (
    <div className="mt-2 rounded-lg border border-accent/40 bg-accent-soft/30 p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-accent-ink">Suggested {p.title.toLowerCase()}: not created yet</p>
      <ul className="mt-1 list-disc pl-5 text-[13px]">
        {p.summary.map((s) => (
          <li key={s}>{s}</li>
        ))}
      </ul>
      <div className="mt-2 flex gap-2">
        {state === "done" ? (
          <span className="flex items-center gap-1 text-[13px] text-success">
            <Check className="size-4" /> Created
          </span>
        ) : (
          <Button size="sm" variant="primary" loading={pending} onClick={confirm}>
            Create {p.title.toLowerCase()}
          </Button>
        )}
      </div>
    </div>
  );
}

export function CopilotChat({ configured }: { configured: boolean }) {
  const [msgs, setMsgs] = React.useState<Msg[]>([]);
  const [input, setInput] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const end = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => end.current?.scrollIntoView({ behavior: "smooth", block: "end" }), [msgs]);
  const ask = async (q: string) => {
    if (!q.trim() || busy) return;
    const next: Msg[] = [...msgs, { role: "user", content: q.trim() }];
    setMsgs(next);
    setInput("");
    setBusy(true);
    try {
      const res = await fetch("/api/copilot", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ messages: next.filter((m) => !m.error).map(({ role, content }) => ({ role, content })) }) });
      const j = (await res.json()) as { text?: string; proposals?: Proposal[]; error?: string };
      setMsgs((m) => [...m, res.ok ? { role: "assistant", content: j.text || "(no answer)", proposals: j.proposals } : { role: "assistant", content: j.error ?? "Something went wrong.", error: true }]);
    } catch {
      setMsgs((m) => [...m, { role: "assistant", content: "Couldn't reach ForgeOS. Check your connection.", error: true }]);
    } finally {
      setBusy(false);
    }
  };
  if (!configured)
    return (
      <div className="p-6 text-[13px]">
        <p className="font-medium">The AI copilot isn&apos;t switched on yet.</p>
        <p className="mt-1 text-muted">An administrator sets AI_BASE_URL, AI_API_KEY and AI_MODEL (any OpenAI-compatible provider). Until then, the rule-based alerts, forecasts and anomaly checks under Insights work without AI.</p>
        <Link href="/intelligence/insights" className="mt-3 inline-block font-medium text-accent-ink hover:underline">
          Open Insights
        </Link>
      </div>
    );
  return (
    <div className="flex min-h-[60vh] flex-col">
      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        {msgs.length === 0 && (
          <div className="py-6 text-center">
            <Sparkles className="mx-auto size-8 text-accent" />
            <p className="mt-2 text-sm font-medium">Ask about orders, stock, materials, quality or what needs attention.</p>
            <p className="text-xs text-muted">Answers use only what you can see in ForgeOS. Nothing changes unless you confirm it.</p>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              {SUGGESTIONS.map((s) => (
                <button key={s} onClick={() => ask(s)} className="rounded-full border border-line px-3 py-1.5 text-[13px] hover:border-accent/50 hover:bg-accent-soft/40">
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        {msgs.map((m, i) => (
          <div key={i} className={m.role === "user" ? "flex justify-end" : "flex justify-start"}>
            <div className={`max-w-[85%] rounded-xl px-3.5 py-2.5 text-[13px] ${m.role === "user" ? "bg-ink text-white" : m.error ? "bg-warning-soft text-warning-ink" : "bg-subtle text-ink"}`}>
              <p className="whitespace-pre-wrap">{m.content}</p>
              {m.proposals?.map((p, k) => <ProposalCard key={k} p={p} />)}
            </div>
          </div>
        ))}
        {busy && <p className="text-xs text-muted">Forge is checking your data…</p>}
        <div ref={end} />
      </div>
      <form
        className="flex items-end gap-2 border-t border-line p-3"
        onSubmit={(e) => {
          e.preventDefault();
          void ask(input);
        }}
      >
        <Textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void ask(input);
            }
          }}
          placeholder="Ask Forge…"
          aria-label="Ask the copilot"
          className="min-h-10 flex-1 resize-none"
          maxLength={4000}
        />
        <Button type="submit" variant="primary" loading={busy} aria-label="Send">
          <SendHorizontal />
        </Button>
      </form>
    </div>
  );
}
