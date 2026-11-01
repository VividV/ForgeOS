"use client";
import { Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";
import { saveCustomerOrder } from "@/app/actions/sales";
import { Button } from "@/components/ui/button";
import { Field, FormError, Input, Select, Textarea } from "@/components/ui/form";
import { formatMoney, formatQty } from "@/lib/format";

type Item = { value: string; label: string; uom: string; price: number; available: Record<string, number> };
type Cust = { value: string; label: string; payment_terms: string | null; address: string | null };
export type SoLine = { stock_item_id: string; quantity: string; unit_price: string; discount_pct: string; tax_pct: string; description: string };
export type SoHeader = { customer_id: string; warehouse_id: string; requested_date: string; customer_reference: string; payment_terms: string; shipping_address: string; notes: string; shipping_charge: string };

const blank: SoLine = { stock_item_id: "", quantity: "", unit_price: "", discount_pct: "", tax_pct: "", description: "" };

export function CustomerOrderForm({ id, items, customers, warehouses, currency, header, lines: initial, defaultTax }: {
  id: string | null;
  items: Item[];
  customers: Cust[];
  warehouses: { value: string; label: string }[];
  currency: string;
  header: SoHeader;
  lines: SoLine[];
  defaultTax: string;
}) {
  const router = useRouter();
  const [h, setH] = React.useState(header);
  const [lines, setLines] = React.useState<SoLine[]>(initial.length ? initial : [{ ...blank, tax_pct: defaultTax }]);
  const [error, setError] = React.useState<string | null>(null);
  const [pending, start] = React.useTransition();
  const set = (i: number, p: Partial<SoLine>) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...p } : l)));
  const n = (v: string) => (v === "" ? 0 : Number(v));
  const gross = (l: SoLine) => n(l.quantity) * n(l.unit_price);
  const sub = lines.reduce((s, l) => s + gross(l), 0);
  const disc = lines.reduce((s, l) => s + gross(l) * (n(l.discount_pct) / 100), 0);
  const tax = lines.reduce((s, l) => s + gross(l) * (1 - n(l.discount_pct) / 100) * (n(l.tax_pct) / 100), 0);
  const total = sub - disc + tax + n(h.shipping_charge);

  const pickCustomer = (cid: string) => {
    const c = customers.find((x) => x.value === cid);
    setH((x) => ({ ...x, customer_id: cid, payment_terms: x.payment_terms || c?.payment_terms || "", shipping_address: x.shipping_address || c?.address || "" }));
  };

  const submit = () =>
    start(async () => {
      setError(null);
      const r = await saveCustomerOrder(id, { ...h, lines: lines.filter((l) => l.stock_item_id) });
      if (!r.ok) return setError(r.error + (r.fieldErrors ? ` (${Object.values(r.fieldErrors).join("; ")})` : ""));
      toast.success(r.message ?? "Saved");
      router.push(r.data?.redirect ?? "/commerce/customer-orders");
    });

  return (
    <div className="flex flex-col gap-4">
      <FormError message={error} />
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Customer" htmlFor="so-cust" required>
          <Select id="so-cust" value={h.customer_id} onChange={(e) => pickCustomer(e.target.value)}>
            <option value="" disabled>
              Select…
            </option>
            {customers.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Ship from" htmlFor="so-wh" required>
          <Select id="so-wh" value={h.warehouse_id} onChange={(e) => setH({ ...h, warehouse_id: e.target.value })}>
            {warehouses.map((w) => (
              <option key={w.value} value={w.value}>
                {w.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Customer wants it by" htmlFor="so-date">
          <Input id="so-date" type="date" value={h.requested_date} onChange={(e) => setH({ ...h, requested_date: e.target.value })} />
        </Field>
      </div>
      <div className="overflow-x-auto rounded-lg border border-line">
        <table className="w-full text-[13px]">
          <thead className="bg-subtle/60 text-left text-[11.5px] uppercase tracking-wide text-muted">
            <tr>
              <th className="px-3 py-2 font-medium">Product</th>
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
              const avail = it ? (it.available[h.warehouse_id] ?? 0) : null;
              return (
                <tr key={i}>
                  <td className="px-3 py-2">
                    <Select
                      className="h-8 min-w-56"
                      aria-label="Product"
                      value={l.stock_item_id}
                      onChange={(e) => {
                        const x = items.find((y) => y.value === e.target.value);
                        set(i, { stock_item_id: e.target.value, unit_price: l.unit_price || (x && x.price ? String(x.price) : "") });
                      }}
                    >
                      <option value="">Choose…</option>
                      {items.map((x) => (
                        <option key={x.value} value={x.value}>
                          {x.label}
                        </option>
                      ))}
                    </Select>
                    {avail !== null && (
                      <p className={`mt-1 text-xs ${avail < n(l.quantity) ? "text-warning-ink" : "text-muted"}`}>
                        {formatQty(avail)} {it?.uom} free in this warehouse{avail < n(l.quantity) ? " · the rest will need production" : ""}
                      </p>
                    )}
                  </td>
                  <td className="px-3 py-2 align-top">
                    <Input className="h-8 w-24 text-right" type="number" min="0" step="any" aria-label="Quantity" value={l.quantity} onChange={(e) => set(i, { quantity: e.target.value })} />
                  </td>
                  <td className="px-3 py-2 align-top">
                    <Input className="h-8 w-28 text-right" type="number" min="0" step="any" aria-label="Unit price" value={l.unit_price} onChange={(e) => set(i, { unit_price: e.target.value })} />
                  </td>
                  <td className="px-3 py-2 align-top">
                    <Input className="h-8 w-20 text-right" type="number" min="0" max="100" step="any" aria-label="Discount percent" value={l.discount_pct} onChange={(e) => set(i, { discount_pct: e.target.value })} />
                  </td>
                  <td className="px-3 py-2 align-top">
                    <Input className="h-8 w-20 text-right" type="number" min="0" max="100" step="any" aria-label="Tax percent" value={l.tax_pct} onChange={(e) => set(i, { tax_pct: e.target.value })} />
                  </td>
                  <td className="tabular px-3 py-2 text-right align-top">{formatMoney(gross(l) * (1 - n(l.discount_pct) / 100) * (1 + n(l.tax_pct) / 100), currency)}</td>
                  <td className="px-2 align-top">
                    <Button size="icon-sm" variant="ghost" aria-label="Remove line" disabled={lines.length === 1} onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))}>
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
        <Button size="sm" onClick={() => setLines((ls) => [...ls, { ...blank, tax_pct: defaultTax }])}>
          <Plus /> Add product
        </Button>
        <dl className="tabular grid w-full max-w-xs grid-cols-2 gap-y-1 text-[13px]">
          <dt className="text-muted">Subtotal</dt>
          <dd className="text-right">{formatMoney(sub, currency)}</dd>
          <dt className="text-muted">Discounts</dt>
          <dd className="text-right">−{formatMoney(disc, currency)}</dd>
          <dt className="text-muted">Tax</dt>
          <dd className="text-right">{formatMoney(tax, currency)}</dd>
          <dt className="text-muted">
            <label htmlFor="so-ship">Delivery charge</label>
          </dt>
          <dd className="text-right">
            <Input id="so-ship" className="ml-auto h-7 w-28 text-right" type="number" min="0" step="any" value={h.shipping_charge} onChange={(e) => setH({ ...h, shipping_charge: e.target.value })} />
          </dd>
          <dt className="border-t border-line pt-1 font-semibold">Total</dt>
          <dd className="border-t border-line pt-1 text-right font-semibold">{formatMoney(total, currency)}</dd>
        </dl>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Customer's PO / reference" htmlFor="so-ref">
          <Input id="so-ref" value={h.customer_reference} onChange={(e) => setH({ ...h, customer_reference: e.target.value })} />
        </Field>
        <Field label="Payment terms" htmlFor="so-terms">
          <Input id="so-terms" value={h.payment_terms} onChange={(e) => setH({ ...h, payment_terms: e.target.value })} />
        </Field>
        <Field label="Delivery address" htmlFor="so-addr">
          <Textarea id="so-addr" value={h.shipping_address} onChange={(e) => setH({ ...h, shipping_address: e.target.value })} />
        </Field>
        <Field label="Notes" htmlFor="so-notes">
          <Textarea id="so-notes" value={h.notes} onChange={(e) => setH({ ...h, notes: e.target.value })} />
        </Field>
      </div>
      <div className="flex justify-end gap-2 border-t border-line pt-4">
        <Button variant="ghost" onClick={() => router.back()}>
          Cancel
        </Button>
        <Button variant="primary" loading={pending} onClick={submit}>
          {id ? "Save changes" : "Create order"}
        </Button>
      </div>
    </div>
  );
}
