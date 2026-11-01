import { Plus } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge, PaymentBadge, SalesStatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, DescriptionList } from "@/components/ui/card";
import { EmptyState, PageHeader, Stat } from "@/components/ui/misc";
import { TBody, TD, TH, THead, TR, Table } from "@/components/ui/table";
import { getSession, requirePermission } from "@/lib/auth";
import { formatDate, formatMoney } from "@/lib/format";
import { CustomerDialog } from "../dialog";
import { ArchiveCustomer } from "./actions";

export default async function CustomerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requirePermission("customers.read", "sales_orders.read");
  const { supabase } = await getSession();
  const { data: c } = await supabase.from("customers").select("*").eq("id", id).eq("organization_id", ctx.org.id).maybeSingle();
  if (!c) notFound();
  const canOrders = ctx.can("sales_orders.read");
  const [{ data: orders }, { data: bal }] = canOrders
    ? await Promise.all([
        supabase.from("sales_orders").select("id, number, status, order_date, requested_date, total, amount_paid, currency").eq("customer_id", id).order("order_date", { ascending: false }).limit(50),
        supabase.from("customer_balances").select("*").eq("customer_id", id).maybeSingle(),
      ])
    : [{ data: [] }, { data: null }];
  const cur = ctx.settings.currency;
  const df = ctx.settings.date_format;
  const manage = ctx.can("customers.manage");
  const overLimit = c.credit_limit != null && bal && Number(bal.balance_due) > Number(c.credit_limit);
  return (
    <>
      <PageHeader
        title={c.name}
        meta={!c.is_active && <Badge>Archived</Badge>}
        breadcrumb={[{ label: "Customers", href: "/commerce/customers" }, { label: c.name }]}
        description={`${c.code} · ${c.customer_type}`}
        actions={
          <>
            {manage && <CustomerDialog customer={c} />}
            {manage && <ArchiveCustomer id={c.id} active={c.is_active} />}
            {ctx.can("sales_orders.create") && c.is_active && (
              <Button asChild variant="primary">
                <Link href={`/commerce/customer-orders/new?customer=${c.id}`}>
                  <Plus /> New order
                </Link>
              </Button>
            )}
          </>
        }
      />
      {canOrders && (
        <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label="Orders" value={String(bal?.orders ?? 0)} />
          <Stat label="Open orders" value={String(bal?.open_orders ?? 0)} />
          <Stat label="Ordered value" value={formatMoney(bal?.ordered_value ?? 0, cur)} />
          <Stat label="Balance due" value={formatMoney(bal?.balance_due ?? 0, cur)} tone={overLimit ? "danger" : undefined} hint={c.credit_limit != null ? `Credit limit ${formatMoney(c.credit_limit, cur)}${overLimit ? " · over limit" : ""}` : undefined} />
        </div>
      )}
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
        <Card>
          <CardHeader title="Orders" />
          {!canOrders || (orders ?? []).length === 0 ? (
            <EmptyState title="No orders yet" />
          ) : (
            <Table>
              <THead>
                <tr>
                  <TH>Order</TH>
                  <TH>Date</TH>
                  <TH>Wanted by</TH>
                  <TH align="right">Total</TH>
                  <TH>Payment</TH>
                  <TH>Status</TH>
                </tr>
              </THead>
              <TBody>
                {(orders ?? []).map((o) => (
                  <TR key={o.id}>
                    <TD>
                      <Link className="font-medium hover:text-accent-ink" href={`/commerce/customer-orders/${o.id}`}>
                        {o.number}
                      </Link>
                    </TD>
                    <TD className="text-muted">{formatDate(o.order_date, df)}</TD>
                    <TD className="text-muted">{formatDate(o.requested_date, df)}</TD>
                    <TD align="right">{formatMoney(o.total, o.currency)}</TD>
                    <TD>
                      <PaymentBadge total={Number(o.total)} paid={Number(o.amount_paid)} status={o.status} />
                    </TD>
                    <TD>
                      <SalesStatusBadge status={o.status} />
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </Card>
        <Card>
          <CardHeader title="Details" />
          <CardBody>
            <DescriptionList
              className="sm:grid-cols-1"
              items={[
                { label: "Contact", value: [c.contact_name, c.phone, c.email].filter(Boolean).join(" · ") || "—" },
                { label: "Billing address", value: c.billing_address },
                { label: "Delivery address", value: c.shipping_address ?? (c.billing_address ? "Same as billing" : null) },
                { label: "Payment terms", value: c.payment_terms },
                { label: "Credit limit", value: c.credit_limit != null ? formatMoney(c.credit_limit, cur) : "—" },
                { label: "Tax ID", value: c.tax_id },
                { label: "Notes", value: c.notes },
              ]}
            />
          </CardBody>
        </Card>
      </div>
    </>
  );
}
