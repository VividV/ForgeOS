import { Printer } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, DescriptionList } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/misc";
import { TBody, TD, TH, THead, TR, Table } from "@/components/ui/table";
import { getSession, requirePermission } from "@/lib/auth";
import { formatDateTime, formatMoney, formatQty } from "@/lib/format";
import { ConfirmDelivery } from "./client";

export default async function DispatchDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requirePermission("sales_orders.read");
  const { supabase } = await getSession();
  const { data: d } = await supabase
    .from("dispatches")
    .select("*, warehouses(name), sales_orders(id, number, shipping_address, customers(name, phone)), sender:profiles!dispatches_dispatched_by_fkey(full_name), confirmer:profiles!dispatches_delivery_confirmed_by_fkey(full_name)")
    .eq("id", id)
    .eq("organization_id", ctx.org.id)
    .maybeSingle();
  if (!d) notFound();
  const { data: items } = await supabase.from("dispatch_items").select("*, stock_item_details(name, code, uom_code)").eq("dispatch_id", id);
  const so = d.sales_orders as unknown as { id: string; number: string; shipping_address: string | null; customers: { name: string; phone: string | null } };
  const df = ctx.settings.date_format;
  const tz = ctx.settings.timezone;
  const costs = ctx.can("costing.read");
  return (
    <>
      <PageHeader
        title={d.number}
        meta={d.status === "delivered" ? <Badge tone="success">Delivered</Badge> : <Badge tone="info">In transit</Badge>}
        breadcrumb={[{ label: "Dispatches", href: "/commerce/dispatches" }, { label: d.number }]}
        description={`${so.customers.name} · ${so.number}`}
        actions={
          <>
            <Button asChild variant="ghost">
              <Link href={`/commerce/dispatches/${d.id}/print`}>
                <Printer /> Delivery note
              </Link>
            </Button>
            {d.status !== "delivered" && ctx.can("sales_orders.dispatch") && <ConfirmDelivery id={d.id} />}
          </>
        }
      />
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
        <Card>
          <CardHeader title="Goods" />
          <Table>
            <THead>
              <tr>
                <TH>Product</TH>
                <TH align="right">Quantity</TH>
                {costs && <TH align="right">Cost value</TH>}
              </tr>
            </THead>
            <TBody>
              {(items ?? []).map((i) => {
                const s = i.stock_item_details as unknown as { name: string; code: string; uom_code: string };
                return (
                  <TR key={i.id}>
                    <TD>
                      {s.name} <span className="font-mono text-xs text-muted">{s.code}</span>
                    </TD>
                    <TD align="right">
                      {formatQty(i.quantity)} {s.uom_code}
                    </TD>
                    {costs && <TD align="right">{formatMoney(Number(i.quantity) * Number(i.unit_cost), ctx.settings.currency)}</TD>}
                  </TR>
                );
              })}
            </TBody>
          </Table>
        </Card>
        <Card>
          <CardHeader title="Details" />
          <CardBody>
            <DescriptionList
              className="sm:grid-cols-1"
              items={[
                { label: "Order", value: <Link className="text-accent-ink hover:underline" href={`/commerce/customer-orders/${so.id}`}>{so.number}</Link> },
                { label: "Sent", value: `${formatDateTime(d.dispatched_at, df, tz)} by ${(d.sender as unknown as { full_name: string } | null)?.full_name ?? "—"}` },
                { label: "From", value: (d.warehouses as unknown as { name: string }).name },
                { label: "Deliver to", value: so.shipping_address },
                { label: "Carrier", value: d.carrier },
                { label: "Waybill / tracking", value: d.tracking_reference },
                { label: "Driver · vehicle", value: [d.driver_name, d.vehicle].filter(Boolean).join(" · ") || "—" },
                { label: "Notes", value: d.notes },
                ...(d.status === "delivered"
                  ? [
                      { label: "Received by", value: d.received_by },
                      { label: "Delivered", value: `${formatDateTime(d.delivered_at, df, tz)} · confirmed by ${(d.confirmer as unknown as { full_name: string } | null)?.full_name ?? "—"}` },
                      { label: "Delivery notes", value: d.delivery_notes },
                    ]
                  : []),
              ]}
            />
          </CardBody>
        </Card>
      </div>
    </>
  );
}
