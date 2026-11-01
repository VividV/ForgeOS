import { ListTree } from "lucide-react";
import Link from "next/link";
import { ListToolbar } from "@/components/data/toolbar";
import { Pagination, parseList, range, type SearchParams } from "@/components/data/list";
import { BomStatusBadge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { TBody, TD, TH, THead, TR, Table } from "@/components/ui/table";
import { getSession, requirePermission } from "@/lib/auth";
import { formatDate } from "@/lib/format";

export const metadata = { title: "Bills of materials" };

export default async function BomsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const ctx = await requirePermission("bom.read");
  const sp = await searchParams;
  const params = parseList(sp, { sortable: ["created_at"], defaultSort: "created_at", defaultDir: "desc", filters: ["status"] });
  const { supabase } = await getSession();
  let q = supabase
    .from("bills_of_materials")
    .select("id, version, name, status, approved_at, created_at, products!inner(id, code, name), product_variants(name), bom_items(count)", { count: "exact" })
    .eq("organization_id", ctx.org.id);
  if (params.filters.status) q = q.eq("status", params.filters.status);
  else q = q.in("status", ["draft", "pending_approval", "approved"]);
  if (params.q) q = q.ilike("products.name", `%${params.q.replace(/[%_]/g, "")}%`);
  const { data, count } = await q.order("created_at", { ascending: false }).range(...range(params));

  return (
    <>
      <PageHeader title="Bills of materials" description="Create a BOM from a product's page. Approved BOMs are read-only; make a new version to change them." />
      <Card>
        <ListToolbar
          placeholder="Search product"
          filters={[
            {
              name: "status",
              label: "Status",
              options: [
                { value: "draft", label: "Draft" },
                { value: "pending_approval", label: "Pending approval" },
                { value: "approved", label: "Approved" },
                { value: "superseded", label: "Superseded" },
                { value: "archived", label: "Archived" },
              ],
            },
          ]}
        />
        {(data ?? []).length === 0 ? (
          <EmptyState icon={<ListTree />} title="No BOMs found" description="Open a product and choose Create BOM." />
        ) : (
          <Table>
            <THead>
              <tr>
                <TH>Product</TH>
                <TH>Version</TH>
                <TH>Variant</TH>
                <TH align="right">Lines</TH>
                <TH>Status</TH>
                <TH>Approved</TH>
              </tr>
            </THead>
            <TBody>
              {(data ?? []).map((b) => {
                const p = b.products as unknown as { id: string; code: string; name: string };
                return (
                  <TR key={b.id}>
                    <TD>
                      <Link href={`/commerce/boms/${b.id}`} className="font-medium hover:text-accent-ink">
                        {p.name}
                      </Link>
                      <span className="ml-2 font-mono text-xs text-muted">{p.code}</span>
                    </TD>
                    <TD>v{b.version}</TD>
                    <TD className="text-muted">{(b.product_variants as unknown as { name: string } | null)?.name ?? "All"}</TD>
                    <TD align="right">{(b.bom_items as unknown as { count: number }[])[0]?.count ?? 0}</TD>
                    <TD>
                      <BomStatusBadge status={b.status} />
                    </TD>
                    <TD className="text-muted">{formatDate(b.approved_at, ctx.settings.date_format, ctx.settings.timezone)}</TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        )}
        <Pagination params={params} total={count ?? 0} base="/commerce/boms" sp={sp} />
      </Card>
    </>
  );
}
