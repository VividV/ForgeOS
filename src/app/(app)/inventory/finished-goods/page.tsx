import { PackageCheck } from "lucide-react";
import Link from "next/link";
import { ListToolbar } from "@/components/data/toolbar";
import { Pagination, SortTH, likeTerm, parseList, range, type SearchParams } from "@/components/data/list";
import { Card } from "@/components/ui/card";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { TBody, TD, TH, THead, TR, Table } from "@/components/ui/table";
import { getSession, requirePermission } from "@/lib/auth";
import { formatMoney, formatQty, relativeTime } from "@/lib/format";

export const metadata = { title: "Finished goods" };

export default async function FinishedGoodsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const ctx = await requirePermission("inventory.read");
  const sp = await searchParams;
  const params = parseList(sp, { sortable: ["name", "on_hand", "stock_value", "last_movement_at"], defaultSort: "on_hand", defaultDir: "desc" });
  const { supabase } = await getSession();
  let q = supabase
    .from("stock_levels")
    .select("stock_item_id, product_id, code, name, sku, uom_code, on_hand, reserved, available, average_cost, stock_value, last_movement_at", { count: "exact" })
    .eq("organization_id", ctx.org.id)
    .not("product_variant_id", "is", null);
  if (params.q) q = q.or(`name.ilike.${likeTerm(params.q)},code.ilike.${likeTerm(params.q)},sku.ilike.${likeTerm(params.q)}`);
  if (!sp.all) q = q.neq("on_hand", 0);
  const { data, count } = await q.order(params.sort, { ascending: params.dir === "asc", nullsFirst: false }).range(...range(params));
  const costs = ctx.can("costing.read");
  const base = "/inventory/finished-goods";

  return (
    <>
      <PageHeader
        title="Finished goods"
        description="Accepted output from completed production orders, valued at actual material cost. Rejected units never enter this stock."
        actions={
          <Link href={sp.all ? base : `${base}?all=1`} className="text-[13px] text-accent-ink hover:underline">
            {sp.all ? "Only items in stock" : "Show all products"}
          </Link>
        }
      />
      <Card>
        <ListToolbar placeholder="Search product" />
        {(data ?? []).length === 0 ? (
          <EmptyState icon={<PackageCheck />} title="No finished goods in stock" description="Completing a production order adds its accepted units here." />
        ) : (
          <Table>
            <THead>
              <tr>
                <TH>Code</TH>
                <SortTH label="Product" col="name" params={params} base={base} sp={sp} />
                <SortTH label="On hand" col="on_hand" params={params} base={base} sp={sp} align="right" />
                <TH align="right">Available</TH>
                {costs && <TH align="right">Unit cost</TH>}
                {costs && <SortTH label="Value" col="stock_value" params={params} base={base} sp={sp} align="right" />}
                <SortTH label="Last movement" col="last_movement_at" params={params} base={base} sp={sp} />
              </tr>
            </THead>
            <TBody>
              {(data ?? []).map((r) => (
                <TR key={r.stock_item_id}>
                  <TD className="font-mono text-xs">{r.code}</TD>
                  <TD>
                    <Link href={`/commerce/products/${r.product_id}`} className="font-medium hover:text-accent-ink">
                      {r.name}
                    </Link>
                  </TD>
                  <TD align="right">
                    {formatQty(r.on_hand)} <span className="text-xs text-muted">{r.uom_code}</span>
                  </TD>
                  <TD align="right">{formatQty(r.available)}</TD>
                  {costs && <TD align="right">{formatMoney(r.average_cost, ctx.settings.currency)}</TD>}
                  {costs && <TD align="right">{formatMoney(r.stock_value, ctx.settings.currency)}</TD>}
                  <TD className="text-muted">{relativeTime(r.last_movement_at)}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
        <Pagination params={params} total={count ?? 0} base={base} sp={sp} />
      </Card>
    </>
  );
}
