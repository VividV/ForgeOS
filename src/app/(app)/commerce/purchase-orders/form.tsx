"use client";
import { Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Field, FormError, Input, Select, Textarea } from "@/components/ui/form";
import { savePurchaseOrder } from "@/app/actions/procurement";
import { formatMoney } from "@/lib/format";

type Item = { value: string; label: string; uom: string; cost: number };
export type PoLine = { stock_item_id: string; quantity: string; unit_price: string; discount_pct: string; tax_pct: string; description: string; requisition_item_id?: string };
export type PoHeader = { supplier_id: string; warehouse_id: string; expected_date: string; payment_terms: string; notes: string; shipping_cost: string; requisition_id?: string };

export function PurchaseOrderForm({
  id,
  items,
  suppliers,
  warehouses,
  currency,
  header,
  lines: initialLines,
}: {
  id: string | null;
  items: Item[];
  suppliers: { value: string; label: string }[];
  warehouses: { value: string; label: string }[];
  currency: string;
  header: PoHeader;
  lines: PoLine[];
}) {
  const router = useRouter();
  const [h, setH] = React.useState(header);
  const [lines, setLines] = React.useState<PoLine[]>(initialLines.length ? initialLines : [{ stock_item_id: "", quantity: "", unit_price: "", discount_pct: "", tax_pct: "", description: "" }]);
  const [error, setError] = React.useState<string | null>(null);
  const [pending, start] = React.useTransition();
  const set = (i: number, p: Partial<PoLine>) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...p } : l)));
  const n = (v: string) => (v === "" ? 0 : Number(v));
  const lineTotal = (l: PoLine) => n(l.quantity) * n(l.unit_price) * (1 - n(l.discount_pct) / 100) * (1 + n(l.tax_pct) / 100);
  const sub = lines.reduce((s, l) => s + n(l.quantity) * n(l.unit_price), 0);
  const disc = lines.reduce((s, l) => s + n(l.quantity) * n(l.unit_price) * (n(l.discount_pct) / 100), 0);
  const tax = lines.reduce((s, l) => s + n(l.quantity) * n(l.unit_price) * (1 - n(l.discount_pct) / 100) * (n(l.tax_pct) / 100), 0);
  const total = sub - disc + tax + n(h.shipping_cost);

  const submit = () =>
    start(async () => {
      setError(null);
      const r = await savePurchaseOrder(id, { ...h, lines: lines.filter((l) => l.stock_item_id) });
      if (!r.ok) return setError(r.error + (r.fieldErrors ? ` (${Object.values(r.fieldErrors).join("; ")})` : ""));
      toast.success(r.message ?? "Saved");
      router.push(r.data?.redirect ?? "/commerce/purchase-orders");
    });

  return (
    <div className="flex flex-col gap-4">
      <FormError message={error} />
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Supplier" htmlFor="po-sup" required>
          <Select id="po-sup" value={h.supplier_id} onChange={(e) => setH({ ...h, supplier_id: e.target.value })}>
            <option value="" disabled>
              Select…
            </option>
            {suppliers.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Deliver to" htmlFor="po-wh" required>
          <Select id="po-wh" value={h.warehouse_id} onChange={(e) => setH({ ...h, warehouse_id: e.target.value })}>
            {warehouses.map((w) => (
              <option key={w.value} value={w.value}>
                {w.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Expected delivery" htmlFor="po-exp">
          <Input id="po-exp" type="date" value={h.expected_date} onChange={(e) => setH({ ...h, expected_date: e.target.value })} />
        </Field>
      </div>
      <div className="overflow-x-auto rounded-lg border border-line">
        <table className="w-full text-[13px]">
          <thead className="bg-subtle/60 text-left text-[11.5px] uppercase tracking-wide text-muted">
            <tr>
              <th className="px-3 py-2 font-medium">Material</th>
              <th className="px-3 py-2 font-medium">Qty</th>
              <th className="px-3 py-2 font-medium">Unit price</th>
              <th className="px-3 py-2 font-medium">Disc %</th>
              <th className="px-3 py-2 font-medium">Tax %</th>
              <th className="px-3 py-2 text-right font-medium">Line total</th>
              <th />
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {lines.map((l, i) => {
              const it = items.find((x) => x.value === l.stock_item_id);
              return (
                <tr key={i}>
                  <td className="px-3 py-2">
                    <Select
                      className="h-8 min-w-52"
                      value={l.stock_item_id}
                      aria-label="Material"
                      onChange={(e) => {
                        const x = items.find((y) => y.value === e.target.value);
                        set(i, { stock_item_id: e.target.value, unit_price: l.unit_price || (x && x.cost ? String(x.cost) : "") });
                      }}
                    >
                      <option value="">Choose…</option>
                      {items.map((x) => (
                        <option key={x.value} value={x.value}>
                          {x.label}
                        </option>
                      ))}
                    </Select>
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-1">
                      <Input className="h-8 w-24 text-right" type="number" min="0" step="any" value={l.quantity} onChange={(e) => set(i, { quantity: e.target.value })} aria-label="Quantity" />
                      <span className="text-xs text-muted">{it?.uom}</span>
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    <Input className="h-8 w-28 text-right" type="number" min="0" step="any" value={l.unit_price} onChange={(e) => set(i, { unit_price: e.target.value })} aria-label="Unit price" />
                  </td>
                  <td className="px-3 py-2">
                    <Input className="h-8 w-20 text-right" type="number" min="0" max="100" step="any" value={l.discount_pct} onChange={(e) => set(i, { discount_pct: e.target.value })} aria-label="Discount percent" />
                  </td>
                  <td className="px-3 py-2">
                    <Input className="h-8 w-20 text-right" type="number" min="0" max="100" step="any" value={l.tax_pct} onChange={(e) => set(i, { tax_pct: e.target.value })} aria-label="Tax percent" />
                  </td>
                  <td className="tabular px-3 py-2 text-right">{formatMoney(lineTotal(l), currency)}</td>
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
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <Button size="sm" onClick={() => setLines((ls) => [...ls, { stock_item_id: "", quantity: "", unit_price: "", discount_pct: "", tax_pct: "", description: "" }])}>
          <Plus /> Add line
        </Button>
        <dl className="tabular grid w-full max-w-xs grid-cols-2 gap-y-1 text-[13px]">
          <dt className="text-muted">Subtotal</dt>
          <dd className="text-right">{formatMoney(sub, currency)}</dd>
          <dt className="text-muted">Discounts</dt>
          <dd className="text-right">−{formatMoney(disc, currency)}</dd>
          <dt className="text-muted">Tax</dt>
          <dd className="text-right">{formatMoney(tax, currency)}</dd>
          <dt className="text-muted">
            <label htmlFor="po-ship">Shipping</label>
          </dt>
          <dd className="text-right">
            <Input id="po-ship" className="ml-auto h-7 w-28 text-right" type="number" min="0" step="any" value={h.shipping_cost} onChange={(e) => setH({ ...h, shipping_cost: e.target.value })} />
          </dd>
          <dt className="border-t border-line pt-1 font-semibold">Total</dt>
          <dd className="border-t border-line pt-1 text-right font-semibold">{formatMoney(total, currency)}</dd>
        </dl>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Payment terms" htmlFor="po-terms">
          <Input id="po-terms" value={h.payment_terms} onChange={(e) => setH({ ...h, payment_terms: e.target.value })} placeholder="e.g. 50% upfront, balance on delivery" />
        </Field>
        <Field label="Notes to supplier" htmlFor="po-notes">
          <Textarea id="po-notes" value={h.notes} onChange={(e) => setH({ ...h, notes: e.target.value })} className="min-h-9" />
        </Field>
      </div>
      <p className="text-xs text-muted">Stock is valued at the unit price after discount. Tax and shipping are recorded on the order but not added to stock value.</p>
      <div className="flex justify-end gap-2 border-t border-line pt-4">
        <Button variant="ghost" onClick={() => router.back()}>
          Cancel
        </Button>
        <Button variant="primary" loading={pending} onClick={submit}>
          {id ? "Save changes" : "Create purchase order"}
        </Button>
      </div>
    </div>
  );
}
