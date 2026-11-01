import { Download, FileUp, Layers, Plus } from "lucide-react";
import Link from "next/link";
import { ListToolbar } from "@/components/data/toolbar";
import { Pagination, SortTH, likeTerm, parseList, range, type SearchParams } from "@/components/data/list";
import { Badge, StockStatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { TBody, TD, TH, THead, TR, Table } from "@/components/ui/table";
import { getSession, requirePermission } from "@/lib/auth";
import { formatMoney, formatQty } from "@/lib/format";

export const metadata = { title: "Raw materials" };

export default async function MaterialsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const ctx = await requirePermission("materials.read");
  const sp = await searchParams;
  const params = parseList(sp, { sortable: ["code", "name", "available", "on_hand", "stock_value"], defaultSort: "name", filters: ["status", "kind"] });
  const { supabase } = await getSession();
  let q = supabase
    .from("stock_levels")
    .select("stock_item_id, material_id, code, name, sku, kind, uom_code, on_hand, reserved, available, stock_value, average_cost, reorder_level, stock_status, is_active", { count: "exact" })
    .eq("organization_id", ctx.org.id)
    .not("material_id", "is", null);
  if (params.q) q = q.or(`name.ilike.${likeTerm(params.q)},code.ilike.${likeTerm(params.q)},sku.ilike.${likeTerm(params.q)}`);
  if (params.filters.status) q = q.eq("stock_status", params.filters.status);
  if (params.filters.kind) q = q.eq("kind", params.filters.kind);
  const { data, count } = await q.order(params.sort, { ascending: params.dir === "asc" }).range(...range(params));
  const costs = ctx.can("costing.read");
  const cur = ctx.settings.currency;
  const base = "/inventory/materials";

  return (
    <>
      <PageHeader
        title="Raw materials"
        description="Available = on hand − reserved for production. Reserved stock can't be used for anything else."
        actions={
          <>
            {ctx.can("materials.export") && (
              <Button asChild>
                <a href="/api/export/materials">
                  <Download /> Export CSV
                </a>
              </Button>
            )}
            {ctx.can("materials.create") && (
              <>
                <Button asChild>
                  <Link href="/inventory/materials/import">
                    <FileUp /> Import CSV
                  </Link>
                </Button>
                <Button asChild variant="primary">
                  <Link href="/inventory/materials/new">
                    <Plus /> New material
                  </Link>
                </Button>
              </>
            )}
          </>
        }
      />
      <Card>
        <ListToolbar
          placeholder="Search name, code or SKU"
          filters={[
            { name: "status", label: "Stock", options: [{ value: "ok", label: "In stock" }, { value: "low", label: "Low" }, { value: "out_of_stock", label: "Out of stock" }, { value: "excess", label: "Excess" }] },
            { name: "kind", label: "Type", options: [{ value: "raw_material", label: "Raw material" }, { value: "consumable", label: "Consumable" }, { value: "packaging", label: "Packaging" }] },
          ]}
        />
        {(data ?? []).length === 0 ? (
          <EmptyState
            icon={<Layers />}
            title={params.q || Object.keys(params.filters).length ? "No materials match" : "No materials yet"}
            description="Add the raw materials, consumables and packaging you use, or import them with opening stock."
          />
        ) : (
          <Table>
            <THead>
              <tr>
                <SortTH label="Code" col="code" params={params} base={base} sp={sp} />
                <SortTH label="Material" col="name" params={params} base={base} sp={sp} />
                <SortTH label="On hand" col="on_hand" params={params} base={base} sp={sp} align="right" />
                <TH align="right">Reserved</TH>
                <SortTH label="Available" col="available" params={params} base={base} sp={sp} align="right" />
                <TH align="right">Reorder at</TH>
                {costs && <TH align="right">Avg cost</TH>}
                {costs && <SortTH label="Value" col="stock_value" params={params} base={base} sp={sp} align="right" />}
                <TH>Status</TH>
              </tr>
            </THead>
            <TBody>
              {(data ?? []).map((m) => (
                <TR key={m.stock_item_id}>
                  <TD className="font-mono text-xs">{m.code}</TD>
                  <TD>
                    <Link href={`/inventory/materials/${m.material_id}`} className="font-medium hover:text-accent-ink">
                      {m.name}
                    </Link>
                    {!m.is_active && <Badge className="ml-2">Inactive</Badge>}
                  </TD>
                  <TD align="right">
                    {formatQty(m.on_hand)} <span className="text-xs text-muted">{m.uom_code}</span>
                  </TD>
                  <TD align="right" className="text-muted">
                    {formatQty(m.reserved)}
                  </TD>
                  <TD align="right" className="font-medium">
                    {formatQty(m.available)}
                  </TD>
                  <TD align="right" className="text-muted">
                    {Number(m.reorder_level) > 0 ? formatQty(m.reorder_level) : "—"}
                  </TD>
                  {costs && <TD align="right">{formatMoney(m.average_cost, cur)}</TD>}
                  {costs && <TD align="right">{formatMoney(m.stock_value, cur)}</TD>}
                  <TD>
                    <StockStatusBadge status={m.stock_status} />
                  </TD>
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
