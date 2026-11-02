import { Pencil, Printer, Send, Undo2 } from "lucide-react";
import Link from "next/link";
import { Attachments } from "@/components/files/attachments";
import { notFound } from "next/navigation";
import { Badge, PaymentBadge, ProductionStatusBadge, SalesStatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, DescriptionList } from "@/components/ui/card";
import { EmptyState, PageHeader, Progress } from "@/components/ui/misc";
import { TBody, TD, TH, THead, TR, Table } from "@/components/ui/table";
import { getSession, requirePermission } from "@/lib/auth";
import { formatDate, formatDateTime, formatMoney, formatQty, todayIn } from "@/lib/format";
import { lookups } from "@/lib/services/lookups";
import { CreditNoteButton, InvoiceButton, OrderActions, PlanProduction, RecordPayment, VoidCreditNote, VoidPayment } from "./client";

type Line = {
  id: string;
  line_no: number;
  stock_item_id: string;
  product_id: string;
  name: string;
  code: string;
  uom_code: string;
  quantity: number;
  unit_price: number;
  discount_pct: number;
  tax_pct: number;
  line_total: number;
  allocated: number;
  dispatched: number;
  in_production: number;
  available: number;
  shortfall: number;
  production_orders: {
    id: string;
    number: string;
    status: string;
    quantity: number;
    completed: number;
    due_date: string | null;
  }[];
  returned: number;
  invoiced: number;
};
const METHOD: Record<string, string> = {
  bank_transfer: "Bank transfer",
  cash: "Cash",
  pos: "POS",
  card: "Card",
  mobile_money: "Mobile money",
  cheque: "Cheque",
  other: "Other",
};

