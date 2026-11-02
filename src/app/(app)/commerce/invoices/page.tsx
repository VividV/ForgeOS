import { FileText } from "lucide-react";
import Link from "next/link";
import { ListToolbar } from "@/components/data/toolbar";
import { Pagination, parseList, range, type SearchParams } from "@/components/data/list";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { TBody, TD, TH, THead, TR, Table } from "@/components/ui/table";
import { getSession, requirePermission } from "@/lib/auth";
import { formatDate, formatMoney, todayIn } from "@/lib/format";

export const metadata = { title: "Invoices" };

export default async function InvoicesPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const ctx = await requirePermission("sales_orders.read");
  const sp = await searchParams;
  const params = parseList(sp, { sortable: ["issue_date"], defaultSort: "issue_date", defaultDir: "desc", filters: ["status"] });
  const { supabase } = await getSession();
  let q = supabase.from("invoices").select("id, number, issue_date, due_date, total, status, currency, customers(name), sales_orders(id, number, total, amount_paid, amount_credited)", { count: "exact" }).eq("organization_id", ctx.org.id);
  if (params.filters.status) q = q.eq("status", params.filters.status);
  if (params.q) q = q.ilike("number", `%${params.q.replace(/[%_]/g, "")}%`);
  const { data, count } = await q.order("number", { ascending: params.dir === "asc" }).range(...range(params));
  const today = todayIn(ctx.settings.timezone);
  return (
    <>
      <PageHeader title="Invoices" description="Tax invoices issued from customer orders. Payments are recorded on the order." />
      <Card>
        <ListToolbar placeholder="Search invoice number" filters={[{ name: "status", label: "Status", options: [{ value: "issued", label: "Issued" }, { value: "void", label: "Void" }] }]} />
        {(data ?? []).length === 0 ? (
          <EmptyState icon={<FileText />} title="No invoices yet" description="Issue one from a customer order." />
        ) : (
          <Table>
            <THead>
              <tr>
                <TH>Invoice</TH>
                <TH>Customer</TH>
                <TH>Order</TH>
                <TH>Issued</TH>
                <TH>Due</TH>
                <TH align="right">Total</TH>
                <TH>Order balance</TH>
              </tr>
            </THead>
            <TBody>
              {(data ?? []).map((i) => {
                const so = i.sales_orders as unknown as { id: string; number: string; total: number; amount_paid: number; amount_credited: number };
                const bal = Number(so.total) - Number(so.amount_paid) - Number(so.amount_credited);
                const overdue = i.status === "issued" && i.due_date && i.due_date < today && bal > 0.004;
                return (
                  <TR key={i.id}>
                    <TD>
                      <Link className="font-medium hover:text-accent-ink" href={`/commerce/invoices/${i.id}`}>
                        {i.number}
                      </Link>{" "}
                      {i.status === "void" && <Badge>Void</Badge>}
                    </TD>
                    <TD>{(i.customers as unknown as { name: string }).name}</TD>
                    <TD>
                      <Link className="hover:text-accent-ink" href={`/commerce/customer-orders/${so.id}`}>
                        {so.number}
                      </Link>
                    </TD>
                    <TD className="text-muted">{formatDate(i.issue_date, ctx.settings.date_format)}</TD>
                    <TD className={overdue ? "font-medium text-danger-ink" : "text-muted"}>{formatDate(i.due_date, ctx.settings.date_format)}</TD>
                    <TD align="right" className={i.status === "void" ? "line-through" : ""}>
                      {formatMoney(i.total, i.currency)}
                    </TD>
                    <TD>{bal <= 0.004 ? <Badge tone="success">Settled</Badge> : <Badge tone={overdue ? "danger" : "warning"}>{formatMoney(bal, i.currency)} due</Badge>}</TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        )}
        <Pagination params={params} total={count ?? 0} base="/commerce/invoices" sp={sp} />
      </Card>
    </>
  );
}
