import { Plus, ShoppingCart } from "lucide-react";
import Link from "next/link";
import { ListToolbar } from "@/components/data/toolbar";
import { Pagination, parseList, range, type SearchParams } from "@/components/data/list";
import { Badge, ProcurementStatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { TBody, TD, TH, THead, TR, Table } from "@/components/ui/table";
import { getSession, requirePermission } from "@/lib/auth";
import { formatDate, formatMoney, todayIn } from "@/lib/format";
import { lookups } from "@/lib/services/lookups";

export const metadata = { title: "Purchase orders" };

export default async function PurchaseOrdersPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const ctx = await requirePermission("procurement.read");
  const sp = await searchParams;
  const params = parseList(sp, { sortable: ["created_at", "expected_date", "total"], defaultSort: "created_at", defaultDir: "desc", filters: ["status", "supplier"] });
  const { supabase } = await getSession();
  let q = supabase.from("purchase_orders").select("id, number, status, order_date, expected_date, total, currency, suppliers(name)", { count: "exact" }).eq("organization_id", ctx.org.id);
  if (params.filters.status) q = q.eq("status", params.filters.status);
  if (params.filters.supplier) q = q.eq("supplier_id", params.filters.supplier);
  if (params.q) q = q.ilike("number", `%${params.q.replace(/[%_]/g, "")}%`);
  const [{ data, count }, { suppliers }] = await Promise.all([q.order(params.sort, { ascending: params.dir === "asc", nullsFirst: false }).range(...range(params)), lookups(ctx.org.id, ["suppliers"])]);
  const today = todayIn(ctx.settings.timezone);
  return (
    <>
      <PageHeader
        title="Purchase orders"
        description="Orders to suppliers. Stock only increases when goods are received and accepted."
        actions={
          ctx.can("procurement.create") && (
            <Button asChild variant="primary">
              <Link href="/commerce/purchase-orders/new">
                <Plus /> New purchase order
              </Link>
            </Button>
          )
        }
      />
      <Card>
        <ListToolbar
          placeholder="Search PO number"
          filters={[
            { name: "status", label: "Status", options: ["draft", "pending_approval", "approved", "sent", "partially_received", "received", "closed", "cancelled"].map((v) => ({ value: v, label: v.replace(/_/g, " ") })) },
            { name: "supplier", label: "Supplier", options: suppliers },
          ]}
        />
        {(data ?? []).length === 0 ? (
          <EmptyState icon={<ShoppingCart />} title="No purchase orders yet" description="Create one directly or from an approved requisition." />
        ) : (
          <Table>
            <THead>
              <tr>
                <TH>Number</TH>
                <TH>Supplier</TH>
                <TH>Ordered</TH>
                <TH>Expected</TH>
                <TH align="right">Total</TH>
                <TH>Status</TH>
              </tr>
            </THead>
            <TBody>
              {(data ?? []).map((p) => {
                const late = p.expected_date && p.expected_date < today && ["approved", "sent", "partially_received"].includes(p.status);
                return (
                  <TR key={p.id}>
                    <TD>
                      <Link href={`/commerce/purchase-orders/${p.id}`} className="font-medium hover:text-accent-ink">
                        {p.number}
                      </Link>
                    </TD>
                    <TD>{(p.suppliers as unknown as { name: string }).name}</TD>
                    <TD className="text-muted">{formatDate(p.order_date, ctx.settings.date_format)}</TD>
                    <TD className={late ? "font-medium text-danger-ink" : "text-muted"}>
                      {formatDate(p.expected_date, ctx.settings.date_format)} {late && <Badge tone="danger">Overdue</Badge>}
                    </TD>
                    <TD align="right">{formatMoney(p.total, p.currency)}</TD>
                    <TD>
                      <ProcurementStatusBadge status={p.status} />
                    </TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        )}
        <Pagination params={params} total={count ?? 0} base="/commerce/purchase-orders" sp={sp} />
      </Card>
    </>
  );
}
