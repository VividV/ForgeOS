import { PackageOpen, Pencil, Printer } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge, ProcurementStatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, DescriptionList } from "@/components/ui/card";
import { EmptyState, PageHeader, Progress } from "@/components/ui/misc";
import { TBody, TD, TH, THead, TR, Table } from "@/components/ui/table";
import { getSession, requirePermission } from "@/lib/auth";
import { formatDate, formatDateTime, formatMoney, formatQty, todayIn } from "@/lib/format";
import { PoActions } from "./actions";

export default async function PurchaseOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requirePermission("procurement.read");
  const { supabase } = await getSession();
  const { data: po } = await supabase
    .from("purchase_orders")
    .select("*, suppliers(id, name, contact_name, phone, email, address, lead_time_days), warehouses(name), purchase_requisitions(id, number), creator:profiles!purchase_orders_created_by_fkey(full_name), approver:profiles!purchase_orders_approved_by_fkey(full_name)")
    .eq("id", id)
    .eq("organization_id", ctx.org.id)
    .maybeSingle();
  if (!po) notFound();
  const [{ data: lines }, { data: grns }] = await Promise.all([
    supabase.from("purchase_order_items").select("*, stock_item_details(name, code, uom_code, material_id)").eq("purchase_order_id", id).order("line_no"),
    supabase.from("goods_receipt_summary").select("id, number, received_at, delivery_note, total_accepted, total_rejected, discrepancy").eq("purchase_order_id", id).order("received_at"),
  ]);
  const cur = po.currency;
  const df = ctx.settings.date_format;
  const tz = ctx.settings.timezone;
  const s = po.suppliers as unknown as { id: string; name: string; contact_name: string | null; phone: string | null; email: string | null; address: string | null; lead_time_days: number | null };
  const ordered = (lines ?? []).reduce((a, l) => a + Number(l.quantity), 0);
  const accepted = (lines ?? []).reduce((a, l) => a + Number(l.quantity_received) - Number(l.quantity_rejected), 0);
  const late = po.expected_date && po.expected_date < todayIn(tz) && ["approved", "sent", "partially_received"].includes(po.status);
  const canReceive = ["approved", "sent", "partially_received"].includes(po.status) && ctx.can("procurement.create") && ctx.can("inventory.create");

  return (
    <>
      <PageHeader
        title={po.number}
        meta={
          <>
            <ProcurementStatusBadge status={po.status} />
            {late && <Badge tone="danger">Delivery overdue</Badge>}
          </>
        }
        breadcrumb={[{ label: "Purchase orders", href: "/commerce/purchase-orders" }, { label: po.number }]}
        description={`${s.name} · ${formatMoney(po.total, cur)}`}
        actions={
          <>
            {["draft", "pending_approval"].includes(po.status) && ctx.can("procurement.create") && (
              <Button asChild>
                <Link href={`/commerce/purchase-orders/${po.id}/edit`}>
                  <Pencil /> Edit
                </Link>
              </Button>
            )}
            <Button asChild variant="ghost">
              <Link href={`/commerce/purchase-orders/${po.id}/print`}>
                <Printer /> Print
              </Link>
            </Button>
            <PoActions id={po.id} status={po.status} can={{ create: ctx.can("procurement.create"), approve: ctx.can("procurement.approve"), manage: ctx.can("procurement.manage") }} />
            {canReceive && (
              <Button asChild variant="primary">
                <Link href={`/commerce/purchase-orders/${po.id}/receive`}>
                  <PackageOpen /> Receive goods
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
              title="Lines"
              action={
                <div className="flex w-48 items-center gap-2 text-xs text-muted">
                  <Progress value={ordered ? (accepted / ordered) * 100 : 0} tone={po.status === "received" ? "success" : "accent"} />
                  {Math.round(ordered ? (accepted / ordered) * 100 : 0)}% received
                </div>
              }
            />
            <Table>
              <THead>
                <tr>
                  <TH>Material</TH>
                  <TH align="right">Ordered</TH>
                  <TH align="right">Received</TH>
                  <TH align="right">Rejected</TH>
                  <TH align="right">Outstanding</TH>
                  <TH align="right">Unit price</TH>
                  <TH align="right">Disc / tax</TH>
                  <TH align="right">Line total</TH>
                </tr>
              </THead>
              <TBody>
                {(lines ?? []).map((l) => {
                  const d = l.stock_item_details as unknown as { name: string; code: string; uom_code: string; material_id: string };
                  const out = Math.max(Number(l.quantity) - (Number(l.quantity_received) - Number(l.quantity_rejected)), 0);
                  return (
                    <TR key={l.id}>
                      <TD>
                        <Link href={`/inventory/materials/${d.material_id}`} className="hover:text-accent-ink">
                          {d.name}
                        </Link>{" "}
                        <span className="font-mono text-xs text-muted">{d.code}</span>
                      </TD>
                      <TD align="right">
                        {formatQty(l.quantity)} {d.uom_code}
                      </TD>
                      <TD align="right">{formatQty(l.quantity_received)}</TD>
                      <TD align="right" className={Number(l.quantity_rejected) > 0 ? "text-danger-ink" : ""}>
                        {formatQty(l.quantity_rejected)}
                      </TD>
                      <TD align="right" className={out > 0 ? "font-medium" : "text-muted"}>
                        {formatQty(out)}
                      </TD>
                      <TD align="right">{formatMoney(l.unit_price, cur)}</TD>
                      <TD align="right" className="text-muted">
                        {formatQty(l.discount_pct)}% / {formatQty(l.tax_pct)}%
                      </TD>
                      <TD align="right">{formatMoney(l.line_total, cur)}</TD>
                    </TR>
                  );
                })}
              </TBody>
              <tfoot className="text-[13px]">
                {[
                  ["Subtotal", po.subtotal],
                  ["Discounts", -po.discount_total],
                  ["Tax", po.tax_total],
                  ["Shipping", po.shipping_cost],
                ].map(([k, v]) => (
                  <tr key={String(k)}>
                    <td colSpan={7} className="px-3 py-1 text-right text-muted">
                      {k}
                    </td>
                    <td className="tabular px-3 py-1 text-right">{formatMoney(v as number, cur)}</td>
                  </tr>
                ))}
                <tr className="border-t border-line-strong font-semibold">
                  <td colSpan={7} className="px-3 py-2 text-right">
                    Total
                  </td>
                  <td className="tabular px-3 py-2 text-right">{formatMoney(po.total, cur)}</td>
                </tr>
              </tfoot>
            </Table>
          </Card>
          <Card>
            <CardHeader title="Goods received" description="Only accepted quantities were added to stock." />
            {(grns ?? []).length === 0 ? (
              <EmptyState title="Nothing received yet" />
            ) : (
              <Table>
                <TBody>
                  {(grns ?? []).map((g) => (
                    <TR key={g.id}>
                      <TD>
                        <Link href={`/commerce/goods-received/${g.id}`} className="font-medium text-accent-ink hover:underline">
                          {g.number}
                        </Link>
                      </TD>
                      <TD className="text-muted">{formatDateTime(g.received_at, df, tz)}</TD>
                      <TD className="text-muted">{g.delivery_note ?? "—"}</TD>
                      <TD align="right">{formatQty(g.total_accepted)} accepted</TD>
                      <TD align="right" className={Number(g.total_rejected) > 0 ? "text-danger-ink" : "text-muted"}>
                        {formatQty(g.total_rejected)} rejected
                      </TD>
                      <TD>{g.discrepancy && <Badge tone="warning">Discrepancy</Badge>}</TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            )}
          </Card>
        </div>
        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader title="Supplier" />
            <CardBody>
              <DescriptionList
                className="sm:grid-cols-1"
                items={[
                  { label: "Name", value: s.name },
                  { label: "Contact", value: [s.contact_name, s.phone, s.email].filter(Boolean).join(" · ") || "—" },
                  { label: "Lead time", value: s.lead_time_days != null ? `${s.lead_time_days} days` : "—" },
                ]}
              />
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Details" />
            <CardBody>
              <DescriptionList
                className="sm:grid-cols-1"
                items={[
                  { label: "Order date", value: formatDate(po.order_date, df) },
                  { label: "Expected delivery", value: formatDate(po.expected_date, df) },
                  { label: "Deliver to", value: (po.warehouses as unknown as { name: string }).name },
                  { label: "Payment terms", value: po.payment_terms },
                  { label: "From requisition", value: (po.purchase_requisitions as unknown as { id: string; number: string } | null) ? <Link className="text-accent-ink hover:underline" href={`/commerce/requisitions/${(po.purchase_requisitions as unknown as { id: string }).id}`}>{(po.purchase_requisitions as unknown as { number: string }).number}</Link> : "—" },
                  { label: "Created by", value: (po.creator as unknown as { full_name: string } | null)?.full_name },
                  { label: "Approved", value: po.approved_at ? `${(po.approver as unknown as { full_name: string } | null)?.full_name ?? ""} · ${formatDateTime(po.approved_at, df, tz)}` : "—" },
                  ...(po.cancel_reason ? [{ label: "Cancel reason", value: po.cancel_reason }] : []),
                  { label: "Notes", value: po.notes },
                ]}
              />
            </CardBody>
          </Card>
        </div>
      </div>
    </>
  );
}
