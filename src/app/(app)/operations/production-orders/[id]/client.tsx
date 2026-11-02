"use client";
import { CheckCircle2, ClipboardPlus, Clock, Lock, Pause, Pencil, Play, Send, ShieldCheck, Undo2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";
import { z } from "zod";
import { ActionButton } from "@/components/forms/action-button";
import { FormDialog } from "@/components/forms/form-dialog";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Checkbox, Field, FormError, Input, Select, Textarea } from "@/components/ui/form";
import {
  addNote, completeOrder, issueJobCard, issueMaterials, operationAction, recordDowntime, recordWastage, reserveMaterials, returnMaterials,
  transitionOrder, updateProductionOrder,
} from "@/app/actions/production";
import { formatQty } from "@/lib/format";
import { idempotencyKey } from "@/lib/utils";

type Can = { update: boolean; approve: boolean; manage: boolean; cancel: boolean; jobs: boolean };

export function OrderActions({ id, status, can }: { id: string; status: string; can: Can }) {
  const open = !["completed", "cancelled"].includes(status);
  return (
    <>
      {status === "draft" && can.update && (
        <ActionButton variant="primary" action={() => transitionOrder(id, "awaiting_approval")}>
          <Send /> Submit for approval
        </ActionButton>
      )}
      {status === "awaiting_approval" && can.approve && (
        <>
          <ActionButton action={(n) => transitionOrder(id, "draft", n)} noteLabel="Reason for returning" confirm={{ title: "Return to draft?" }} confirmLabel="Return to draft">
            <Undo2 /> Return
          </ActionButton>
          <ActionButton
            variant="primary"
            action={() => transitionOrder(id, "approved")}
            confirm={{ title: "Approve and reserve materials?", description: "Available materials are reserved for this order straight away. Shortages are flagged to the store." }}
            confirmLabel="Approve"
          >
            <ShieldCheck /> Approve
          </ActionButton>
        </>
      )}
      {status === "materials_pending" && (can.manage || can.approve || can.update) && (
        <ActionButton action={() => reserveMaterials(id)}>
          <Lock /> Re-check & reserve
        </ActionButton>
      )}
      {status === "materials_pending" && can.approve && (
        <ActionButton action={(n) => transitionOrder(id, "in_progress", n)} noteLabel="Why start before all materials are available?" noteRequired confirm={{ title: "Start with shortages?" }} confirmLabel="Start production">
          <Play /> Start anyway
        </ActionButton>
      )}
      {status === "ready_to_start" && can.update && (
        <ActionButton variant="primary" action={() => transitionOrder(id, "in_progress")}>
          <Play /> Start production
        </ActionButton>
      )}
      {status === "in_progress" && can.update && (
        <>
          <ActionButton action={(n) => transitionOrder(id, "paused", n)} noteLabel="Reason for pausing" confirm={{ title: "Pause this order?" }} confirmLabel="Pause">
            <Pause /> Pause
          </ActionButton>
          <ActionButton action={() => transitionOrder(id, "quality_inspection")}>
            <ShieldCheck /> Send to inspection
          </ActionButton>
        </>
      )}
      {status === "paused" && can.update && (
        <ActionButton variant="primary" action={() => transitionOrder(id, "in_progress")}>
          <Play /> Resume
        </ActionButton>
      )}
      {status === "quality_inspection" && can.update && (
        <ActionButton action={(n) => transitionOrder(id, "in_progress", n)} noteLabel="What needs rework?" confirm={{ title: "Return to production?" }} confirmLabel="Return to production">
          <Undo2 /> Back to production
        </ActionButton>
      )}
      {open && can.cancel && (
        <ActionButton
          variant="danger-outline"
          action={(n) => transitionOrder(id, "cancelled", n)}
          noteLabel="Reason for cancelling"
          noteRequired
          confirm={{ title: "Cancel this order?", description: "Reservations are released. Any issued material must be returned or recorded as wastage first." }}
          confirmLabel="Cancel order"
        >
          <X /> Cancel
        </ActionButton>
      )}
    </>
  );
}

