import { ShoppingCart } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ProcurementStatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, DescriptionList } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/misc";
import { TBody, TD, TH, THead, TR, Table } from "@/components/ui/table";
import { getSession, requirePermission } from "@/lib/auth";
import { formatDate, formatDateTime, formatQty, sentenceCase } from "@/lib/format";
import { RequisitionActions } from "./actions";

export default async function RequisitionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requirePermission("procurement.read", "requisitions.create");
  const { supabase } = await getSession();
  const { data: r } = await supabase
    .from("purchase_requisitions")
    .select("*, requester:profiles!purchase_requisitions_requested_by_fkey(full_name), decider:profiles!purchase_requisitions_decided_by_fkey(full_name), production_orders(id, number), warehouses(name)")
    .eq("id", id)
    .eq("organization_id", ctx.org.id)
    .maybeSingle();
  if (!r) notFound();
  const [{ data: items }, { data: pos }] = await Promise.all([
    supabase.from("purchase_requisition_items").select("id, quantity, notes, purchase_order_item_id, stock_item_details(name, code, uom_code)").eq("requisition_id", id),
    ctx.can("procurement.read") ? supabase.from("purchase_orders").select("id, number, status").eq("requisition_id", id) : Promise.resolve({ data: [] }),
  ]);
  const df = ctx.settings.date_format;
  const tz = ctx.settings.timezone;
  return (
    <>
      <PageHeader
        title={r.number}
        meta={<ProcurementStatusBadge status={r.status} />}
        breadcrumb={[{ label: "Purchase requisitions", href: "/commerce/requisitions" }, { label: r.number }]}
        actions={
          <>
            <RequisitionActions id={r.id} status={r.status} canApprove={ctx.can("procurement.approve")} isRequester={r.requested_by === ctx.user.id} />
            {r.status === "approved" && ctx.can("procurement.create") && (
              <Button asChild variant="primary">
                <Link href={`/commerce/purchase-orders/new?requisition=${r.id}`}>
                  <ShoppingCart /> Create purchase order
                </Link>
              </Button>
            )}
          </>
        }
      />
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
        <Card>
          <CardHeader title="Materials requested" />
          <Table>
            <THead>
              <tr>
                <TH>Material</TH>
                <TH align="right">Quantity</TH>
                <TH>Note</TH>
                <TH>Ordered</TH>
              </tr>
            </THead>
            <TBody>
              {(items ?? []).map((i) => {
                const d = i.stock_item_details as unknown as { name: string; code: string; uom_code: string };
                return (
                  <TR key={i.id}>
                    <TD>
                      {d.name} <span className="font-mono text-xs text-muted">{d.code}</span>
                    </TD>
                    <TD align="right">
                      {formatQty(i.quantity)} {d.uom_code}
                    </TD>
                    <TD className="text-muted">{i.notes ?? "—"}</TD>
                    <TD>{i.purchase_order_item_id ? "Yes" : "—"}</TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        </Card>
        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader title="Details" />
            <CardBody>
              <DescriptionList
                className="sm:grid-cols-1"
                items={[
                  { label: "Requested by", value: `${(r.requester as unknown as { full_name: string } | null)?.full_name ?? "—"} · ${formatDateTime(r.created_at, df, tz)}` },
                  { label: "Source", value: sentenceCase(r.source) },
                  { label: "For production order", value: (r.production_orders as unknown as { id: string; number: string } | null) ? <Link className="text-accent-ink hover:underline" href={`/operations/production-orders/${(r.production_orders as unknown as { id: string }).id}`}>{(r.production_orders as unknown as { number: string }).number}</Link> : "—" },
                  { label: "Deliver to", value: (r.warehouses as unknown as { name: string } | null)?.name },
                  { label: "Needed by", value: formatDate(r.needed_by, df) },
                  { label: "Decision", value: r.decided_at ? `${(r.decider as unknown as { full_name: string } | null)?.full_name ?? ""} · ${formatDateTime(r.decided_at, df, tz)}` : "—" },
                  ...(r.decision_note ? [{ label: "Decision note", value: r.decision_note }] : []),
                  { label: "Notes", value: r.notes },
                ]}
              />
            </CardBody>
          </Card>
          {(pos ?? []).length > 0 && (
            <Card>
              <CardHeader title="Purchase orders" />
              <ul className="divide-y divide-line">
                {(pos ?? []).map((p) => (
                  <li key={p.id} className="flex items-center justify-between px-4 py-2 text-[13px]">
                    <Link href={`/commerce/purchase-orders/${p.id}`} className="font-medium text-accent-ink hover:underline">
                      {p.number}
                    </Link>
                    <ProcurementStatusBadge status={p.status} />
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
