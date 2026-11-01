import { FileUp, Plus, Shirt } from "lucide-react";
import Link from "next/link";
import { ListToolbar } from "@/components/data/toolbar";
import { Pagination, SortTH, likeTerm, parseList, range, type SearchParams } from "@/components/data/list";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { TBody, TD, TH, THead, TR, Table } from "@/components/ui/table";
import { getSession, requirePermission } from "@/lib/auth";
import { formatMoney } from "@/lib/format";

export const metadata = { title: "Products" };

export default async function ProductsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const ctx = await requirePermission("products.read");
  const sp = await searchParams;
  const params = parseList(sp, { sortable: ["code", "name", "selling_price", "created_at"], defaultSort: "name", filters: ["status"] });
  const { supabase } = await getSession();
  let q = supabase
    .from("products")
    .select("id, code, name, sku, status, selling_price, target_cost, product_categories(name), product_variants(count), bills_of_materials(status)", { count: "exact" })
    .eq("organization_id", ctx.org.id)
    .is("deleted_at", null);
  if (params.q) q = q.or(`name.ilike.${likeTerm(params.q)},code.ilike.${likeTerm(params.q)},sku.ilike.${likeTerm(params.q)}`);
  if (params.filters.status) q = q.eq("status", params.filters.status);
  const { data, count } = await q.order(params.sort, { ascending: params.dir === "asc" }).range(...range(params));
  const base = "/commerce/products";

  return (
    <>
      <PageHeader
        title="Products"
        description="What you manufacture. Each product needs an approved bill of materials before it can be produced."
        actions={
          ctx.can("products.create") && (
            <>
              <Button asChild>
                <Link href="/commerce/products/import">
                  <FileUp /> Import CSV
                </Link>
              </Button>
              <Button asChild variant="primary">
                <Link href="/commerce/products/new">
                  <Plus /> New product
                </Link>
              </Button>
            </>
          )
        }
      />
      <Card>
        <ListToolbar
          placeholder="Search name, code or SKU"
          filters={[{ name: "status", label: "Status", options: [{ value: "active", label: "Active" }, { value: "draft", label: "Draft" }, { value: "discontinued", label: "Discontinued" }] }]}
        />
        {(data ?? []).length === 0 ? (
          <EmptyState
            icon={<Shirt />}
            title={params.q || params.filters.status ? "No products match" : "No products yet"}
            description={params.q ? "Try a different search." : "Add the products you manufacture, or import them from a spreadsheet."}
          />
        ) : (
          <Table>
            <THead>
              <tr>
                <SortTH label="Code" col="code" params={params} base={base} sp={sp} />
                <SortTH label="Name" col="name" params={params} base={base} sp={sp} />
                <TH>Category</TH>
                <TH align="right">Variants</TH>
                <TH>BOM</TH>
                <SortTH label="Selling price" col="selling_price" params={params} base={base} sp={sp} align="right" />
                <TH>Status</TH>
              </tr>
            </THead>
            <TBody>
              {(data ?? []).map((p) => {
                const boms = (p.bills_of_materials as { status: string }[]) ?? [];
                const approved = boms.some((b) => b.status === "approved");
                return (
                  <TR key={p.id}>
                    <TD className="font-mono text-xs">
                      <Link href={`/commerce/products/${p.id}`} className="hover:text-accent-ink">
                        {p.code}
                      </Link>
                    </TD>
                    <TD>
                      <Link href={`/commerce/products/${p.id}`} className="font-medium hover:text-accent-ink">
                        {p.name}
                      </Link>
                      {p.sku && <span className="ml-2 text-xs text-muted">{p.sku}</span>}
                    </TD>
                    <TD className="text-muted">{(p.product_categories as unknown as { name: string } | null)?.name ?? "—"}</TD>
                    <TD align="right">{(p.product_variants as unknown as { count: number }[])[0]?.count ?? 0}</TD>
                    <TD>{approved ? <Badge tone="success">Approved</Badge> : boms.length ? <Badge tone="warning">Not approved</Badge> : <Badge>None</Badge>}</TD>
                    <TD align="right">{formatMoney(p.selling_price, ctx.settings.currency)}</TD>
                    <TD>
                      <Badge tone={p.status === "active" ? "success" : "neutral"}>{p.status.charAt(0).toUpperCase() + p.status.slice(1)}</Badge>
                    </TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        )}
        <Pagination params={params} total={count ?? 0} base={base} sp={sp} />
      </Card>
    </>
  );
}
