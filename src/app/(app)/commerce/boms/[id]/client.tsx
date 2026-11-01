"use client";
import { Check, Copy, Send, Trash2, Undo2 } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";
import { ActionButton } from "@/components/forms/action-button";
import { SchemaForm } from "@/components/forms/schema-form";
import { Button } from "@/components/ui/button";
import { FormError, Input, Select } from "@/components/ui/form";
import { TD, TR } from "@/components/ui/table";
import { addBomLine, bomTransition, createBomVersion, deleteDraftBom, removeBomLine, updateBomHeader, updateBomLine } from "@/app/actions/catalog";
import { formatMoney, formatQty } from "@/lib/format";
import { bomHeaderSchema } from "@/lib/validation/catalog";

export function BomActions({
  bomId,
  productId,
  status,
  can,
  lineCount,
}: {
  bomId: string;
  productId: string;
  status: string;
  can: { update: boolean; approve: boolean; create: boolean };
  lineCount: number;
}) {
  return (
    <>
      {status === "draft" && can.update && (
        <ActionButton
          variant="danger-outline"
          action={() => deleteDraftBom(bomId)}
          confirm={{ title: "Delete this draft?", description: "The draft and its lines are removed. Approved versions are not affected." }}
          confirmLabel="Delete draft"
        >
          <Trash2 /> Delete draft
        </ActionButton>
      )}
      {status === "draft" && can.update && !can.approve && (
        <ActionButton variant="primary" disabled={lineCount === 0} action={() => bomTransition(bomId, "submit")}>
          <Send /> Submit for approval
        </ActionButton>
      )}
      {status === "draft" && can.approve && (
        <>
          {can.update && (
            <ActionButton disabled={lineCount === 0} action={() => bomTransition(bomId, "submit")}>
              <Send /> Submit
            </ActionButton>
          )}
          <ActionButton
            variant="primary"
            disabled={lineCount === 0}
            action={(note) => bomTransition(bomId, "approve", note)}
            confirm={{ title: "Approve this BOM?", description: "It becomes the BOM used for new production orders and can no longer be edited. Any previously approved version is superseded." }}
            confirmLabel="Approve"
          >
            <Check /> Approve
          </ActionButton>
        </>
      )}
      {status === "pending_approval" && can.approve && (
        <>
          <ActionButton action={(note) => bomTransition(bomId, "reject", note)} noteLabel="What needs changing?" noteRequired confirm={{ title: "Return to draft" }} confirmLabel="Return to draft">
            <Undo2 /> Reject
          </ActionButton>
          <ActionButton variant="primary" action={() => bomTransition(bomId, "approve")} confirm={{ title: "Approve this BOM?", description: "It becomes the active BOM for new production orders." }} confirmLabel="Approve">
            <Check /> Approve
          </ActionButton>
        </>
      )}
      {(status === "approved" || status === "superseded") && can.create && (
        <ActionButton action={() => createBomVersion(productId, null, bomId)}>
          <Copy /> New version from this
        </ActionButton>
      )}
      {(status === "approved" || status === "superseded") && can.approve && (
        <ActionButton variant="ghost" action={() => bomTransition(bomId, "archive")} confirm={{ title: "Archive this BOM?", description: "Archived BOMs can't be used for new orders. Existing orders keep their snapshot." }} confirmLabel="Archive">
          Archive
        </ActionButton>
      )}
    </>
  );
}

export function BomHeaderForm({ bomId, defaults }: { bomId: string; defaults: Record<string, unknown> }) {
  return (
    <SchemaForm
      schema={bomHeaderSchema}
      columns={1}
      defaultValues={defaults}
      fields={[
        { name: "name", label: "Version name" },
        { name: "output_quantity", label: "Output quantity", type: "number", required: true, hint: "Line quantities make this many units." },
        { name: "notes", label: "Notes", type: "textarea" },
      ]}
      action={(v) => updateBomHeader(bomId, v)}
    />
  );
}

