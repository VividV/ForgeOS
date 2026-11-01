import * as React from "react";
import { cn } from "@/lib/utils";

const tones = {
  neutral: "bg-subtle text-ink-soft ring-line-strong",
  accent: "bg-accent-soft text-accent-ink ring-accent/25",
  success: "bg-success-soft text-success ring-success/25",
  warning: "bg-warning-soft text-warning-ink ring-warning/30",
  danger: "bg-danger-soft text-danger-ink ring-danger/25",
  info: "bg-info-soft text-info ring-info/25",
  dark: "bg-ink text-white ring-ink",
} as const;

export type Tone = keyof typeof tones;

export function Badge({ tone = "neutral", className, children, dot }: { tone?: Tone; className?: string; children: React.ReactNode; dot?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-1 whitespace-nowrap rounded px-1.5 py-0.5 text-[11.5px] font-medium ring-1 ring-inset", tones[tone], className)}>
      {dot && <span className="size-1.5 rounded-full bg-current" aria-hidden />}
      {children}
    </span>
  );
}

export const PRODUCTION_STATUS: Record<string, { label: string; tone: Tone }> = {
  draft: { label: "Draft", tone: "neutral" },
  awaiting_approval: { label: "Awaiting approval", tone: "info" },
  approved: { label: "Approved", tone: "info" },
  materials_pending: { label: "Materials pending", tone: "warning" },
  ready_to_start: { label: "Ready to start", tone: "accent" },
  in_progress: { label: "In progress", tone: "accent" },
  paused: { label: "Paused", tone: "warning" },
  quality_inspection: { label: "Quality inspection", tone: "info" },
  completed: { label: "Completed", tone: "success" },
  cancelled: { label: "Cancelled", tone: "neutral" },
};

export function ProductionStatusBadge({ status }: { status: string }) {
  const s = PRODUCTION_STATUS[status] ?? { label: status, tone: "neutral" as Tone };
  return <Badge tone={s.tone} dot>{s.label}</Badge>;
}

const STOCK: Record<string, { label: string; tone: Tone }> = {
  ok: { label: "In stock", tone: "success" },
  low: { label: "Low", tone: "warning" },
  out_of_stock: { label: "Out of stock", tone: "danger" },
  excess: { label: "Excess", tone: "info" },
};
export function StockStatusBadge({ status }: { status: string }) {
  const s = STOCK[status] ?? { label: status, tone: "neutral" as Tone };
  return <Badge tone={s.tone}>{s.label}</Badge>;
}

const PRIORITY: Record<string, Tone> = { low: "neutral", normal: "neutral", high: "warning", urgent: "danger" };
export function PriorityBadge({ priority }: { priority: string }) {
  return <Badge tone={PRIORITY[priority] ?? "neutral"}>{priority.charAt(0).toUpperCase() + priority.slice(1)}</Badge>;
}

const BOM: Record<string, Tone> = { draft: "neutral", pending_approval: "info", approved: "success", superseded: "neutral", archived: "neutral" };
export function BomStatusBadge({ status }: { status: string }) {
  return <Badge tone={BOM[status] ?? "neutral"}>{status === "pending_approval" ? "Pending approval" : status.charAt(0).toUpperCase() + status.slice(1)}</Badge>;
}

const PO: Record<string, { label: string; tone: Tone }> = {
  draft: { label: "Draft", tone: "neutral" },
  pending_approval: { label: "Pending approval", tone: "info" },
  approved: { label: "Approved", tone: "accent" },
  sent: { label: "Sent to supplier", tone: "accent" },
  partially_received: { label: "Partially received", tone: "warning" },
  received: { label: "Received", tone: "success" },
  closed: { label: "Closed", tone: "neutral" },
  cancelled: { label: "Cancelled", tone: "neutral" },
  submitted: { label: "Awaiting approval", tone: "info" },
  rejected: { label: "Rejected", tone: "danger" },
  ordered: { label: "Ordered", tone: "success" },
};
export function ProcurementStatusBadge({ status }: { status: string }) {
  const s = PO[status] ?? { label: status, tone: "neutral" as Tone };
  return <Badge tone={s.tone} dot>{s.label}</Badge>;
}

const QC: Record<string, Tone> = { pass: "success", fail: "danger", conditional: "warning" };
export function QcResultBadge({ result }: { result: string }) {
  return <Badge tone={QC[result] ?? "neutral"}>{result === "conditional" ? "Conditional" : result === "pass" ? "Pass" : "Fail"}</Badge>;
}

const SO: Record<string, { label: string; tone: Tone }> = {
  draft: { label: "Draft", tone: "neutral" },
  confirmed: { label: "Confirmed", tone: "accent" },
  partially_dispatched: { label: "Partly dispatched", tone: "warning" },
  dispatched: { label: "Dispatched", tone: "info" },
  delivered: { label: "Delivered", tone: "success" },
  closed: { label: "Closed", tone: "neutral" },
  cancelled: { label: "Cancelled", tone: "neutral" },
};
export function SalesStatusBadge({ status }: { status: string }) {
  const s = SO[status] ?? { label: status, tone: "neutral" as Tone };
  return <Badge tone={s.tone} dot>{s.label}</Badge>;
}

export function PaymentBadge({ total, paid, status }: { total: number; paid: number; status?: string }) {
  if (status === "cancelled" || status === "draft") return null;
  if (paid <= 0) return <Badge tone="danger">Unpaid</Badge>;
  if (paid + 0.005 < total) return <Badge tone="warning">Part paid</Badge>;
  return <Badge tone="success">Paid</Badge>;
}

const ATT: Record<string, { label: string; tone: Tone }> = {
  present: { label: "Present", tone: "success" },
  late: { label: "Late", tone: "warning" },
  half_day: { label: "Half day", tone: "info" },
  absent: { label: "Absent", tone: "danger" },
  leave: { label: "Leave", tone: "neutral" },
  off: { label: "Off", tone: "neutral" },
};
export function AttendanceBadge({ status }: { status: string }) {
  const s = ATT[status] ?? { label: status, tone: "neutral" as Tone };
  return <Badge tone={s.tone}>{s.label}</Badge>;
}
