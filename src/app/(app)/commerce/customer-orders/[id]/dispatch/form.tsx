"use client";
import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";
import { dispatchGoods } from "@/app/actions/sales";
import { Button } from "@/components/ui/button";
import { Field, FormError, Input, Textarea } from "@/components/ui/form";
import { formatQty } from "@/lib/format";
import { idempotencyKey } from "@/lib/utils";

type Line = { id: string; name: string; uom: string; outstanding: number; allocated: number; free: number };

export function DispatchForm({ orderId, lines, address }: { orderId: string; lines: Line[]; address: string | null }) {
  const router = useRouter();
  const [qty, setQty] = React.useState<Record<string, string>>(Object.fromEntries(lines.map((l) => [l.id, l.allocated > 0 ? String(+Math.min(l.allocated, l.outstanding).toFixed(4)) : ""])));
  const [f, setF] = React.useState({ carrier: "", vehicle: "", driver_name: "", tracking_reference: "", notes: "" });
  const [error, setError] = React.useState<string | null>(null);
  const [pending, start] = React.useTransition();
  const idem = React.useRef(idempotencyKey());
  const submit = () =>
    start(async () => {
      setError(null);
      const r = await dispatchGoods(orderId, { ...f, idem: idem.current, lines: lines.map((l) => ({ so_item_id: l.id, quantity: qty[l.id] })) });
      if (!r.ok) return setError(r.error);
      toast.success(r.message ?? "Dispatched");
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
              <th className="px-3 py-2 text-right font-medium">Still to send</th>
              <th className="px-3 py-2 text-right font-medium">Held for this order</th>
              <th className="px-3 py-2 text-right font-medium">Other free stock</th>
              <th className="px-3 py-2 font-medium">Dispatch now</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {lines.map((l) => {
              const q = Number(qty[l.id] || 0);
              const over = q > l.allocated + l.free + 1e-9;
              return (
                <tr key={l.id}>
                  <td className="px-3 py-2">{l.name}</td>
                  <td className="tabular px-3 py-2 text-right">
                    {formatQty(l.outstanding)} {l.uom}
                  </td>
                  <td className="tabular px-3 py-2 text-right text-success">{formatQty(l.allocated)}</td>
                  <td className="tabular px-3 py-2 text-right text-muted">{formatQty(l.free)}</td>
                  <td className="px-3 py-2">
                    <Input className="h-8 w-24 text-right" type="number" min="0" step="any" aria-label={`Dispatch ${l.name}`} value={qty[l.id]} onChange={(e) => setQty((x) => ({ ...x, [l.id]: e.target.value }))} />
                    {over && <p className="mt-1 text-xs text-danger-ink">Not enough stock</p>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {address && (
        <p className="text-[13px]">
          <span className="text-muted">Deliver to:</span> <span className="whitespace-pre-line">{address}</span>
        </p>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Carrier / logistics company" htmlFor="d-carrier">
          <Input id="d-carrier" value={f.carrier} onChange={(e) => setF({ ...f, carrier: e.target.value })} placeholder="e.g. GIG Logistics, own van" />
        </Field>
        <Field label="Waybill / tracking no." htmlFor="d-track">
          <Input id="d-track" value={f.tracking_reference} onChange={(e) => setF({ ...f, tracking_reference: e.target.value })} />
        </Field>
        <Field label="Driver" htmlFor="d-driver">
          <Input id="d-driver" value={f.driver_name} onChange={(e) => setF({ ...f, driver_name: e.target.value })} />
        </Field>
        <Field label="Vehicle" htmlFor="d-vehicle">
          <Input id="d-vehicle" value={f.vehicle} onChange={(e) => setF({ ...f, vehicle: e.target.value })} />
        </Field>
      </div>
      <Field label="Notes" htmlFor="d-notes">
        <Textarea id="d-notes" value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} />
      </Field>
      <div className="flex justify-end gap-2 border-t border-line pt-4">
        <Button variant="ghost" onClick={() => router.back()}>
          Cancel
        </Button>
        <Button variant="primary" loading={pending} onClick={submit}>
          Dispatch
        </Button>
      </div>
    </div>
  );
}
