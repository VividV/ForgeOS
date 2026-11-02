"use client";
import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";
import { recordReturn } from "@/app/actions/ops";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, FormError, Input, Select, Textarea } from "@/components/ui/form";
import { formatQty } from "@/lib/format";
import { idempotencyKey } from "@/lib/utils";

type Line = { id: string; name: string; uom: string; returnable: number };

export function ReturnForm({ orderId, lines, warehouses, defaultWarehouse, canCredit }: { orderId: string; lines: Line[]; warehouses: { value: string; label: string }[]; defaultWarehouse: string; canCredit: boolean }) {
  const router = useRouter();
  const [rows, setRows] = React.useState<Record<string, { quantity: string; condition: "restock" | "damaged" }>>(Object.fromEntries(lines.map((l) => [l.id, { quantity: "", condition: "restock" }])));
  const [reason, setReason] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [wh, setWh] = React.useState(defaultWarehouse);
  const [credit, setCredit] = React.useState(canCredit);
  const [error, setError] = React.useState<string | null>(null);
  const [pending, start] = React.useTransition();
  const idem = React.useRef(idempotencyKey());
  const submit = () =>
    start(async () => {
      setError(null);
      const r = await recordReturn(orderId, { reason, notes, warehouse_id: wh, credit, idem: idem.current, lines: lines.map((l) => ({ so_item_id: l.id, ...rows[l.id] })) });
      if (!r.ok) return setError(r.error);
      toast.success(r.message ?? "Recorded");
      router.push(r.data?.redirect ?? `/commerce/customer-orders/${orderId}`);
    });
  return (
    <div className="flex flex-col gap-4">
      <FormError message={error} />
      <div className="overflow-x-auto rounded-lg border border-line">
        <table className="w-full text-[13px]">
          <thead className="bg-subtle/60 text-left text-[11.5px] uppercase tracking-wide text-muted">
            <tr>
              <th className="px-3 py-2 font-medium">Product</th>
              <th className="px-3 py-2 text-right font-medium">Can return</th>
              <th className="px-3 py-2 font-medium">Returned</th>
              <th className="px-3 py-2 font-medium">Condition</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {lines.map((l) => (
              <tr key={l.id}>
                <td className="px-3 py-2">{l.name}</td>
                <td className="tabular px-3 py-2 text-right">
                  {formatQty(l.returnable)} {l.uom}
                </td>
                <td className="px-3 py-2">
                  <Input className="h-8 w-24 text-right" type="number" min="0" step="any" aria-label={`Returned ${l.name}`} value={rows[l.id].quantity} onChange={(e) => setRows((x) => ({ ...x, [l.id]: { ...x[l.id], quantity: e.target.value } }))} />
                </td>
                <td className="px-3 py-2">
                  <Select className="h-8 w-48" aria-label={`Condition ${l.name}`} value={rows[l.id].condition} onChange={(e) => setRows((x) => ({ ...x, [l.id]: { ...x[l.id], condition: e.target.value as "restock" | "damaged" } }))}>
                    <option value="restock">Good: back into stock</option>
                    <option value="damaged">Damaged: not restocked</option>
                  </Select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Reason" htmlFor="r-reason" required>
          <Input id="r-reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Wrong size, faulty seam" />
        </Field>
        <Field label="Restock into" htmlFor="r-wh">
          <Select id="r-wh" value={wh} onChange={(e) => setWh(e.target.value)}>
            {warehouses.map((w) => (
              <option key={w.value} value={w.value}>
                {w.label}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <Field label="Notes" htmlFor="r-notes">
        <Textarea id="r-notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Field>
      {canCredit && <Checkbox label="Issue a credit note for the returned goods (at the price charged)" checked={credit} onChange={(e) => setCredit(e.target.checked)} />}
      <div className="flex justify-end gap-2 border-t border-line pt-4">
        <Button variant="ghost" onClick={() => router.back()}>
          Cancel
        </Button>
        <Button variant="primary" loading={pending} onClick={submit}>
          Record return
        </Button>
      </div>
    </div>
  );
}
