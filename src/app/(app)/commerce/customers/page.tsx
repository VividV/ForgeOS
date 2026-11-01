import { Contact } from "lucide-react";
import Link from "next/link";
import { ListToolbar } from "@/components/data/toolbar";
import { Pagination, likeTerm, parseList, range, type SearchParams } from "@/components/data/list";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { TBody, TD, TH, THead, TR, Table } from "@/components/ui/table";
import { getSession, requirePermission } from "@/lib/auth";
import { formatDate, formatMoney } from "@/lib/format";
import { CustomerDialog } from "./dialog";

export const metadata = { title: "Customers" };

export default async function CustomersPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const ctx = await requirePermission("customers.read", "sales_orders.read");
  const sp = await searchParams;
  const params = parseList(sp, { sortable: ["name"], defaultSort: "name", filters: ["archived"] });
  const { supabase } = await getSession();
  let q = supabase.from("customers").select("id, code, name, customer_type, contact_name, phone, email, payment_terms, is_active", { count: "exact" }).eq("organization_id", ctx.org.id).is("deleted_at", null);
  q = params.filters.archived === "yes" ? q.eq("is_active", false) : q.eq("is_active", true);
  if (params.q) q = q.or(`name.ilike.${likeTerm(params.q)},code.ilike.${likeTerm(params.q)},contact_name.ilike.${likeTerm(params.q)},phone.ilike.${likeTerm(params.q)}`);
  const { data, count } = await q.order("name").range(...range(params));
  const ids = (data ?? []).map((c) => c.id);
  const canMoney = ctx.can("sales_orders.read");
  const { data: bals } = ids.length && canMoney ? await supabase.from("customer_balances").select("customer_id, orders, open_orders, balance_due, last_order_date").in("customer_id", ids) : { data: [] };
  const balBy = new Map((bals ?? []).map((b) => [b.customer_id, b]));
  const cur = ctx.settings.currency;
  return (
    <>
      <PageHeader title="Customers" description="Who you sell to. Orders, deliveries and balances are tracked per customer." actions={ctx.can("customers.manage") && <CustomerDialog />} />
      <Card>
        <ListToolbar placeholder="Search name, code, contact or phone" filters={[{ name: "archived", label: "Status", options: [{ value: "yes", label: "Archived" }] }]} />
        {(data ?? []).length === 0 ? (
          <EmptyState icon={<Contact />} title="No customers yet" description={ctx.can("customers.manage") ? "Add the boutiques, distributors and clients you sell to." : undefined} />
        ) : (
          <Table>
            <THead>
              <tr>
                <TH>Customer</TH>
                <TH>Contact</TH>
                <TH>Terms</TH>
                {canMoney && <TH align="right">Open orders</TH>}
                {canMoney && <TH align="right">Balance due</TH>}
                {canMoney && <TH>Last order</TH>}
              </tr>
            </THead>
            <TBody>
              {(data ?? []).map((c) => {
                const b = balBy.get(c.id);
                return (
                  <TR key={c.id}>
                    <TD>
                      <Link href={`/commerce/customers/${c.id}`} className="font-medium hover:text-accent-ink">
                        {c.name}
                      </Link>{" "}
                      <span className="font-mono text-xs text-muted">{c.code}</span>
                      {c.customer_type !== "business" && <Badge className="ml-2">{c.customer_type}</Badge>}
                    </TD>
                    <TD className="text-muted">{[c.contact_name, c.phone, c.email].filter(Boolean).join(" · ") || "—"}</TD>
                    <TD className="text-muted">{c.payment_terms ?? "—"}</TD>
                    {canMoney && <TD align="right">{b ? Number(b.open_orders) : 0}</TD>}
                    {canMoney && (
                      <TD align="right" className={b && Number(b.balance_due) > 0 ? "font-medium" : "text-muted"}>
                        {formatMoney(b?.balance_due ?? 0, cur)}
                      </TD>
                    )}
                    {canMoney && <TD className="text-muted">{formatDate(b?.last_order_date, ctx.settings.date_format)}</TD>}
                  </TR>
                );
              })}
            </TBody>
          </Table>
        )}
        <Pagination params={params} total={count ?? 0} base="/commerce/customers" sp={sp} />
      </Card>
    </>
  );
}
