import { PackageOpen } from "lucide-react";
import Link from "next/link";
import { ListToolbar } from "@/components/data/toolbar";
import { Pagination, parseList, range, type SearchParams } from "@/components/data/list";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { TBody, TD, TH, THead, TR, Table } from "@/components/ui/table";
import { getSession, requirePermission } from "@/lib/auth";
import { formatDateTime, formatQty } from "@/lib/format";

export const metadata = { title: "Goods received" };

export default async function GoodsReceivedPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const ctx = await requirePermission("procurement.read");
  const sp = await searchParams;
  const params = parseList(sp, { sortable: ["received_at"], defaultSort: "received_at", defaultDir: "desc", filters: ["discrepancy"] });
  const { supabase } = await getSession();
  let q = supabase.from("goods_receipt_summary").select("id, number, purchase_order_id, received_at, delivery_note, total_accepted, total_rejected, discrepancy, line_count", { count: "exact" }).eq("organization_id", ctx.org.id);
  if (params.filters.discrepancy === "yes") q = q.eq("discrepancy", true);
  if (params.q) q = q.ilike("number", `%${params.q.replace(/[%_]/g, "")}%`);
  const { data, count } = await q.order("received_at", { ascending: params.dir === "asc" }).range(...range(params));
  const poIds = [...new Set((data ?? []).map((g) => g.purchase_order_id as string))];
  const { data: pos } = poIds.length ? await supabase.from("purchase_orders").select("id, number, suppliers(name)").in("id", poIds) : { data: [] };
  const poMap = new Map((pos ?? []).map((p) => [p.id, p]));
  return (
    <>
      <PageHeader title="Goods received" description="Every delivery recorded against a purchase order. Receipts are permanent; correct mistakes with a stock adjustment." />
      <Card>
        <ListToolbar placeholder="Search GRN number" filters={[{ name: "discrepancy", label: "Discrepancies", options: [{ value: "yes", label: "Only with discrepancies" }] }]} />
        {(data ?? []).length === 0 ? (
          <EmptyState icon={<PackageOpen />} title="No deliveries recorded yet" description="Open an approved purchase order and choose Receive goods." />
        ) : (
          <Table>
            <THead>
              <tr>
                <TH>GRN</TH>
                <TH>Purchase order</TH>
                <TH>Supplier</TH>
                <TH>Received</TH>
                <TH align="right">Accepted</TH>
                <TH align="right">Rejected</TH>
                <TH />
              </tr>
            </THead>
            <TBody>
              {(data ?? []).map((g) => {
                const po = poMap.get(g.purchase_order_id as string);
                return (
                  <TR key={g.id}>
                    <TD>
                      <Link href={`/commerce/goods-received/${g.id}`} className="font-medium hover:text-accent-ink">
                        {g.number}
                      </Link>
                    </TD>
                    <TD>
                      <Link href={`/commerce/purchase-orders/${g.purchase_order_id}`} className="hover:text-accent-ink">
                        {po?.number}
                      </Link>
                    </TD>
                    <TD>{(po?.suppliers as unknown as { name: string } | undefined)?.name}</TD>
                    <TD className="text-muted">{formatDateTime(g.received_at, ctx.settings.date_format, ctx.settings.timezone)}</TD>
                    <TD align="right">{formatQty(g.total_accepted)}</TD>
                    <TD align="right" className={Number(g.total_rejected) > 0 ? "text-danger-ink" : "text-muted"}>
                      {formatQty(g.total_rejected)}
                    </TD>
                    <TD>{g.discrepancy && <Badge tone="warning">Discrepancy</Badge>}</TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        )}
        <Pagination params={params} total={count ?? 0} base="/commerce/goods-received" sp={sp} />
      </Card>
    </>
  );
}