type Mat = { id: string; name: string; uom: string; reserved: number; issued: number; returned: number; wasted: number; required: number; available: number };
type Opt = { value: string; label: string }[];

function LinesDialog({
  title,
  description,
  trigger,
  materials,
  initial,
  max,
  submitLabel,
  extra,
  onSubmit,
}: {
  title: string;
  description: string;
  trigger: React.ReactNode;
  materials: Mat[];
  initial: (m: Mat) => number;
  max: (m: Mat) => number;
  submitLabel: string;
  extra?: (set: (k: string, v: string) => void) => React.ReactNode;
  onSubmit: (lines: { material_id: string; quantity: number }[], extra: Record<string, string>, idem: string) => Promise<{ ok: boolean; error?: string; message?: string }>;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [qty, setQty] = React.useState<Record<string, string>>({});
  const [ex, setEx] = React.useState<Record<string, string>>({});
  const [error, setError] = React.useState<string | null>(null);
  const [pending, start] = React.useTransition();
  const idem = React.useRef(idempotencyKey());
  React.useEffect(() => {
    if (open) {
      setQty(Object.fromEntries(materials.map((m) => [m.id, String(+initial(m).toFixed(4))])));
      setError(null);
      idem.current = idempotencyKey();
    }
  }, [open, materials, initial]);
  const submit = () =>
    start(async () => {
      const lines = materials.map((m) => ({ material_id: m.id, quantity: Number(qty[m.id] || 0) }));
      const over = materials.find((m) => Number(qty[m.id] || 0) > max(m) + 1e-9);
      if (over) return setError(`${over.name}: at most ${formatQty(max(over), 4)} ${over.uom}`);
      const r = await onSubmit(lines, ex, idem.current);
      if (!r.ok) return setError(r.error ?? "Failed");
      toast.success(r.message ?? "Done");
      setOpen(false);
      router.refresh();
    });
  return (
    <Dialog open={open} onOpenChange={setOpen} title={title} description={description} trigger={trigger} className="max-w-2xl">
      <div className="flex flex-col gap-3">
        <FormError message={error} />
        <div className="divide-y divide-line rounded-lg border border-line">
          {materials.map((m) => (
            <div key={m.id} className="flex items-center gap-3 px-3 py-2">
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-medium">{m.name}</p>
                <p className="text-xs text-muted">
                  max {formatQty(max(m), 4)} {m.uom}
                </p>
              </div>
              <Input className="h-8 w-28 text-right" type="number" min="0" step="any" value={qty[m.id] ?? ""} onChange={(e) => setQty((q) => ({ ...q, [m.id]: e.target.value }))} aria-label={`Quantity of ${m.name}`} />
              <span className="w-8 text-xs text-muted">{m.uom}</span>
            </div>
          ))}
        </div>
        {extra?.((k, v) => setEx((e) => ({ ...e, [k]: v })))}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button variant="primary" onClick={submit} loading={pending}>
            {submitLabel}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

export function IssueDialog({ id, materials, operations }: { id: string; materials: Mat[]; operations: Opt }) {
  return (
    <LinesDialog
      title="Issue materials to production"
      description="Reserved quantities are issued first; anything extra comes from available stock in the store."
      trigger={<Button size="sm" variant="primary">Issue</Button>}
      materials={materials}
      initial={(m) => m.reserved}
      max={(m) => m.reserved + Math.max(m.available, 0)}
      submitLabel="Issue materials"
      extra={(set) => (
        <Field label="For step (optional)" htmlFor="issue-op">
          <Select id="issue-op" defaultValue="" onChange={(e) => set("operation_id", e.target.value)}>
            <option value="">Whole order</option>
            {operations.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
        </Field>
      )}
      onSubmit={(lines, ex, idem) => issueMaterials(id, { lines, operation_id: ex.operation_id ?? "", idem })}
    />
  );
}

export function ReturnDialog({ id, materials }: { id: string; materials: Mat[] }) {
  const usable = materials.filter((m) => m.issued - m.returned - m.wasted > 0);
  if (!usable.length) return null;
  return (
    <LinesDialog
      title="Return unused materials"
      description="Returned material goes back into the store at the cost it was issued."
      trigger={<Button size="sm">Return</Button>}
      materials={usable}
      initial={() => 0}
      max={(m) => m.issued - m.returned - m.wasted}
      submitLabel="Return to stock"
      onSubmit={(lines, _ex, idem) => returnMaterials(id, { lines, idem })}
    />
  );
}

export function WastageDialog({ id, materials, operations }: { id: string; materials: Mat[]; operations: Opt }) {
  const usable = materials.filter((m) => m.issued - m.returned - m.wasted > 0);
  if (!usable.length) return null;
  return (
    <FormDialog
      triggerLabel="Record wastage"
      triggerSize="sm"
      title="Record material wastage"
      description="For issued material that was spoiled or scrapped. It is counted in the order's actual usage."
      schema={z.object({ material_id: z.string().min(1, "Choose a material"), quantity: z.string().min(1, "Enter a quantity"), reason: z.string().trim().min(2, "Give a reason") })}
      fields={[
        { name: "material_id", label: "Material", type: "select", required: true, options: usable.map((m) => ({ value: m.id, label: `${m.name} (max ${formatQty(m.issued - m.returned - m.wasted, 2)} ${m.uom})` })) },
        { name: "quantity", label: "Quantity wasted", type: "number", required: true },
        { name: "operation_id", label: "At step", type: "select", options: operations },
        { name: "reason", label: "Reason", required: true, placeholder: "Cutting offcuts, dye defect…" },
      ]}
      action={(v) => recordWastage(id, v)}
    />
  );
}

export function OperationActions({ orderId, op, orderStatus, canSkip }: { orderId: string; op: { id: string; name: string; status: string }; orderStatus: string; canSkip: boolean }) {
  if (op.status === "completed" || op.status === "skipped") return null;
  const running = orderStatus === "in_progress";
  return (
    <div className="flex items-center gap-1">
      {(orderStatus === "ready_to_start" || running) && op.status !== "in_progress" && (
        <ActionButton size="sm" variant="ghost" action={() => operationAction(orderId, op.id, "start")}>
          <Play /> Start
        </ActionButton>
      )}
      {running && (
        <FormDialog
          triggerLabel="Record"
          triggerSize="sm"
          triggerVariant="secondary"
          title={`Record output · ${op.name}`}
          description="Units that passed this step and units rejected at it. Added to what's already recorded."
          schema={z.object({ good: z.string(), rejected: z.string() })}
          defaultValues={{ good: "", rejected: "0" }}
          fields={[
            { name: "good", label: "Good units", type: "number", autoFocus: true },
            { name: "rejected", label: "Rejected units", type: "number" },
            { name: "message", label: "Note", type: "textarea" },
          ]}
          action={(v) => operationAction(orderId, op.id, "progress", v)}
        />
      )}
      {running && op.status === "in_progress" && (
        <ActionButton size="sm" variant="ghost" action={() => operationAction(orderId, op.id, "pause")}>
          <Pause />
        </ActionButton>
      )}
      {running && (
        <ActionButton size="sm" variant="ghost" action={() => operationAction(orderId, op.id, "complete")} confirm={{ title: `Complete ${op.name}?`, description: "The step is closed and work moves to the next step." }} confirmLabel="Complete step">
          <CheckCircle2 /> Done
        </ActionButton>
      )}
      {canSkip && op.status === "pending" && (
        <ActionButton size="sm" variant="ghost" action={() => operationAction(orderId, op.id, "skip")} confirm={{ title: `Skip ${op.name}?`, description: "Only for steps not needed for this order." }} confirmLabel="Skip">
          Skip
        </ActionButton>
      )}
    </div>
  );
}

export function JobCardDialog({ orderId, operations, members, employees = [], defaultTarget, defaultOp }: { orderId: string; operations: Opt; members: Opt; employees?: Opt; defaultTarget: number; defaultOp?: string }) {
  return (
    <FormDialog
      triggerLabel="Issue job card"
      triggerIcon={<ClipboardPlus />}
      triggerSize="sm"
      title="Issue job card"
      description="The worker sees it on their phone under My Job Cards and can print it with a scannable code."
      schema={z.object({ operation_id: z.string().min(1, "Choose a step"), target_quantity: z.string().min(1, "Enter a target") })}
      defaultValues={{ operation_id: defaultOp, target_quantity: String(defaultTarget) }}
      fields={[
        { name: "operation_id", label: "Step", type: "select", required: true, options: operations },
        { name: "assigned_user_id", label: "Assign to person (with login)", type: "select", options: members },
        ...(employees.length ? [{ name: "assigned_employee_id", label: "…or employee (no login needed)", type: "select" as const, options: employees }] : []),
        { name: "assigned_team", label: "…or team", placeholder: "Sewing team B" },
        { name: "target_quantity", label: "Target quantity", type: "number", required: true },
        { name: "instructions", label: "Instructions", type: "textarea" },
      ]}
      action={(v) => issueJobCard(orderId, v)}
    />
  );
}

export function DowntimeDialog({ orderId, operations }: { orderId: string; operations: Opt }) {
  return (
    <FormDialog
      triggerLabel="Record downtime"
      triggerIcon={<Clock />}
      triggerSize="sm"
      title="Record downtime"
      schema={z.object({ minutes: z.string().min(1, "Enter minutes"), reason: z.string().trim().min(2, "Give a reason") })}
      fields={[
        { name: "operation_id", label: "Step", type: "select", options: operations },
        { name: "minutes", label: "Minutes lost", type: "number", required: true },
        { name: "reason", label: "Reason", required: true, placeholder: "Power outage, machine fault…" },
      ]}
      action={(v) => recordDowntime(orderId, v)}
    />
  );
}

export function NoteForm({ orderId }: { orderId: string }) {
  const router = useRouter();
  const [v, setV] = React.useState("");
  const [pending, start] = React.useTransition();
  return (
    <form
      className="flex gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await addNote(orderId, { message: v });
          if (!r.ok) return void toast.error(r.error);
          setV("");
          router.refresh();
        });
      }}
    >
      <Input value={v} onChange={(e) => setV(e.target.value)} placeholder="Add a production note…" aria-label="Production note" />
      <Button type="submit" loading={pending} disabled={!v.trim()}>
        Add
      </Button>
    </form>
  );
}

