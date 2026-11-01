import { Plus, Receipt } from "lucide-react";
import Link from "next/link";
import { ListToolbar } from "@/components/data/toolbar";
import { Pagination, parseList, range, type SearchParams } from "@/components/data/list";
import { Badge, PaymentBadge, SalesStatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState, PageHeader, Stat } from "@/components/ui/misc";
import { TBody, TD, TH, THead, TR, Table } from "@/components/ui/table";
import { getSession, requirePermission } from "@/lib/auth";
import { formatDate, formatMoney, todayIn } from "@/lib/format";
import { lookups } from "@/lib/services/lookups";

export const metadata = { title: "Customer orders" };
const OPEN = ["confirmed", "partially_dispatched"];

export default async function CustomerOrdersPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const ctx = await requirePermission("sales_orders.read");
  const sp = await searchParams;
  const params = parseList(sp, { sortable: ["order_date", "requested_date", "total"], defaultSort: "order_date", defaultDir: "desc", filters: ["status", "customer", "payment"] });
  const { supabase } = await getSession();
  let q = supabase.from("sales_orders").select("id, number, status, order_date, requested_date, total, amount_paid, currency, customer_reference, customers(name)", { count: "exact" }).eq("organization_id", ctx.org.id);
  if (params.filters.status === "open") q = q.in("status", OPEN);
  else if (params.filters.status) q = q.eq("status", params.filters.status);
  if (params.filters.customer) q = q.eq("customer_id", params.filters.customer);
  if (params.q) q = q.or(`number.ilike.%${params.q.replace(/[%_,()]/g, "")}%,customer_reference.ilike.%${params.q.replace(/[%_,()]/g, "")}%`);
  const today = todayIn(ctx.settings.timezone);
  const [{ data, count }, { customers }, { data: open }] = await Promise.all([
    q.order(params.sort, { ascending: params.dir === "asc", nullsFirst: false }).range(...range(params)),
    lookups(ctx.org.id, ["customers"]),
    supabase.from("sales_orders").select("total, amount_paid, requested_date, status").eq("organization_id", ctx.org.id).in("status", [...OPEN, "dispatched", "delivered"]),
  ]);
  const openRows = (open ?? []).filter((o) => OPEN.includes(o.status));
  const cur = ctx.settings.currency;
  return (
    <>
      <PageHeader
        title="Customer orders"
        description="Orders from customers. Confirming an order holds finished goods in stock for it; plan production for anything short."
        actions={
          ctx.can("sales_orders.create") && (
            <Button asChild variant="primary">
              <Link href="/commerce/customer-orders/new">
                <Plus /> New order
              </Link>
            </Button>
          )
        }
      />
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Open orders" value={String(openRows.length)} href="/commerce/customer-orders?status=open" />
        <Stat label="Open order value" value={formatMoney(openRows.reduce((s, o) => s + Number(o.total), 0), cur, { compact: true })} />
        <Stat label="Late" value={String(openRows.filter((o) => o.requested_date && o.requested_date < today).length)} tone={openRows.some((o) => o.requested_date && o.requested_date < today) ? "danger" : undefined} />
        <Stat label="Unpaid balance" value={formatMoney((open ?? []).reduce((s, o) => s + Number(o.total) - Number(o.amount_paid), 0), cur, { compact: true })} hint="Confirmed, dispatched and delivered orders" />
      </div>
      <Card>
        <ListToolbar
          placeholder="Search order no. or customer reference"
          filters={[
            { name: "status", label: "Status", options: [{ value: "open", label: "Open (to dispatch)" }, ...["draft", "confirmed", "partially_dispatched", "dispatched", "delivered", "closed", "cancelled"].map((v) => ({ value: v, label: v.replace(/_/g, " ") }))] },
            { name: "customer", label: "Customer", options: customers },
          ]}
        />
        {(data ?? []).length === 0 ? (
          <EmptyState icon={<Receipt />} title="No customer orders yet" description="Record an order from a customer to hold stock, plan production and dispatch." />
        ) : (
          <Table>
            <THead>
              <tr>
                <TH>Order</TH>
                <TH>Customer</TH>
                <TH>Ordered</TH>
                <TH>Wanted by</TH>
                <TH align="right">Total</TH>
                <TH>Payment</TH>
                <TH>Status</TH>
              </tr>
            </THead>
            <TBody>
              {(data ?? []).map((o) => {
                const late = o.requested_date && o.requested_date < today && OPEN.includes(o.status);
                return (
                  <TR key={o.id}>
                    <TD>
                      <Link href={`/commerce/customer-orders/${o.id}`} className="font-medium hover:text-accent-ink">
                        {o.number}
                      </Link>
                      {o.customer_reference && <div className="text-xs text-muted">Ref {o.customer_reference}</div>}
                    </TD>
                    <TD>{(o.customers as unknown as { name: string }).name}</TD>
                    <TD className="text-muted">{formatDate(o.order_date, ctx.settings.date_format)}</TD>
                    <TD className={late ? "font-medium text-danger-ink" : "text-muted"}>
                      {formatDate(o.requested_date, ctx.settings.date_format)} {late && <Badge tone="danger">Late</Badge>}
                    </TD>
                    <TD align="right">{formatMoney(o.total, o.currency)}</TD>
                    <TD>
                      <PaymentBadge total={Number(o.total)} paid={Number(o.amount_paid)} status={o.status} />
                    </TD>
                    <TD>
                      <SalesStatusBadge status={o.status} />
                    </TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        )}
        <Pagination params={params} total={count ?? 0} base="/commerce/customer-orders" sp={sp} />
      </Card>
    </>
  );
}
