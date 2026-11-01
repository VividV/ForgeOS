import { Send } from "lucide-react";
import Link from "next/link";
import { ListToolbar } from "@/components/data/toolbar";
import { Pagination, parseList, range, type SearchParams } from "@/components/data/list";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { TBody, TD, TH, THead, TR, Table } from "@/components/ui/table";
import { getSession, requirePermission } from "@/lib/auth";
import { formatDateTime, formatQty } from "@/lib/format";

export const metadata = { title: "Dispatches" };

export default async function DispatchesPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const ctx = await requirePermission("sales_orders.read");
  const sp = await searchParams;
  const params = parseList(sp, { sortable: ["dispatched_at"], defaultSort: "dispatched_at", defaultDir: "desc", filters: ["status"] });
  const { supabase } = await getSession();
  let q = supabase
    .from("dispatches")
    .select("id, number, dispatched_at, status, carrier, tracking_reference, received_by, delivered_at, sales_orders(id, number, customers(name)), dispatch_items(quantity)", { count: "exact" })
    .eq("organization_id", ctx.org.id);
  if (params.filters.status) q = q.eq("status", params.filters.status);
  if (params.q) q = q.ilike("number", `%${params.q.replace(/[%_]/g, "")}%`);
  const { data, count } = await q.order("dispatched_at", { ascending: params.dir === "asc" }).range(...range(params));
  const df = ctx.settings.date_format;
  const tz = ctx.settings.timezone;
  return (
    <>
      <PageHeader title="Dispatches" description="Goods sent to customers. Each dispatch is a permanent record; confirm delivery when the customer receives it." />
      <Card>
        <ListToolbar placeholder="Search dispatch number" filters={[{ name: "status", label: "Status", options: [{ value: "dispatched", label: "In transit" }, { value: "delivered", label: "Delivered" }] }]} />
        {(data ?? []).length === 0 ? (
          <EmptyState icon={<Send />} title="Nothing dispatched yet" description="Dispatch goods from a confirmed customer order." />
        ) : (
          <Table>
            <THead>
              <tr>
                <TH>Dispatch</TH>
                <TH>Order</TH>
                <TH>Customer</TH>
                <TH>Sent</TH>
                <TH>Carrier</TH>
                <TH align="right">Units</TH>
                <TH>Status</TH>
              </tr>
            </THead>
            <TBody>
              {(data ?? []).map((d) => {
                const so = d.sales_orders as unknown as { id: string; number: string; customers: { name: string } };
                return (
                  <TR key={d.id}>
                    <TD>
                      <Link href={`/commerce/dispatches/${d.id}`} className="font-medium hover:text-accent-ink">
                        {d.number}
                      </Link>
                    </TD>
                    <TD>
                      <Link href={`/commerce/customer-orders/${so.id}`} className="hover:text-accent-ink">
                        {so.number}
                      </Link>
                    </TD>
                    <TD>{so.customers.name}</TD>
                    <TD className="text-muted">{formatDateTime(d.dispatched_at, df, tz)}</TD>
                    <TD className="text-muted">{[d.carrier, d.tracking_reference].filter(Boolean).join(" · ") || "—"}</TD>
                    <TD align="right">{formatQty(((d.dispatch_items as { quantity: number }[]) ?? []).reduce((s, x) => s + Number(x.quantity), 0))}</TD>
                    <TD>{d.status === "delivered" ? <Badge tone="success">Delivered</Badge> : <Badge tone="info">In transit</Badge>}</TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        )}
        <Pagination params={params} total={count ?? 0} base="/commerce/dispatches" sp={sp} />
      </Card>
    </>
  );
}
