"use client";
import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Field, FormError, Input, Select, Textarea } from "@/components/ui/form";
import { postGoodsReceipt } from "@/app/actions/procurement";
import { formatQty } from "@/lib/format";
import { idempotencyKey } from "@/lib/utils";

type Line = { id: string; name: string; uom: string; outstanding: number; ordered: number };
type Entry = { received: string; rejected: string; rejection_reason: string; discrepancy_note: string };

export function ReceiveForm({ poId, lines, warehouses, defaultWarehouse }: { poId: string; lines: Line[]; warehouses: { value: string; label: string }[]; defaultWarehouse: string }) {
  const router = useRouter();
  const [rows, setRows] = React.useState<Record<string, Entry>>(Object.fromEntries(lines.map((l) => [l.id, { received: l.outstanding > 0 ? String(+l.outstanding.toFixed(4)) : "", rejected: "", rejection_reason: "", discrepancy_note: "" }])));
  const [wh, setWh] = React.useState(defaultWarehouse);
  const [dn, setDn] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [pending, start] = React.useTransition();
  const idem = React.useRef(idempotencyKey());
  const set = (id: string, p: Partial<Entry>) => setRows((r) => ({ ...r, [id]: { ...r[id], ...p } }));

  const submit = () =>
    start(async () => {
      setError(null);
      const r = await postGoodsReceipt(poId, {
        warehouse_id: wh,
        delivery_note: dn,
        notes,
        idem: idem.current,
        lines: lines.map((l) => ({ po_item_id: l.id, ...rows[l.id] })),
      });
      if (!r.ok) return setError(r.error);
      toast.success(r.message ?? "Posted");
      router.push(r.data?.redirect ?? `/commerce/purchase-orders/${poId}`);
    });

  return (
    <div className="flex flex-col gap-4">
      <FormError message={error} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Received into" htmlFor="gr-wh">
          <Select id="gr-wh" value={wh} onChange={(e) => setWh(e.target.value)}>
            {warehouses.map((w) => (
              <option key={w.value} value={w.value}>
                {w.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Supplier delivery note no." htmlFor="gr-dn">
          <Input id="gr-dn" value={dn} onChange={(e) => setDn(e.target.value)} />
        </Field>
      </div>
      <div className="overflow-x-auto rounded-lg border border-line">
        <table className="w-full text-[13px]">
          <thead className="bg-subtle/60 text-left text-[11.5px] uppercase tracking-wide text-muted">
            <tr>
              <th className="px-3 py-2 font-medium">Material</th>
              <th className="px-3 py-2 text-right font-medium">Outstanding</th>
              <th className="px-3 py-2 font-medium">Received</th>
              <th className="px-3 py-2 font-medium">Rejected</th>
              <th className="px-3 py-2 text-right font-medium">Accepted</th>
              <th className="px-3 py-2 font-medium">Reason / discrepancy</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {lines.map((l) => {
              const e = rows[l.id];
              const acc = Number(e.received || 0) - Number(e.rejected || 0);
              const short = Number(e.received || 0) > 0 && Number(e.received || 0) < l.outstanding;
              return (
                <tr key={l.id}>
                  <td className="px-3 py-2">{l.name}</td>
                  <td className="tabular px-3 py-2 text-right">
                    {formatQty(l.outstanding)} {l.uom}
                  </td>
                  <td className="px-3 py-2">
                    <Input className="h-8 w-24 text-right" type="number" min="0" step="any" value={e.received} onChange={(ev) => set(l.id, { received: ev.target.value })} aria-label={`Received ${l.name}`} />
                  </td>
                  <td className="px-3 py-2">
                    <Input className="h-8 w-24 text-right" type="number" min="0" step="any" value={e.rejected} onChange={(ev) => set(l.id, { rejected: ev.target.value })} aria-label={`Rejected ${l.name}`} />
                  </td>
                  <td className={`tabular px-3 py-2 text-right font-medium ${acc > l.outstanding + 1e-9 ? "text-danger-ink" : ""}`}>{formatQty(Math.max(acc, 0))}</td>
                  <td className="px-3 py-2">
                    <div className="flex flex-col gap-1">
                      {Number(e.rejected || 0) > 0 && <Input className="h-8" placeholder="Why rejected? (required)" value={e.rejection_reason} onChange={(ev) => set(l.id, { rejection_reason: ev.target.value })} aria-label={`Rejection reason ${l.name}`} />}
                      {(short || Number(e.rejected || 0) > 0) && <Input className="h-8" placeholder={short ? "Short delivery note (optional)" : "Other discrepancy (optional)"} value={e.discrepancy_note} onChange={(ev) => set(l.id, { discrepancy_note: ev.target.value })} aria-label={`Discrepancy ${l.name}`} />}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <Field label="Notes" htmlFor="gr-notes">
        <Textarea id="gr-notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Field>
      <div className="flex justify-end gap-2 border-t border-line pt-4">
        <Button variant="ghost" onClick={() => router.back()}>
          Cancel
        </Button>
        <Button variant="primary" loading={pending} onClick={submit}>
          Post goods receipt
        </Button>
      </div>
    </div>
  );
}
