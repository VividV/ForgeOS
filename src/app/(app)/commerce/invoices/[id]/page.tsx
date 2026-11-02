import Link from "next/link";
import { notFound } from "next/navigation";
import { PrintButton } from "@/components/ui/print-button";
import { getSession, requirePermission } from "@/lib/auth";
import { formatDate, formatMoney, formatQty } from "@/lib/format";
import { VoidInvoice } from "./actions";

export const metadata = { title: "Invoice" };

export default async function InvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requirePermission("sales_orders.read");
  const { supabase } = await getSession();
  const [{ data: inv }, { data: org }] = await Promise.all([
    supabase.from("invoices").select("*, customers(name, contact_name, billing_address, phone, email, tax_id), sales_orders(id, number, customer_reference, shipping_address, total, amount_paid, amount_credited)").eq("id", id).eq("organization_id", ctx.org.id).maybeSingle(),
    supabase.from("organizations").select("name, address, phone, email, website, logo_url, tax_id, invoice_bank_details, invoice_footer").eq("id", ctx.org.id).single(),
  ]);
  if (!inv) notFound();
  const { data: items } = await supabase.from("invoice_items").select("*").eq("invoice_id", id);
  const c = inv.customers as unknown as { name: string; contact_name: string | null; billing_address: string | null; phone: string | null; email: string | null; tax_id: string | null };
  const so = inv.sales_orders as unknown as { id: string; number: string; customer_reference: string | null; shipping_address: string | null; total: number; amount_paid: number; amount_credited: number };
  const cur = inv.currency;
  const df = ctx.settings.date_format;
  const orderBalance = Number(so.total) - Number(so.amount_paid) - Number(so.amount_credited);
  return (
    <div className="mx-auto max-w-3xl">
      <div className="no-print mb-4 flex items-center justify-between gap-2">
        <Link href={`/commerce/customer-orders/${so.id}`} className="text-[13px] text-accent-ink hover:underline">
          ← {so.number}
        </Link>
        <div className="flex gap-2">
          {inv.status === "issued" && ctx.can("sales_orders.manage") && <VoidInvoice id={inv.id} />}
          <PrintButton label="Print / save PDF" />
        </div>
      </div>
      <article className="relative rounded-lg border border-ink/80 bg-white p-8 text-ink print:border-0 print:p-0">
        {inv.status === "void" && <p className="absolute right-8 top-24 rotate-6 rounded border-4 border-danger px-4 py-1 text-2xl font-bold uppercase tracking-widest text-danger">Void</p>}
        <header className="flex items-start justify-between gap-6 border-b-2 border-ink pb-4">
          <div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {org?.logo_url && <img src={org.logo_url} alt="" className="mb-2 h-12 w-auto" />}
            <p className="text-lg font-bold">{org?.name ?? ctx.org.name}</p>
            {org?.address && <p className="whitespace-pre-line text-xs">{org.address}</p>}
            <p className="text-xs">{[org?.phone, org?.email, org?.website].filter(Boolean).join(" · ")}</p>
            {org?.tax_id && <p className="text-xs">TIN: {org.tax_id}</p>}
          </div>
          <div className="text-right text-sm">
            <p className="text-xs font-semibold uppercase tracking-widest">Tax invoice</p>
            <p className="font-mono text-2xl font-bold">{inv.number}</p>
            <p>Date: {formatDate(inv.issue_date, df)}</p>
            {inv.due_date && <p>Due: {formatDate(inv.due_date, df)}</p>}
            <p>Order: {so.number}</p>
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
            <h2 className="text-xs font-semibold uppercase text-muted">Delivered to</h2>
            <p className="mt-1 whitespace-pre-line">{so.shipping_address ?? "—"}</p>
          </div>
        </section>
        <table className="mt-4 w-full text-sm">
          <thead className="border-b border-ink text-left text-xs uppercase">
            <tr>
              <th className="py-2">Description</th>
              <th className="py-2 text-right">Qty</th>
              <th className="py-2 text-right">Unit price</th>
              <th className="py-2 text-right">Disc</th>
              <th className="py-2 text-right">VAT</th>
              <th className="py-2 text-right">Amount</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {(items ?? []).map((l) => (
              <tr key={l.id}>
                <td className="py-2">{l.description}</td>
                <td className="tabular py-2 text-right">{formatQty(l.quantity)}</td>
                <td className="tabular py-2 text-right">{formatMoney(l.unit_price, cur)}</td>
                <td className="tabular py-2 text-right">{Number(l.discount_pct) ? `${formatQty(l.discount_pct)}%` : "—"}</td>
                <td className="tabular py-2 text-right">{Number(l.tax_pct) ? `${formatQty(l.tax_pct)}%` : "—"}</td>
                <td className="tabular py-2 text-right">{formatMoney(l.line_total, cur)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <dl className="tabular ml-auto mt-4 grid w-72 grid-cols-2 gap-y-1 text-sm">
          <dt>Subtotal</dt>
          <dd className="text-right">{formatMoney(inv.subtotal, cur)}</dd>
          {Number(inv.discount_total) > 0 && (
            <>
              <dt>Discounts</dt>
              <dd className="text-right">−{formatMoney(inv.discount_total, cur)}</dd>
            </>
          )}
          <dt>VAT</dt>
          <dd className="text-right">{formatMoney(inv.tax_total, cur)}</dd>
          {Number(inv.shipping_charge) > 0 && (
            <>
              <dt>Delivery</dt>
              <dd className="text-right">{formatMoney(inv.shipping_charge, cur)}</dd>
            </>
          )}
          <dt className="border-t-2 border-ink pt-1 font-bold">Invoice total</dt>
          <dd className="border-t-2 border-ink pt-1 text-right font-bold">{formatMoney(inv.total, cur)}</dd>
          <dt className="pt-2 text-xs text-muted">Balance on order {so.number}</dt>
          <dd className="pt-2 text-right text-xs text-muted">{formatMoney(orderBalance, cur)}</dd>
        </dl>
        {inv.notes && <p className="mt-6 whitespace-pre-line text-sm">{inv.notes}</p>}
        {org?.invoice_bank_details && (
          <section className="mt-6 border-t border-line pt-4 text-sm">
            <h2 className="text-xs font-semibold uppercase text-muted">Payment details</h2>
            <p className="mt-1 whitespace-pre-line">{org.invoice_bank_details}</p>
          </section>
        )}
        {org?.invoice_footer && <p className="mt-6 whitespace-pre-line text-xs text-muted">{org.invoice_footer}</p>}
        {inv.status === "void" && <p className="mt-4 text-xs text-danger-ink">Voided: {inv.void_reason}</p>}
      </article>
    </div>
  );
}