export default async function CustomerOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requirePermission("sales_orders.read");
  const { supabase } = await getSession();
  const { data: so } = await supabase
    .from("sales_orders")
    .select(
      "*, customers(id, name, code, contact_name, phone, email), warehouses(name), creator:profiles!sales_orders_created_by_fkey(full_name), confirmer:profiles!sales_orders_confirmed_by_fkey(full_name)",
    )
    .eq("id", id)
    .eq("organization_id", ctx.org.id)
    .maybeSingle();
  if (!so) notFound();
  const [{ data: lineData }, { data: dispatches }, { data: payments }, opts] = await Promise.all([
    supabase.rpc("sales_order_lines", { p_so: id }),
    supabase
      .from("dispatches")
      .select("id, number, dispatched_at, status, carrier, received_by, delivered_at, dispatch_items(quantity)")
      .eq("sales_order_id", id)
      .order("dispatched_at"),
    supabase.from("customer_payments").select("*, recorder:profiles!customer_payments_recorded_by_fkey(full_name)").eq("sales_order_id", id).order("paid_on"),
    lookups(ctx.org.id, ["factories"]),
  ]);
  const [{ data: invoices }, { data: credits }, { data: returns }] = await Promise.all([
    supabase.from("invoices").select("id, number, issue_date, total, status").eq("sales_order_id", id).order("created_at"),
    supabase.from("credit_notes").select("id, number, amount, reason, status, issued_at").eq("sales_order_id", id).order("issued_at"),
    supabase.from("sales_returns").select("id, number, received_at, reason, sales_return_items(quantity, condition)").eq("sales_order_id", id).order("received_at"),
  ]);
  const lines = (lineData ?? []) as Line[];
  const cur = so.currency;
  const df = ctx.settings.date_format;
  const tz = ctx.settings.timezone;
  const c = so.customers as unknown as {
    id: string;
    name: string;
    code: string;
    contact_name: string | null;
    phone: string | null;
    email: string | null;
  };
  const open = ["confirmed", "partially_dispatched"].includes(so.status);
  const late = open && so.requested_date && so.requested_date < todayIn(tz);
  const ordered = lines.reduce((s, l) => s + Number(l.quantity), 0);
  const shipped = lines.reduce((s, l) => s + Number(l.dispatched), 0);
  const ready = lines.reduce((s, l) => s + Number(l.allocated), 0);
  const balance = Number(so.total) - Number(so.amount_paid) - Number(so.amount_credited);
  const canMake = ctx.can("production_orders.create");
  const canReturn = ["partially_dispatched", "dispatched", "delivered", "closed"].includes(so.status) && ctx.can("sales_orders.dispatch") && lines.some((l) => Number(l.dispatched) > Number(l.returned));
  const canDispatch =
    open && ctx.can("sales_orders.dispatch") && lines.some((l) => Number(l.quantity) > Number(l.dispatched) && Number(l.allocated) + Math.max(Number(l.available), 0) > 0);

  return (
    <>
      <PageHeader
        title={so.number}
        meta={
          <>
            <SalesStatusBadge status={so.status} />
            <PaymentBadge total={Number(so.total) - Number(so.amount_credited)} paid={Number(so.amount_paid)} status={so.status} />
            {late && <Badge tone="danger">Late</Badge>}
          </>
        }
        breadcrumb={[{ label: "Customer orders", href: "/commerce/customer-orders" }, { label: so.number }]}
        description={`${c.name} · ${formatMoney(so.total, cur)}${so.customer_reference ? ` · their ref ${so.customer_reference}` : ""}`}
        actions={
          <>
            {so.status === "draft" && ctx.can("sales_orders.create") && (
              <Button asChild>
                <Link href={`/commerce/customer-orders/${so.id}/edit`}>
                  <Pencil /> Edit
                </Link>
              </Button>
            )}
            <Button asChild variant="ghost">
              <Link href={`/commerce/customer-orders/${so.id}/print`}>
                <Printer /> Pro-forma
              </Link>
            </Button>
            <OrderActions
              id={so.id}
              status={so.status}
              can={{
                create: ctx.can("sales_orders.create"),
                manage: ctx.can("sales_orders.manage"),
                allocate: ctx.canAny("sales_orders.create", "sales_orders.manage", "sales_orders.dispatch"),
              }}
            />
            {canDispatch && (
              <Button asChild variant="primary">
                <Link href={`/commerce/customer-orders/${so.id}/dispatch`}>
                  <Send /> Dispatch goods
                </Link>
              </Button>
            )}
          </>
        }
      />
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader
              title="Products"
              description={open ? "Ready = finished goods held for this order. Making = in production for it. Short = still needed with nothing planned." : undefined}
              action={
                ordered > 0 && (
                  <div className="flex w-56 items-center gap-2 text-xs text-muted">
                    <Progress value={(shipped / ordered) * 100} tone={shipped >= ordered ? "success" : "accent"} />
                    {formatQty(shipped)} / {formatQty(ordered)} dispatched
                  </div>
                )
              }
            />
            <Table>
              <THead>
                <tr>
                  <TH>Product</TH>
                  <TH align="right">Ordered</TH>
                  <TH align="right">Ready</TH>
                  <TH align="right" title="In production">
                    Making
                  </TH>
                  <TH align="right">Sent</TH>
                  <TH align="right">Short</TH>
                  <TH align="right">Amount</TH>
                </tr>
              </THead>
              <TBody>
                {lines.map((l) => (
                  <TR key={l.id}>
                    <TD>
                      <Link href={`/commerce/products/${l.product_id}`} className="hover:text-accent-ink">
                        {l.name}
                      </Link>{" "}
                      <span className="font-mono text-xs text-muted">{l.code}</span>
                      {l.production_orders.length > 0 && (
                        <div className="mt-1 flex flex-wrap gap-1.5">
                          {l.production_orders.map((p) => (
                            <Link
                              key={p.id}
                              href={`/operations/production-orders/${p.id}`}
                              className="inline-flex items-center gap-1 whitespace-nowrap rounded border border-line px-1.5 py-0.5 text-xs hover:border-line-strong"
                            >
                              <span className="font-mono">{p.number}</span> {formatQty(p.quantity)} <ProductionStatusBadge status={p.status} />
                            </Link>
                          ))}
                        </div>
                      )}
                      {open && Number(l.shortfall) > 0 && canMake && (
                        <div className="mt-1.5">
                          <PlanProduction lineId={l.id} shortfall={Number(l.shortfall)} factories={opts.factories} dueDate={so.requested_date ?? ""} name={l.name} />
                        </div>
                      )}
                    </TD>
                    <TD align="right">
                      {formatQty(l.quantity)} {l.uom_code}
                    </TD>
                    <TD align="right" className={Number(l.allocated) > 0 ? "font-medium text-success" : "text-muted"}>
                      {formatQty(l.allocated)}
                    </TD>
                    <TD align="right" className="text-muted">
                      {formatQty(l.in_production)}
                    </TD>
                    <TD align="right">{formatQty(l.dispatched)}</TD>
                    <TD align="right" className={Number(l.shortfall) > 0 ? "font-medium text-warning-ink" : "text-muted"}>
                      {formatQty(l.shortfall)}
                    </TD>
                    <TD align="right">
                      {formatMoney(l.line_total, cur)}
                      <div className="whitespace-nowrap text-xs text-muted">
                        @ {formatMoney(l.unit_price, cur)}
                        {Number(l.discount_pct) > 0 ? ` −${formatQty(l.discount_pct)}%` : ""}
                        {Number(l.tax_pct) > 0 ? ` +${formatQty(l.tax_pct)}% tax` : ""}
                      </div>
                    </TD>
                  </TR>
                ))}
              </TBody>
              <tfoot className="text-[13px]">
                {(
                  [
                    ["Subtotal", so.subtotal],
                    ["Discounts", -so.discount_total],
                    ["Tax", so.tax_total],
                    ["Delivery", so.shipping_charge],
                  ] as const
                )
                  .filter(([k, v]) => k === "Subtotal" || Number(v) !== 0)
                  .map(([k, v]) => (
                    <tr key={k}>
                      <td colSpan={6} className="px-3 py-1 text-right text-muted">
                        {k}
                      </td>
                      <td className="tabular px-3 py-1 text-right">{formatMoney(v, cur)}</td>
                    </tr>
                  ))}
                <tr className="border-t border-line-strong font-semibold">
                  <td colSpan={6} className="px-3 py-2 text-right">
                    Total
                  </td>
                  <td className="tabular px-3 py-2 text-right">{formatMoney(so.total, cur)}</td>
                </tr>
              </tfoot>
            </Table>
            {open && ready > 0 && ready + shipped >= ordered && (
              <p className="border-t border-line px-4 py-2.5 text-[13px] text-success">Everything still to send is in stock and held for this order.</p>
            )}
          </Card>

          <Card>
            <CardHeader title="Dispatches" />
            {(dispatches ?? []).length === 0 ? (
              <EmptyState title="Nothing dispatched yet" />
            ) : (
              <Table>
                <TBody>
                  {(dispatches ?? []).map((d) => (
                    <TR key={d.id}>
                      <TD>
                        <Link href={`/commerce/dispatches/${d.id}`} className="font-medium text-accent-ink hover:underline">
                          {d.number}
                        </Link>
                      </TD>
                      <TD className="text-muted">{formatDateTime(d.dispatched_at, df, tz)}</TD>
                      <TD className="text-muted">{d.carrier ?? "—"}</TD>
                      <TD align="right">{formatQty(((d.dispatch_items as { quantity: number }[]) ?? []).reduce((s, x) => s + Number(x.quantity), 0))} units</TD>
                      <TD>{d.status === "delivered" ? <Badge tone="success">Delivered · {d.received_by}</Badge> : <Badge tone="info">In transit</Badge>}</TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            )}
          </Card>

          {(returns ?? []).length > 0 || canReturn ? (
            <Card>
              <CardHeader
                title="Returns"
                action={
                  canReturn && (
                    <Button asChild size="sm">
                      <Link href={`/commerce/customer-orders/${so.id}/return`}>
                        <Undo2 /> Record return
                      </Link>
                    </Button>
                  )
                }
              />
              {(returns ?? []).length === 0 ? (
                <EmptyState title="No returns" />
              ) : (
                <Table>
                  <TBody>
                    {(returns ?? []).map((r) => {
                      const items = (r.sales_return_items as { quantity: number; condition: string }[]) ?? [];
                      const restocked = items.filter((i) => i.condition === "restock").reduce((a, i) => a + Number(i.quantity), 0);
                      const damaged = items.filter((i) => i.condition === "damaged").reduce((a, i) => a + Number(i.quantity), 0);
                      return (
                        <TR key={r.id}>
                          <TD className="font-medium">{r.number}</TD>
                          <TD className="text-muted">{formatDate(r.received_at, df, tz)}</TD>
                          <TD>{r.reason}</TD>
                          <TD align="right">
                            {formatQty(restocked)} restocked{damaged > 0 ? ` · ${formatQty(damaged)} damaged` : ""}
                          </TD>
                        </TR>
                      );
                    })}
                  </TBody>
                </Table>
              )}
            </Card>
          ) : null}
        </div>

        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader
              title="Invoices & credits"
              action={
                so.status !== "draft" &&
                so.status !== "cancelled" && (
                  <div className="flex gap-1">
                    {ctx.can("sales_orders.create") && <InvoiceButton orderId={so.id} hasDispatched={shipped > 0} />}
                    {ctx.can("sales_orders.manage") && <CreditNoteButton orderId={so.id} max={Number(so.total) - Number(so.amount_credited)} />}
                  </div>
                )
              }
            />
            {(invoices ?? []).length === 0 && (credits ?? []).length === 0 ? (
              <EmptyState title="No invoices yet" description="Issue a tax invoice for what's been dispatched, or for the whole order in advance." />
            ) : (
              <ul className="divide-y divide-line">
                {(invoices ?? []).map((i) => (
                  <li key={i.id} className={`flex items-center gap-2 px-4 py-2.5 text-[13px] ${i.status === "void" ? "opacity-60" : ""}`}>
                    <Link href={`/commerce/invoices/${i.id}`} className="font-medium text-accent-ink hover:underline">
                      {i.number}
                    </Link>
                    <span className="text-xs text-muted">{formatDate(i.issue_date, df)}</span>
                    <span className={`tabular ml-auto ${i.status === "void" ? "line-through" : ""}`}>{formatMoney(i.total, cur)}</span>
                    {i.status === "void" && <Badge>Void</Badge>}
                  </li>
                ))}
                {(credits ?? []).map((cn) => (
                  <li key={cn.id} className={`flex items-center gap-2 px-4 py-2.5 text-[13px] ${cn.status === "void" ? "opacity-60" : ""}`}>
                    <div className="min-w-0 flex-1">
                      <p>
                        <span className="font-medium">{cn.number}</span> <span className="text-xs text-muted">credit note</span>
                      </p>
                      <p className="truncate text-xs text-muted">{cn.reason}</p>
                    </div>
                    <span className={`tabular ${cn.status === "void" ? "line-through" : ""}`}>−{formatMoney(cn.amount, cur)}</span>
                    {cn.status !== "void" && ctx.can("sales_orders.manage") && <VoidCreditNote id={cn.id} />}
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card>
            <CardHeader
              title="Payments"
              description={`${formatMoney(so.amount_paid, cur)} paid${Number(so.amount_credited) > 0 ? ` · ${formatMoney(so.amount_credited, cur)} credited` : ""} · ${formatMoney(balance, cur)} due`}
              action={ctx.can("sales_orders.create") && so.status !== "cancelled" && balance > 0.004 && <RecordPayment orderId={so.id} balance={balance} />}
            />
            {(payments ?? []).length === 0 ? (
              <EmptyState title="No payments recorded" />
            ) : (
              <ul className="divide-y divide-line">
                {(payments ?? []).map((p) => (
                  <li key={p.id} className={`flex items-center gap-2 px-4 py-2.5 text-[13px] ${p.voided_at ? "opacity-60" : ""}`}>
                    <div className="min-w-0 flex-1">
                      <p className={`tabular font-medium ${p.voided_at ? "line-through" : ""}`}>{formatMoney(p.amount, cur)}</p>
                      <p className="text-xs text-muted">
                        {formatDate(p.paid_on, df)} · {METHOD[p.method] ?? p.method}
                        {p.reference ? ` · ${p.reference}` : ""}
                        {p.voided_at ? ` · voided: ${p.void_reason}` : ""}
                      </p>
                    </div>
                    {!p.voided_at && ctx.can("sales_orders.manage") && <VoidPayment id={p.id} />}
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card>
            <CardHeader title="Details" />
            <CardBody>
              <DescriptionList
                className="sm:grid-cols-1"
                items={[
                  {
                    label: "Customer",
                    value: (
                      <Link className="text-accent-ink hover:underline" href={`/commerce/customers/${c.id}`}>
                        {c.name}
                      </Link>
                    ),
                  },
                  {
                    label: "Contact",
                    value: [c.contact_name, c.phone, c.email].filter(Boolean).join(" · ") || "—",
                  },
                  { label: "Ordered", value: formatDate(so.order_date, df) },
                  {
                    label: "Wanted by",
                    value: formatDate(so.requested_date, df),
                  },
                  {
                    label: "Ships from",
                    value: (so.warehouses as unknown as { name: string }).name,
                  },
                  { label: "Delivery address", value: so.shipping_address },
                  { label: "Payment terms", value: so.payment_terms },
                  {
                    label: "Created by",
                    value: (so.creator as unknown as { full_name: string } | null)?.full_name,
                  },
                  {
                    label: "Confirmed",
                    value: so.confirmed_at ? `${(so.confirmer as unknown as { full_name: string } | null)?.full_name ?? ""} · ${formatDateTime(so.confirmed_at, df, tz)}` : "—",
                  },
                  ...(so.cancel_reason
                    ? [
                        {
                          label: so.status === "cancelled" ? "Cancel reason" : "Closing note",
                          value: so.cancel_reason,
                        },
                      ]
                    : []),
                  { label: "Notes", value: so.notes },
                ]}
              />
            </CardBody>
          </Card>
        </div>
      </div>
      <div className="mt-4">
        <Attachments entityType="sales_order" entityId={so.id} canUpload={ctx.can("sales_orders.create")} userId={ctx.user.id} canManage={ctx.can("settings.manage")} />
      </div>
    </>
  );
}
