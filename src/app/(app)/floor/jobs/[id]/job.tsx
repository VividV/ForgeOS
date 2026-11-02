"use client";
import { ArrowLeft, Check, MessageSquare, Pause, Play, PackageX, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/misc";
import { jobCardAction } from "@/app/actions/production";
import { formatQty } from "@/lib/format";
import { enqueue, isNetworkError } from "@/lib/offline-queue";
import { idempotencyKey } from "@/lib/utils";

export type FloorJobData = {
  id: string; code: string; status: string; target_quantity: number; quantity_completed: number; quantity_rejected: number; instructions: string | null;
  order: { number: string; status: string; due_date: string | null; notes: string | null };
  product: { name: string; code: string; description: string | null; variant: string; size: string | null; colour: string | null; uom: string };
  operation: { name: string; sequence: number; instructions: string | null; requires_quality_check: boolean; work_centre: string | null; quantity_completed: number };
  materials: { name: string; uom: string; per_unit: number; required: number; issued: number }[] | null;
};

type Mode = null | "progress" | "defect" | "shortage" | "note" | "complete";

export function FloorJob({ job }: { job: FloorJobData }) {
  const router = useRouter();
  const [mode, setMode] = React.useState<Mode>(null);
  const [good, setGood] = React.useState("");
  const [rejected, setRejected] = React.useState("");
  const [msg, setMsg] = React.useState("");
  const [pending, start] = React.useTransition();
  // optimistic local tally so offline updates are reflected immediately
  const [extra, setExtra] = React.useState({ good: 0, rejected: 0, status: null as string | null });
  // fresh figures from the server already include anything that has synced: drop the local tally
  const serverKey = `${job.quantity_completed}|${job.quantity_rejected}|${job.status}`;
  const [seenKey, setSeenKey] = React.useState(serverKey);
  if (seenKey !== serverKey) {
    setSeenKey(serverKey);
    setExtra({ good: 0, rejected: 0, status: null });
  }

  const done = Number(job.quantity_completed) + extra.good;
  const rej = Number(job.quantity_rejected) + extra.rejected;
  const status = extra.status ?? job.status;
  const closed = status === "completed" || status === "cancelled";

  const send = (values: Record<string, unknown>, label: string) =>
    start(async () => {
      const client_ref = idempotencyKey();
      // queued = saved on the phone only: count it locally until it syncs. Once the server has it,
      // the refreshed job already includes it, so only the status is carried over.
      const apply = (queued: boolean) => {
        setExtra((e) => ({
          good: e.good + (queued && values.action !== "defect" ? Number(values.good ?? 0) : 0),
          rejected: e.rejected + (queued ? Number(values.rejected ?? 0) : 0),
          status: values.action === "complete" ? "completed" : values.action === "pause" ? "paused" : values.action === "start" || values.action === "resume" || values.action === "progress" ? "in_progress" : e.status,
        }));
        setMode(null);
        setGood("");
        setRejected("");
        setMsg("");
      };
      try {
        const r = await jobCardAction(job.id, { ...values, client_ref });
        if (!r.ok) return void toast.error(r.error);
        toast.success(label);
        apply(false);
        router.refresh();
      } catch (e) {
        if (isNetworkError(e)) {
          enqueue({ client_ref, card_id: job.id, card_code: job.code, values });
          toast.message("Saved on this phone. It will sync when you're back online.");
          apply(true);
        } else {
          toast.error("Couldn't save. Try again.");
        }
      }
    });

  const big = "h-16 text-base";

  return (
    <div className="flex flex-col gap-4 pb-24">
      <Link href="/floor" className="inline-flex items-center gap-1 text-[13px] text-muted">
        <ArrowLeft className="size-4" /> My jobs
      </Link>
      <div className="rounded-xl border border-line bg-surface p-5 shadow-card">
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs text-muted">{job.code}</span>
          <Badge tone={status === "in_progress" ? "accent" : status === "completed" ? "success" : status === "paused" ? "warning" : "neutral"}>{status.replace("_", " ")}</Badge>
          {job.operation.requires_quality_check && <Badge tone="success">Quality check</Badge>}
        </div>
        <h1 className="mt-2 text-xl font-semibold">
          {job.operation.sequence}. {job.operation.name}
        </h1>
        <p className="text-[14px] text-ink-soft">
          {job.product.name}
          {job.product.variant !== "Standard" ? ` · ${job.product.variant}` : ""} · {job.order.number}
        </p>
        <div className="mt-4">
          <div className="flex items-end justify-between">
            <span className="tabular text-3xl font-semibold">{formatQty(done)}</span>
            <span className="tabular text-sm text-muted">
              of {formatQty(job.target_quantity)} {job.product.uom}
            </span>
          </div>
          <Progress value={(done / Number(job.target_quantity)) * 100} className="mt-2 h-2.5" />
          {rej > 0 && <p className="mt-1 text-[13px] text-danger-ink">{formatQty(rej)} rejected</p>}
        </div>
      </div>

      {(job.operation.instructions || job.instructions || job.product.description) && (
        <div className="rounded-xl border border-line bg-surface p-4 text-[14px]">
          <h2 className="mb-1 text-xs font-semibold uppercase text-muted">Instructions</h2>
          {job.operation.instructions && <p>{job.operation.instructions}</p>}
          {job.instructions && <p className="mt-1">{job.instructions}</p>}
          {job.product.description && <p className="mt-1 text-ink-soft">{job.product.description}</p>}
        </div>
      )}

      {!closed && mode === null && (
        <div className="grid grid-cols-2 gap-3">
          {(status === "open" || status === "paused") && (
            <Button variant="primary" className={`col-span-2 ${big}`} loading={pending} onClick={() => send({ action: status === "paused" ? "resume" : "start" }, "Job started")}>
              <Play /> {status === "paused" ? "Resume job" : "Start job"}
            </Button>
          )}
          {status === "in_progress" && (
            <>
              <Button variant="primary" className={`col-span-2 ${big}`} onClick={() => setMode("progress")}>
                <Check /> Record completed
              </Button>
              <Button className={big} onClick={() => setMode("defect")}>
                <TriangleAlert /> Report defect
              </Button>
              <Button className={big} onClick={() => setMode("shortage")}>
                <PackageX /> Material short
              </Button>
              <Button className={big} onClick={() => send({ action: "pause" }, "Job paused")} loading={pending}>
                <Pause /> Pause
              </Button>
              <Button className={big} onClick={() => setMode("note")}>
                <MessageSquare /> Add note
              </Button>
              <Button variant="dark" className={`col-span-2 ${big}`} onClick={() => setMode("complete")}>
                Finish job
              </Button>
            </>
          )}
        </div>
      )}

      {mode && (
        <div className="rounded-xl border border-accent/40 bg-surface p-4 shadow-card">
          <h2 className="mb-3 text-base font-semibold">
            {{ progress: "How many did you complete?", defect: "Report defective units", shortage: "Which material is short?", note: "Add a note", complete: "Finish this job" }[mode]}
          </h2>
          {(mode === "progress" || mode === "complete") && (
            <label className="mb-3 block">
              <span className="text-[13px] text-muted">{mode === "complete" ? "Any more completed units? (optional)" : "Good units"}</span>
              <input inputMode="numeric" type="number" min="0" value={good} onChange={(e) => setGood(e.target.value)} autoFocus className="tabular mt-1 h-16 w-full rounded-lg border border-line-strong px-4 text-3xl font-semibold focus:border-accent focus:outline-none" />
            </label>
          )}
          {(mode === "defect" || mode === "progress") && (
            <label className="mb-3 block">
              <span className="text-[13px] text-muted">Rejected / defective units</span>
              <input inputMode="numeric" type="number" min="0" value={rejected} onChange={(e) => setRejected(e.target.value)} autoFocus={mode === "defect"} className="tabular mt-1 h-14 w-full rounded-lg border border-line-strong px-4 text-2xl focus:border-accent focus:outline-none" />
            </label>
          )}
          {mode !== "progress" && mode !== "complete" ? (
            <label className="mb-3 block">
              <span className="text-[13px] text-muted">{mode === "shortage" ? "Material and how much is missing" : mode === "defect" ? "What's wrong?" : "Note"}</span>
              <textarea value={msg} onChange={(e) => setMsg(e.target.value)} autoFocus={mode !== "defect"} className="mt-1 min-h-24 w-full rounded-lg border border-line-strong p-3 text-base focus:border-accent focus:outline-none" />
            </label>
          ) : null}
          <div className="grid grid-cols-2 gap-3">
            <Button className={big} onClick={() => setMode(null)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              className={big}
              loading={pending}
              disabled={(mode === "progress" && !(Number(good) > 0 || Number(rejected) > 0)) || (mode === "defect" && !(Number(rejected) > 0)) || ((mode === "shortage" || mode === "note") && !msg.trim())}
              onClick={() => {
                if (mode === "progress") send({ action: "progress", good: Number(good || 0), rejected: Number(rejected || 0) }, "Recorded");
                else if (mode === "defect") send({ action: "defect", rejected: Number(rejected), message: msg }, "Defects reported");
                else if (mode === "shortage") send({ action: "shortage", message: msg }, "Supervisor notified");
                else if (mode === "note") send({ action: "note", message: msg }, "Note added");
                else send({ action: "complete", good: Number(good || 0) }, "Job finished");
              }}
            >
              Save
            </Button>
          </div>
        </div>
      )}

      {(job.materials ?? []).length > 0 && (
        <div className="rounded-xl border border-line bg-surface p-4">
          <h2 className="mb-2 text-xs font-semibold uppercase text-muted">Materials for this order</h2>
          <ul className="divide-y divide-line text-[14px]">
            {(job.materials ?? []).map((m) => (
              <li key={m.name} className="flex justify-between py-2">
                <span>{m.name}</span>
                <span className="tabular text-muted">
                  {formatQty(m.per_unit, 3)} {m.uom}/unit · issued {formatQty(m.issued, 1)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
