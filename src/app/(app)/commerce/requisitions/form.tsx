"use client";
import { Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Field, FormError, Input, Select, Textarea } from "@/components/ui/form";
import { createRequisition } from "@/app/actions/procurement";
import { formatQty } from "@/lib/format";

type Item = { value: string; label: string; uom: string; available: number };
type Line = { stock_item_id: string; quantity: string; notes: string };

export function RequisitionForm({
  items,
  warehouses,
  initial,
  source,
  productionOrderId,
}: {
  items: Item[];
  warehouses: { value: string; label: string }[];
  initial: Line[];
  source: "manual" | "reorder" | "production_shortage";
  productionOrderId?: string;
}) {
  const router = useRouter();
  const [lines, setLines] = React.useState<Line[]>(initial.length ? initial : [{ stock_item_id: "", quantity: "", notes: "" }]);
  const [wh, setWh] = React.useState(warehouses[0]?.value ?? "");
  const [neededBy, setNeededBy] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [pending, start] = React.useTransition();
  const set = (i: number, p: Partial<Line>) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...p } : l)));

  const submit = () =>
    start(async () => {
      setError(null);
      const r = await createRequisition({
        source,
        production_order_id: productionOrderId ?? "",
        warehouse_id: wh,
        needed_by: neededBy,
        notes,
        lines: lines.filter((l) => l.stock_item_id && l.quantity),
      });
      if (!r.ok) return setError(r.error + (r.fieldErrors ? ` (${Object.values(r.fieldErrors).join("; ")})` : ""));
      toast.success(r.message ?? "Submitted");
      router.push(r.data?.redirect ?? "/commerce/requisitions");
    });

  return (
    <div className="flex flex-col gap-4">
      <FormError message={error} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Deliver to" htmlFor="rq-wh">
          <Select id="rq-wh" value={wh} onChange={(e) => setWh(e.target.value)}>
            {warehouses.map((w) => (
              <option key={w.value} value={w.value}>
                {w.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Needed by" htmlFor="rq-date">
          <Input id="rq-date" type="date" value={neededBy} onChange={(e) => setNeededBy(e.target.value)} />
        </Field>
      </div>
      <div className="overflow-x-auto rounded-lg border border-line">
        <table className="w-full text-[13px]">
          <thead className="bg-subtle/60 text-left text-[11.5px] uppercase tracking-wide text-muted">
            <tr>
              <th className="px-3 py-2 font-medium">Material</th>
              <th className="px-3 py-2 text-right font-medium">Available now</th>
              <th className="px-3 py-2 font-medium">Quantity</th>
              <th className="px-3 py-2 font-medium">Note</th>
              <th />
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {lines.map((l, i) => {
              const it = items.find((x) => x.value === l.stock_item_id);
              return (
                <tr key={i}>
                  <td className="px-3 py-2">
                    <Select className="h-8 min-w-56" value={l.stock_item_id} onChange={(e) => set(i, { stock_item_id: e.target.value })} aria-label="Material">
                      <option value="">Choose…</option>
                      {items.map((x) => (
                        <option key={x.value} value={x.value}>
                          {x.label}
                        </option>
                      ))}
                    </Select>
                  </td>
                  <td className="tabular px-3 py-2 text-right text-muted">{it ? `${formatQty(it.available)} ${it.uom}` : "—"}</td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-1">
                      <Input className="h-8 w-28 text-right" type="number" min="0" step="any" value={l.quantity} onChange={(e) => set(i, { quantity: e.target.value })} aria-label="Quantity" />
                      <span className="text-xs text-muted">{it?.uom}</span>
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    <Input className="h-8" value={l.notes} onChange={(e) => set(i, { notes: e.target.value })} aria-label="Line note" />
                  </td>
                  <td className="px-2">
                    <Button size="icon-sm" variant="ghost" onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))} disabled={lines.length === 1} aria-label="Remove line">
                      <Trash2 />
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div>
        <Button size="sm" onClick={() => setLines((ls) => [...ls, { stock_item_id: "", quantity: "", notes: "" }])}>
          <Plus /> Add material
        </Button>
      </div>
      <Field label="Why is this needed?" htmlFor="rq-notes">
        <Textarea id="rq-notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Field>
      <div className="flex justify-end gap-2 border-t border-line pt-4">
        <Button variant="ghost" onClick={() => router.back()}>
          Cancel
        </Button>
        <Button variant="primary" loading={pending} onClick={submit}>
          Submit requisition
        </Button>
      </div>
    </div>
  );
}