export function BomLineAdd({ bomId, options }: { bomId: string; options: { value: string; label: string; group: string }[] }) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);
  const formRef = React.useRef<HTMLFormElement>(null);
  const groups = [...new Set(options.map((o) => o.group))];
  const submit = (fd: FormData) =>
    start(async () => {
      setError(null);
      const r = await addBomLine(bomId, Object.fromEntries(fd.entries()));
      if (!r.ok) return setError(r.error + (r.fieldErrors ? ": " + Object.values(r.fieldErrors).join(", ") : ""));
      toast.success("Line added");
      formRef.current?.reset();
      router.refresh();
    });
  if (options.length === 0) return <p className="text-[13px] text-muted">All available materials are on this BOM. Create more materials to add them.</p>;
  return (
    <form ref={formRef} action={submit} className="flex flex-col gap-2">
      <p className="text-[13px] font-medium">Add a material</p>
      <div className="grid gap-2 sm:grid-cols-[1fr_120px_110px_auto]">
        <Select name="stock_item_id" required defaultValue="" aria-label="Material">
          <option value="" disabled>
            Choose material…
          </option>
          {groups.map((g) => (
            <optgroup key={g} label={g}>
              {options
                .filter((o) => o.group === g)
                .map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
            </optgroup>
          ))}
        </Select>
        <Input name="quantity" type="number" step="any" min="0" placeholder="Qty per unit" required aria-label="Quantity" />
        <Input name="wastage_pct" type="number" step="any" min="0" max="99" placeholder="Wastage %" aria-label="Wastage percent" />
        <Button type="submit" variant="primary" loading={pending}>
          Add
        </Button>
      </div>
      <FormError message={error} />
    </form>
  );
}

type Line = { bom_item_id: string; line_no: number; code: string; name: string; uom_code: string; quantity: number; wastage_pct: number; gross_quantity: number; unit_cost: number | null; cost_per_output_unit: number | null };

export function BomLineRow({ bomId, line, costs, currency }: { bomId: string; line: Line; costs: boolean; currency: string }) {
  const router = useRouter();
  const [qty, setQty] = React.useState(String(line.quantity));
  const [w, setW] = React.useState(String(line.wastage_pct));
  const [pending, start] = React.useTransition();
  const dirty = Number(qty) !== Number(line.quantity) || Number(w) !== Number(line.wastage_pct);
  const save = () =>
    start(async () => {
      const r = await updateBomLine(bomId, line.bom_item_id, { quantity: qty, wastage_pct: w });
      if (!r.ok) return void toast.error(r.fieldErrors ? Object.values(r.fieldErrors).join(", ") : r.error);
      toast.success("Line updated");
      router.refresh();
    });
  return (
    <TR>
      <TD className="text-muted">{line.line_no}</TD>
      <TD>
        {line.name} <span className="font-mono text-xs text-muted">{line.code}</span>
      </TD>
      <TD align="right">
        <div className="flex items-center justify-end gap-1">
          <Input className="h-8 w-24 text-right" type="number" step="any" min="0" value={qty} onChange={(e) => setQty(e.target.value)} aria-label={`Quantity for ${line.name}`} />
          <span className="w-8 text-left text-xs text-muted">{line.uom_code}</span>
        </div>
      </TD>
      <TD align="right">
        <Input className="h-8 w-20 text-right" type="number" step="any" min="0" max="99" value={w} onChange={(e) => setW(e.target.value)} aria-label={`Wastage for ${line.name}`} />
      </TD>
      <TD align="right">{formatQty(line.gross_quantity, 4)}</TD>
      {costs && <TD align="right">{formatMoney(line.unit_cost, currency)}</TD>}
      {costs && <TD align="right">{formatMoney(line.cost_per_output_unit, currency)}</TD>}
      <TD align="right">
        <div className="flex justify-end gap-1">
          {dirty && (
            <Button size="sm" variant="primary" onClick={save} loading={pending}>
              Save
            </Button>
          )}
          <ActionButton size="icon-sm" variant="ghost" aria-label={`Remove ${line.name}`} action={() => removeBomLine(bomId, line.bom_item_id)}>
            <Trash2 />
          </ActionButton>
        </div>
      </TD>
    </TR>
  );
}
