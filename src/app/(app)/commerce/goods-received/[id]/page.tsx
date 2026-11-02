import Link from "next/link";
import { Attachments } from "@/components/files/attachments";
import { notFound } from "next/navigation";
import { InspectionDialog } from "@/components/quality/inspection-dialog";
import { Badge, QcResultBadge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader, DescriptionList } from "@/components/ui/card";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { TBody, TD, TH, THead, TR, Table } from "@/components/ui/table";
import { getSession, requirePermission } from "@/lib/auth";
import { formatDateTime, formatMoney, formatQty } from "@/lib/format";
import { lookups } from "@/lib/services/lookups";
import { inspectionTemplates } from "@/lib/services/quality";

export default async function GoodsReceiptPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requirePermission("procurement.read");
  const { supabase } = await getSession();
  const { data: g } = await supabase.from("goods_receipts").select("*, warehouses(name), receiver:profiles!goods_receipts_received_by_fkey(full_name)").eq("id", id).eq("organization_id", ctx.org.id).maybeSingle();
  if (!g) notFound();
  const [{ data: po }, { data: lines }, { data: checks }] = await Promise.all([
    supabase.from("purchase_orders").select("id, number, currency, suppliers(name)").eq("id", g.purchase_order_id).single(),
    supabase.from("goods_receipt_items").select("*, stock_item_details(name, code, uom_code)").eq("goods_receipt_id", id),
    ctx.can("quality.read") ? supabase.from("quality_checks").select("id, number, result, quantity_inspected, quantity_rejected, inspected_at").eq("goods_receipt_id", id).order("inspected_at") : Promise.resolve({ data: [] as { id: string; number: string; result: string; quantity_inspected: number; quantity_rejected: number; inspected_at: string }[] }),
  ]);
  const canQc = ctx.can("quality.create");
  const [templates, { members }] = canQc ? await Promise.all([inspectionTemplates(ctx.org.id, "goods_receipt"), lookups(ctx.org.id, ["members"])]) : [[], { members: [] }];
  const accepted = (lines ?? []).reduce((a, l) => a + Number(l.quantity_accepted), 0);
  const df = ctx.settings.date_format;
  const tz = ctx.settings.timezone;
  const cur = po?.currency ?? ctx.settings.currency;
  return (
    <>
      <PageHeader
        title={g.number}
        breadcrumb={[{ label: "Goods received", href: "/commerce/goods-received" }, { label: g.number }]}
        description={`${(po?.suppliers as unknown as { name: string } | undefined)?.name ?? ""} · ${po?.number ?? ""}`}
        actions={canQc && accepted > 0 && <InspectionDialog checkType="goods_receipt" goodsReceiptId={g.id} maxQty={accepted} templates={templates} members={members} canApprove={ctx.can("quality.approve")} triggerVariant="primary" />}
      />
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader title="Lines" description="Accepted quantities were added to stock at the net purchase price." />
            <Table>
              <THead>
                <tr>
                  <TH>Material</TH>
                  <TH align="right">Received</TH>
                  <TH align="right">Accepted</TH>
                  <TH align="right">Rejected</TH>
                  <TH align="right">Unit cost</TH>
                  <TH>Notes</TH>
                </tr>
              </THead>
              <TBody>
                {(lines ?? []).map((l) => {
                  const d = l.stock_item_details as unknown as { name: string; code: string; uom_code: string };
                  return (
                    <TR key={l.id}>
                      <TD>
                        {d.name} <span className="font-mono text-xs text-muted">{d.code}</span>
                      </TD>
                      <TD align="right">
                        {formatQty(l.quantity_received)} {d.uom_code}
                      </TD>
                      <TD align="right" className="font-medium">
                        {formatQty(l.quantity_accepted)}
                      </TD>
                      <TD align="right" className={Number(l.quantity_rejected) > 0 ? "text-danger-ink" : "text-muted"}>
                        {formatQty(l.quantity_rejected)}
                      </TD>
                      <TD align="right">{formatMoney(l.unit_cost, cur)}</TD>
                      <TD className="text-xs text-muted">{[l.rejection_reason && `Rejected: ${l.rejection_reason}`, l.discrepancy_note].filter(Boolean).join(" · ") || "—"}</TD>
                    </TR>
                  );
                })}
              </TBody>
            </Table>
          </Card>
          {ctx.can("quality.read") && (
            <Card>
              <CardHeader title="Inspections" />
              {(checks ?? []).length === 0 ? (
                <EmptyState title="Not inspected" description={canQc ? "Record an inspection to log defects found on this delivery." : undefined} />
              ) : (
                <Table>
                  <TBody>
                    {(checks ?? []).map((c) => (
                      <TR key={c.id}>
                        <TD>
                          <Link className="font-medium text-accent-ink hover:underline" href={`/operations/quality/${c.id}`}>
                            {c.number}
                          </Link>
                        </TD>
                        <TD className="text-muted">{formatDateTime(c.inspected_at, df, tz)}</TD>
                        <TD align="right">
                          {formatQty(c.quantity_inspected)} inspected · {formatQty(c.quantity_rejected)} rejected
                        </TD>
                        <TD>
                          <QcResultBadge result={c.result} />
                        </TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
              )}
            </Card>
          )}
        </div>
        <Card>
          <CardHeader title="Details" />
          <CardBody>
            <DescriptionList
              className="sm:grid-cols-1"
              items={[
                { label: "Purchase order", value: po ? <Link className="text-accent-ink hover:underline" href={`/commerce/purchase-orders/${po.id}`}>{po.number}</Link> : "—" },
                { label: "Received", value: formatDateTime(g.received_at, df, tz) },
                { label: "Received by", value: (g.receiver as unknown as { full_name: string } | null)?.full_name },
                { label: "Into", value: (g.warehouses as unknown as { name: string }).name },
                { label: "Delivery note", value: g.delivery_note },
                { label: "Notes", value: g.notes },
                { label: "Status", value: (lines ?? []).some((l) => Number(l.quantity_rejected) > 0 || l.discrepancy_note) ? <Badge tone="warning">Discrepancy</Badge> : <Badge tone="success">Matched</Badge> },
              ]}
            />
          </CardBody>
        </Card>
      </div>
      <div className="mt-4">
        <Attachments entityType="goods_receipt" entityId={g.id} canUpload={ctx.can("procurement.create")} userId={ctx.user.id} canManage={ctx.can("settings.manage")} />
      </div>
    </>
  );
}