export function EditOrderDialog({ id, defaults, members }: { id: string; defaults: Record<string, unknown>; members: Opt }) {
  return (
    <FormDialog
      triggerLabel=""
      triggerIcon={<Pencil />}
      triggerVariant="ghost"
      triggerSize="icon-sm"
      title="Edit order"
      schema={z.object({ priority: z.string() })}
      defaultValues={defaults}
      fields={[
        { name: "priority", label: "Priority", type: "select", required: true, options: ["low", "normal", "high", "urgent"].map((p) => ({ value: p, label: p.charAt(0).toUpperCase() + p.slice(1) })) },
        { name: "planned_start_date", label: "Planned start", type: "date" },
        { name: "due_date", label: "Due date", type: "date" },
        { name: "manager_id", label: "Manager", type: "select", options: members },
        { name: "notes", label: "Notes", type: "textarea" },
      ]}
      action={(v) => updateProductionOrder(id, v)}
    />
  );
}

export function CompleteDialog({
  id,
  planned,
  lastStepGood,
  lastStepRejected,
  maxByMaterial,
  canException,
  uom,
  inspection,
  requireFinal = false,
}: {
  id: string;
  planned: number;
  lastStepGood: number;
  lastStepRejected: number;
  maxByMaterial: number;
  canException: boolean;
  uom: string;
  /** Final-inspection totals; when present, accepted units cannot exceed units that passed. */
  inspection?: { passed: number; rejected: number } | null;
  requireFinal?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [good, setGood] = React.useState(String(inspection ? Math.min(lastStepGood, inspection.passed) : lastStepGood));
  const [rej, setRej] = React.useState(String(lastStepRejected));
  const [note, setNote] = React.useState("");
  const [exception, setException] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [pending, start] = React.useTransition();
  const idem = React.useRef(idempotencyKey());
  const total = Number(good || 0) + Number(rej || 0);
  const overMaterial = total > maxByMaterial + 1e-6;
  const overPassed = !!inspection && Number(good || 0) > inspection.passed + 1e-6;
  const blockedByGate = requireFinal && !inspection;
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        // re-derive defaults each time: inspections may have been recorded since the page loaded
        if (o) {
          setGood(String(inspection ? Math.min(lastStepGood, inspection.passed) : lastStepGood));
          setRej(String(lastStepRejected + (inspection ? inspection.rejected : 0)));
          setError(null);
        }
        setOpen(o);
      }}
      title="Complete production order"
      description="Accepted units are added to finished-goods stock at full actual cost (material, labour, machine and overhead). Rejected units are recorded but never stocked."
      trigger={
        <Button variant="primary">
          <CheckCircle2 /> Complete order
        </Button>
      }
    >
      <div className="flex flex-col gap-3">
        <FormError message={error} />
        <div className="grid grid-cols-2 gap-3">
          <Field label={`Accepted (${uom})`} htmlFor="c-good">
            <Input id="c-good" type="number" min="0" step="any" value={good} onChange={(e) => setGood(e.target.value)} />
          </Field>
          <Field label={`Rejected (${uom})`} htmlFor="c-rej">
            <Input id="c-rej" type="number" min="0" step="any" value={rej} onChange={(e) => setRej(e.target.value)} />
          </Field>
        </div>
        <p className="text-xs text-muted">
          Planned {formatQty(planned)} · last step recorded {formatQty(lastStepGood)} good · materials issued support up to {formatQty(Math.max(maxByMaterial, 0), 2)} units.
        </p>
        {inspection && (
          <p className="text-xs text-muted">
            Final inspection: {formatQty(inspection.passed)} passed, {formatQty(inspection.rejected)} rejected. Accepted units cannot exceed what passed.
          </p>
        )}
        {overPassed && <div className="rounded-md bg-danger-soft px-3 py-2 text-[13px] text-danger-ink">Only {formatQty(inspection!.passed)} units passed final inspection. Record another inspection or reduce the accepted quantity.</div>}
        {blockedByGate && <div className="rounded-md bg-warning-soft px-3 py-2 text-[13px] text-warning-ink">This organisation requires a final inspection before output can be stocked. Record one from the Quality card first.</div>}
        {overMaterial && (
          <div className="rounded-md bg-warning-soft px-3 py-2 text-[13px] text-warning-ink">
            This output needs more material than was issued. Issue the missing material first
            {canException ? ", or record an approved exception below." : "."}
          </div>
        )}
        {overMaterial && canException && <Checkbox label="Record an approved material exception" checked={exception} onChange={(e) => setException(e.target.checked)} />}
        <Field label={exception ? "Exception note (required)" : "Note"} htmlFor="c-note">
          <Textarea id="c-note" value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            variant="primary"
            loading={pending}
            disabled={total <= 0 || overPassed || blockedByGate || (overMaterial && !exception) || (exception && !note.trim())}
            onClick={() =>
              start(async () => {
                setError(null);
                const r = await completeOrder(id, { good, rejected: rej, note, allow_exception: exception, idem: idem.current });
                if (!r.ok) return setError(r.error);
                toast.success(r.message ?? "Completed");
                setOpen(false);
                router.refresh();
              })
            }
          >
            Complete & stock output
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
