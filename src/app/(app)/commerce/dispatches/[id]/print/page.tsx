import { notFound } from "next/navigation";
import { PrintButton } from "@/components/ui/print-button";
import { getSession, requirePermission } from "@/lib/auth";
import { formatDateTime, formatQty } from "@/lib/format";

export const metadata = { title: "Delivery note" };

export default async function PrintDeliveryNote({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requirePermission("sales_orders.read");
  const { supabase } = await getSession();
  const [{ data: d }, { data: org }] = await Promise.all([
    supabase.from("dispatches").select("*, sales_orders(number, customer_reference, shipping_address, customers(name, contact_name, phone))").eq("id", id).eq("organization_id", ctx.org.id).maybeSingle(),
    supabase.from("organizations").select("name, address, phone, email").eq("id", ctx.org.id).single(),
  ]);
  if (!d) notFound();
  const { data: items } = await supabase.from("dispatch_items").select("quantity, stock_item_details(name, code, uom_code)").eq("dispatch_id", id);
  const so = d.sales_orders as unknown as { number: string; customer_reference: string | null; shipping_address: string | null; customers: { name: string; contact_name: string | null; phone: string | null } };
  return (
    <div className="mx-auto max-w-3xl">
      <div className="no-print mb-4 flex justify-end">
        <PrintButton label="Print delivery note" />
      </div>
      <article className="rounded-lg border border-ink/80 bg-white p-8 text-ink print:border-0 print:p-0">
        <header className="flex items-start justify-between gap-6 border-b-2 border-ink pb-4">
          <div>
            <p className="text-lg font-bold">{org?.name ?? ctx.org.name}</p>
            {org?.address && <p className="whitespace-pre-line text-xs">{org.address}</p>}
            <p className="text-xs">{[org?.phone, org?.email].filter(Boolean).join(" · ")}</p>
          </div>
          <div className="text-right text-sm">
            <p className="text-xs uppercase tracking-widest text-muted">Delivery note</p>
            <p className="font-mono text-2xl font-bold">{d.number}</p>
            <p>{formatDateTime(d.dispatched_at, ctx.settings.date_format, ctx.settings.timezone)}</p>
            <p>Order {so.number}</p>
            {so.customer_reference && <p>Your ref: {so.customer_reference}</p>}
          </div>
        </header>
        <section className="grid grid-cols-2 gap-6 border-b border-line py-4 text-sm">
          <div>
            <h2 className="text-xs font-semibold uppercase text-muted">Deliver to</h2>
            <p className="mt-1 font-semibold">{so.customers.name}</p>
            {so.customers.contact_name && <p>{so.customers.contact_name}</p>}
            {so.shipping_address && <p className="whitespace-pre-line">{so.shipping_address}</p>}
            {so.customers.phone && <p>{so.customers.phone}</p>}
          </div>
          <div>
            <h2 className="text-xs font-semibold uppercase text-muted">Transport</h2>
            <p className="mt-1">{d.carrier ?? "—"}</p>
            {d.tracking_reference && <p>Waybill: {d.tracking_reference}</p>}
            {(d.driver_name || d.vehicle) && <p>{[d.driver_name, d.vehicle].filter(Boolean).join(" · ")}</p>}
          </div>
        </section>
        <table className="mt-4 w-full text-sm">
          <thead className="border-b border-ink text-left text-xs uppercase">
            <tr>
              <th className="py-2">Item</th>
              <th className="py-2">Code</th>
              <th className="py-2 text-right">Quantity</th>
              <th className="py-2 text-right">Received (tick)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {(items ?? []).map((i, k) => {
              const s = i.stock_item_details as unknown as { name: string; code: string; uom_code: string };
              return (
                <tr key={k}>
                  <td className="py-2">{s.name}</td>
                  <td className="py-2 font-mono text-xs">{s.code}</td>
                  <td className="tabular py-2 text-right">
                    {formatQty(i.quantity)} {s.uom_code}
                  </td>
                  <td className="py-2 text-right">☐</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {d.notes && <p className="mt-4 whitespace-pre-line text-sm">{d.notes}</p>}
        <footer className="mt-12 grid grid-cols-3 gap-8 text-xs">
          <div className="border-t border-ink pt-1">Dispatched by</div>
          <div className="border-t border-ink pt-1">Received by (name & signature)</div>
          <div className="border-t border-ink pt-1">Date</div>
        </footer>
      </article>
    </div>
  );
}
