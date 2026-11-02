import { notFound } from "next/navigation";
import { PrintButton } from "@/components/ui/print-button";
import { getSession, requirePermission } from "@/lib/auth";
import { formatDate, formatMoney, formatQty } from "@/lib/format";

export const metadata = { title: "Purchase order" };

export default async function PrintPo({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requirePermission("procurement.read");
  const { supabase } = await getSession();
  const { data: po } = await supabase.from("purchase_orders").select("*, suppliers(name, contact_name, phone, email, address), warehouses(name, address)").eq("id", id).eq("organization_id", ctx.org.id).maybeSingle();
  if (!po) notFound();
  const { data: lines } = await supabase.from("purchase_order_items").select("*, stock_item_details(name, code, uom_code)").eq("purchase_order_id", id).order("line_no");
  const s = po.suppliers as unknown as { name: string; contact_name: string | null; phone: string | null; email: string | null; address: string | null };
  const w = po.warehouses as unknown as { name: string; address: string | null };
  const df = ctx.settings.date_format;
  const cur = po.currency;
  const draft = ["draft", "pending_approval"].includes(po.status);
  return (
    <div className="mx-auto max-w-3xl">
      <div className="no-print mb-4 flex justify-end">
        <PrintButton label="Print purchase order" />
      </div>
      <article className="relative rounded-lg border border-ink/80 bg-white p-8 text-ink print:border-0 print:p-0">
        {draft && <p className="absolute right-8 top-8 rotate-6 rounded border-2 border-danger px-3 py-1 text-sm font-bold uppercase tracking-widest text-danger">Not approved</p>}
        <header className="flex items-start justify-between gap-6 border-b-2 border-ink pb-4">
          <div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {ctx.org.logo_url && <img src={ctx.org.logo_url} alt="" className="mb-2 h-12 w-auto" />}
            <p className="text-lg font-bold">{ctx.org.name}</p>
            <p className="text-xs uppercase tracking-widest text-muted">Purchase order</p>
          </div>
          <div className="text-right text-sm">
            <p className="font-mono text-2xl font-bold">{po.number}</p>
            <p>Date: {formatDate(po.order_date, df)}</p>
            {po.expected_date && <p>Deliver by: {formatDate(po.expected_date, df)}</p>}
          </div>
        </header>
        <section className="grid grid-cols-2 gap-6 border-b border-line py-4 text-sm">
          <div>
            <h2 className="text-xs font-semibold uppercase text-muted">Supplier</h2>
            <p className="mt-1 font-semibold">{s.name}</p>
            {s.contact_name && <p>{s.contact_name}</p>}
            {s.address && <p className="whitespace-pre-line">{s.address}</p>}
            <p>{[s.phone, s.email].filter(Boolean).join(" · ")}</p>
          </div>
          <div>
            <h2 className="text-xs font-semibold uppercase text-muted">Deliver to</h2>
            <p className="mt-1 font-semibold">{w.name}</p>
            {w.address && <p className="whitespace-pre-line">{w.address}</p>}
          </div>
        </section>
        <table className="mt-4 w-full text-sm">
          <thead className="border-b border-ink text-left text-xs uppercase">
            <tr>
              <th className="py-2">#</th>
              <th className="py-2">Item</th>
              <th className="py-2 text-right">Qty</th>
              <th className="py-2 text-right">Unit price</th>
              <th className="py-2 text-right">Disc</th>
              <th className="py-2 text-right">Tax</th>
              <th className="py-2 text-right">Amount</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {(lines ?? []).map((l) => {
              const d = l.stock_item_details as unknown as { name: string; code: string; uom_code: string };
              return (
                <tr key={l.id}>
                  <td className="py-2">{l.line_no}</td>
                  <td className="py-2">
                    {d.name} <span className="font-mono text-xs">{d.code}</span>
                    {l.description && <div className="text-xs text-ink-soft">{l.description}</div>}
                  </td>
                  <td className="tabular py-2 text-right">
                    {formatQty(l.quantity)} {d.uom_code}
                  </td>
                  <td className="tabular py-2 text-right">{formatMoney(l.unit_price, cur)}</td>
                  <td className="tabular py-2 text-right">{Number(l.discount_pct) ? `${formatQty(l.discount_pct)}%` : "—"}</td>
                  <td className="tabular py-2 text-right">{Number(l.tax_pct) ? `${formatQty(l.tax_pct)}%` : "—"}</td>
                  <td className="tabular py-2 text-right">{formatMoney(l.line_total, cur)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <dl className="tabular ml-auto mt-4 grid w-64 grid-cols-2 gap-y-1 text-sm">
          <dt>Subtotal</dt>
          <dd className="text-right">{formatMoney(po.subtotal, cur)}</dd>
          {Number(po.discount_total) > 0 && (
            <>
              <dt>Discounts</dt>
              <dd className="text-right">−{formatMoney(po.discount_total, cur)}</dd>
            </>
          )}
          <dt>Tax</dt>
          <dd className="text-right">{formatMoney(po.tax_total, cur)}</dd>
          {Number(po.shipping_cost) > 0 && (
            <>
              <dt>Shipping</dt>
              <dd className="text-right">{formatMoney(po.shipping_cost, cur)}</dd>
            </>
          )}
          <dt className="border-t-2 border-ink pt-1 font-bold">Total</dt>
          <dd className="border-t-2 border-ink pt-1 text-right font-bold">{formatMoney(po.total, cur)}</dd>
        </dl>
        {(po.payment_terms || po.notes) && (
          <section className="mt-6 border-t border-line pt-4 text-sm">
            {po.payment_terms && (
              <p>
                <strong>Payment terms:</strong> {po.payment_terms}
              </p>
            )}
            {po.notes && <p className="mt-1 whitespace-pre-line">{po.notes}</p>}
          </section>
        )}
        <footer className="mt-10 grid grid-cols-2 gap-10 text-xs">
          <div className="border-t border-ink pt-1">Authorised by</div>
          <div className="border-t border-ink pt-1">Supplier acknowledgement</div>
        </footer>
      </article>
    </div>
  );
}
