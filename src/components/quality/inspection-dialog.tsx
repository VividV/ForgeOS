"use client";
import { Plus, ShieldCheck, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";
import { recordInspection } from "@/app/actions/quality";
import { Button, type ButtonProps } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Checkbox, Field, FormError, Input, Select, Textarea } from "@/components/ui/form";

export type TemplateOpt = { id: string; name: string; items: { id: string; name: string; check_type: string; target: string | null; required: boolean }[] };
type Item = { template_item_id: string | null; name: string; result: "pass" | "fail" | "na"; value: string; notes: string };
type Defect = { category: string; severity: "minor" | "major" | "critical"; quantity: string; description: string };
type Action = { description: string; assigned_to: string; due_date: string };

export const DEFECT_CATEGORIES = ["Stitching", "Measurement", "Fabric flaw", "Colour / shade", "Stain / soiling", "Finishing", "Labelling", "Packaging", "Damaged in transit", "Wrong item", "Other"];

/**
 * Records a quality inspection (production or goods receipt). Pass/fail quantities feed the
 * final-inspection gate on completion; defects and corrective actions are logged with it.
 */
export function InspectionDialog({
  checkType,
  productionOrderId,
  goodsReceiptId,
  operations = [],
  defaultFinal = false,
  maxQty,
  templates,
  members,
  canApprove,
  triggerLabel = "Record inspection",
  triggerVariant = "secondary",
}: {
  checkType: "production" | "goods_receipt";
  productionOrderId?: string;
  goodsReceiptId?: string;
  operations?: { value: string; label: string }[];
  defaultFinal?: boolean;
  maxQty?: number;
  templates: TemplateOpt[];
  members: { value: string; label: string }[];
  canApprove: boolean;
  triggerLabel?: string;
  triggerVariant?: ButtonProps["variant"];
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [pending, start] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);
  const [tpl, setTpl] = React.useState("");
  const [op, setOp] = React.useState("");
  const [isFinal, setFinal] = React.useState(defaultFinal);
  const [inspected, setInspected] = React.useState(maxQty ? String(+maxQty.toFixed(4)) : "");
  const [rejected, setRejected] = React.useState("");
  const [result, setResult] = React.useState<"pass" | "fail" | "conditional">("pass");
  const [condNote, setCondNote] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [items, setItems] = React.useState<Item[]>([]);
  const [defects, setDefects] = React.useState<Defect[]>([]);
  const [actions, setActions] = React.useState<Action[]>([]);

  const pickTemplate = (id: string) => {
    setTpl(id);
    const t = templates.find((x) => x.id === id);
    setItems(t ? t.items.map((i) => ({ template_item_id: i.id, name: i.name + (i.target ? ` (target ${i.target})` : ""), result: "pass", value: "", notes: "" })) : []);
  };
  const passed = Math.max(Number(inspected || 0) - Number(rejected || 0), 0);

  const submit = () =>
    start(async () => {
      setError(null);
      const r = await recordInspection({
        check_type: checkType,
        production_order_id: productionOrderId ?? null,
        goods_receipt_id: goodsReceiptId ?? null,
        operation_id: op || null,
        is_final: checkType === "production" ? isFinal : false,
        template_id: tpl || null,
        quantity_inspected: inspected,
        quantity_rejected: rejected,
        result,
        conditional_note: condNote,
        notes,
        items,
        defects,
        actions: actions.filter((a) => a.description.trim()),
      });
      if (!r.ok) return setError(r.error + (r.fieldErrors ? ` (${Object.values(r.fieldErrors).join("; ")})` : ""));
      toast.success(r.message ?? "Inspection recorded");
      setOpen(false);
      router.refresh();
    });

  return (
    <Dialog
      open={open}
      onOpenChange={setOpen}
      title="Record inspection"
      description={checkType === "production" ? "Final inspections limit how many units can be completed into stock." : "Inspection of goods received from the supplier."}
      className="max-w-2xl"
      trigger={
        <Button variant={triggerVariant} size="sm">
          <ShieldCheck /> {triggerLabel}
        </Button>
      }
    >
      <div className="flex flex-col gap-4">
        <FormError message={error} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Checklist" htmlFor="qc-tpl" hint={templates.length ? undefined : "No checklists yet. Create them under Quality → Checklists."}>
            <Select id="qc-tpl" value={tpl} onChange={(e) => pickTemplate(e.target.value)}>
              <option value="">No checklist</option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </Select>
          </Field>
          {checkType === "production" && operations.length > 0 && (
            <Field label="Step" htmlFor="qc-op">
              <Select id="qc-op" value={op} onChange={(e) => setOp(e.target.value)}>
                <option value="">Whole order</option>
                {operations.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </Select>
            </Field>
          )}
        </div>
        {checkType === "production" && <Checkbox label="Final inspection (counts toward units that can be completed)" checked={isFinal} onChange={(e) => setFinal(e.target.checked)} />}
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Quantity inspected" htmlFor="qc-insp" required hint={maxQty != null ? `Up to ${+maxQty.toFixed(4)}` : undefined}>
            <Input id="qc-insp" type="number" min="0" step="any" value={inspected} onChange={(e) => setInspected(e.target.value)} />
          </Field>
          <Field label="Quantity rejected" htmlFor="qc-rej">
            <Input id="qc-rej" type="number" min="0" step="any" value={rejected} onChange={(e) => setRejected(e.target.value)} />
          </Field>
          <Field label="Passed" htmlFor="qc-pass">
            <Input id="qc-pass" readOnly value={String(+passed.toFixed(4))} className="bg-subtle" />
          </Field>
        </div>
        <Field label="Result" htmlFor="qc-result" required>
          <Select id="qc-result" value={result} onChange={(e) => setResult(e.target.value as typeof result)}>
            <option value="pass">Pass</option>
            <option value="fail">Fail</option>
            <option value="conditional" disabled={!canApprove}>
              Conditional pass{canApprove ? "" : " (needs a quality approver)"}
            </option>
          </Select>
        </Field>
        {result === "conditional" && (
          <Field label="Condition / concession" htmlFor="qc-cond" required>
            <Textarea id="qc-cond" value={condNote} onChange={(e) => setCondNote(e.target.value)} placeholder="e.g. Accepted with minor shade variation, customer informed" />
          </Field>
        )}

        {items.length > 0 && (
          <fieldset className="rounded-lg border border-line">
            <legend className="ml-3 px-1 text-xs font-semibold uppercase tracking-wide text-muted">Checklist</legend>
            <div className="divide-y divide-line">
              {items.map((it, i) => (
                <div key={i} className="grid items-center gap-2 px-3 py-2 sm:grid-cols-[minmax(0,1fr)_120px_140px]">
                  <span className="text-[13px]">{it.name}</span>
                  <Select className="h-8" aria-label={`Result for ${it.name}`} value={it.result} onChange={(e) => setItems((xs) => xs.map((x, j) => (j === i ? { ...x, result: e.target.value as Item["result"] } : x)))}>
                    <option value="pass">Pass</option>
                    <option value="fail">Fail</option>
                    <option value="na">N/A</option>
                  </Select>
                  <Input className="h-8" placeholder="Reading / note" aria-label={`Value for ${it.name}`} value={it.value} onChange={(e) => setItems((xs) => xs.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))} />
                </div>
              ))}
            </div>
          </fieldset>
        )}

        <fieldset className="rounded-lg border border-line p-3">
          <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-muted">Defects</legend>
          <div className="flex flex-col gap-2">
            {defects.map((d, i) => (
              <div key={i} className="grid gap-2 sm:grid-cols-[150px_110px_80px_minmax(0,1fr)_auto]">
                <Select className="h-8" aria-label="Defect category" value={d.category} onChange={(e) => setDefects((xs) => xs.map((x, j) => (j === i ? { ...x, category: e.target.value } : x)))}>
                  {DEFECT_CATEGORIES.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </Select>
                <Select className="h-8" aria-label="Severity" value={d.severity} onChange={(e) => setDefects((xs) => xs.map((x, j) => (j === i ? { ...x, severity: e.target.value as Defect["severity"] } : x)))}>
                  <option value="minor">Minor</option>
                  <option value="major">Major</option>
                  <option value="critical">Critical</option>
                </Select>
                <Input className="h-8" type="number" min="0" step="any" aria-label="Defect quantity" placeholder="Qty" value={d.quantity} onChange={(e) => setDefects((xs) => xs.map((x, j) => (j === i ? { ...x, quantity: e.target.value } : x)))} />
                <Input className="h-8" aria-label="Defect description" placeholder="Description" value={d.description} onChange={(e) => setDefects((xs) => xs.map((x, j) => (j === i ? { ...x, description: e.target.value } : x)))} />
                <Button size="icon-sm" variant="ghost" aria-label="Remove defect" onClick={() => setDefects((xs) => xs.filter((_, j) => j !== i))}>
                  <Trash2 />
                </Button>
              </div>
            ))}
            <Button size="sm" variant="ghost" className="self-start" onClick={() => setDefects((xs) => [...xs, { category: DEFECT_CATEGORIES[0], severity: "minor", quantity: rejected || "1", description: "" }])}>
              <Plus /> Add defect
            </Button>
          </div>
        </fieldset>

        <fieldset className="rounded-lg border border-line p-3">
          <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-muted">Corrective actions</legend>
          <div className="flex flex-col gap-2">
            {actions.map((a, i) => (
              <div key={i} className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_160px_140px_auto]">
                <Input className="h-8" aria-label="Corrective action" placeholder="What needs to happen" value={a.description} onChange={(e) => setActions((xs) => xs.map((x, j) => (j === i ? { ...x, description: e.target.value } : x)))} />
                <Select className="h-8" aria-label="Assign to" value={a.assigned_to} onChange={(e) => setActions((xs) => xs.map((x, j) => (j === i ? { ...x, assigned_to: e.target.value } : x)))}>
                  <option value="">Unassigned</option>
                  {members.map((m) => (
                    <option key={m.value} value={m.value}>
                      {m.label}
                    </option>
                  ))}
                </Select>
                <Input className="h-8" type="date" aria-label="Due date" value={a.due_date} onChange={(e) => setActions((xs) => xs.map((x, j) => (j === i ? { ...x, due_date: e.target.value } : x)))} />
                <Button size="icon-sm" variant="ghost" aria-label="Remove action" onClick={() => setActions((xs) => xs.filter((_, j) => j !== i))}>
                  <Trash2 />
                </Button>
              </div>
            ))}
            <Button size="sm" variant="ghost" className="self-start" onClick={() => setActions((xs) => [...xs, { description: "", assigned_to: "", due_date: "" }])}>
              <Plus /> Add corrective action
            </Button>
          </div>
        </fieldset>

        <Field label="Notes" htmlFor="qc-notes">
          <Textarea id="qc-notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
        <div className="flex justify-end gap-2 border-t border-line pt-4">
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button variant="primary" loading={pending} onClick={submit}>
            Save inspection
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
