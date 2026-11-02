import { notFound } from "next/navigation";
import { PrintButton } from "@/components/ui/print-button";
import { getSession, requirePermission } from "@/lib/auth";
import { formatDate, formatMoney, formatQty } from "@/lib/format";

export const metadata = { title: "Pro-forma invoice" };

export default async function PrintCustomerOrder({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requirePermission("sales_orders.read");
  const { supabase } = await getSession();
  const [{ data: so }, { data: org }] = await Promise.all([
    supabase.from("sales_orders").select("*, customers(name, contact_name, phone, email, billing_address, tax_id)").eq("id", id).eq("organization_id", ctx.org.id).maybeSingle(),
    supabase.from("organizations").select("name, address, phone, email, website").eq("id", ctx.org.id).single(),
  ]);
  if (!so) notFound();
  const { data: lines } = await supabase.from("sales_order_items").select("*, stock_item_details(name, code, uom_code)").eq("sales_order_id", id).order("line_no");
  const c = so.customers as unknown as { name: string; contact_name: string | null; phone: string | null; email: string | null; billing_address: string | null; tax_id: string | null };
  const cur = so.currency;
  const df = ctx.settings.date_format;
  const balance = Number(so.total) - Number(so.amount_paid);
  return (
    <div className="mx-auto max-w-3xl">
      <div className="no-print mb-4 flex justify-end">
        <PrintButton label="Print pro-forma" />
      </div>
      <article className="relative rounded-lg border border-ink/80 bg-white p-8 text-ink print:border-0 print:p-0">
        {so.status === "cancelled" && <p className="absolute right-8 top-8 rotate-6 rounded border-2 border-danger px-3 py-1 text-sm font-bold uppercase tracking-widest text-danger">Cancelled</p>}
        <header className="flex items-start justify-between gap-6 border-b-2 border-ink pb-4">
          <div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {ctx.org.logo_url && <img src={ctx.org.logo_url} alt="" className="mb-2 h-12 w-auto" />}
            <p className="text-lg font-bold">{org?.name ?? ctx.org.name}</p>
            {org?.address && <p className="whitespace-pre-line text-xs">{org.address}</p>}
            <p className="text-xs">{[org?.phone, org?.email, org?.website].filter(Boolean).join(" · ")}</p>
          </div>
          <div className="text-right text-sm">
            <p className="text-xs uppercase tracking-widest text-muted">Pro-forma invoice</p>
            <p className="font-mono text-2xl font-bold">{so.number}</p>
            <p>Date: {formatDate(so.order_date, df)}</p>
            {so.requested_date && <p>Delivery by: {formatDate(so.requested_date, df)}</p>}
            {so.customer_reference && <p>Your ref: {so.customer_reference}</p>}
          </div>
        </header>
        <section className="grid grid-cols-2 gap-6 border-b border-line py-4 text-sm">
          <div>
            <h2 className="text-xs font-semibold uppercase text-muted">Bill to</h2>
            <p className="mt-1 font-semibold">{c.name}</p>
            {c.contact_name && <p>{c.contact_name}</p>}
            {c.billing_address && <p className="whitespace-pre-line">{c.billing_address}</p>}
            <p>{[c.phone, c.email].filter(Boolean).join(" · ")}</p>
            {c.tax_id && <p>TIN: {c.tax_id}</p>}
          </div>
          <div>
            <h2 className="text-xs font-semibold uppercase text-muted">Deliver to</h2>
            <p className="mt-1 whitespace-pre-line">{so.shipping_address ?? "—"}</p>
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
        <dl className="tabular ml-auto mt-4 grid w-72 grid-cols-2 gap-y-1 text-sm">
          <dt>Subtotal</dt>
          <dd className="text-right">{formatMoney(so.subtotal, cur)}</dd>
          {Number(so.discount_total) > 0 && (
            <>
              <dt>Discounts</dt>
              <dd className="text-right">−{formatMoney(so.discount_total, cur)}</dd>
            </>
          )}
          <dt>Tax</dt>
          <dd className="text-right">{formatMoney(so.tax_total, cur)}</dd>
          {Number(so.shipping_charge) > 0 && (
            <>
              <dt>Delivery</dt>
              <dd className="text-right">{formatMoney(so.shipping_charge, cur)}</dd>
            </>
          )}
          <dt className="border-t-2 border-ink pt-1 font-bold">Total</dt>
          <dd className="border-t-2 border-ink pt-1 text-right font-bold">{formatMoney(so.total, cur)}</dd>
          <dt>Paid</dt>
          <dd className="text-right">{formatMoney(so.amount_paid, cur)}</dd>
          <dt className="font-semibold">Balance due</dt>
          <dd className="text-right font-semibold">{formatMoney(balance, cur)}</dd>
        </dl>
        {(so.payment_terms || so.notes) && (
          <section className="mt-6 border-t border-line pt-4 text-sm">
            {so.payment_terms && (
              <p>
                <strong>Payment terms:</strong> {so.payment_terms}
              </p>
            )}
            {so.notes && <p className="mt-1 whitespace-pre-line">{so.notes}</p>}
          </section>
        )}
        <p className="mt-8 text-xs text-muted">This is a pro-forma invoice, not a tax invoice.</p>
      </article>
    </div>
  );
}
