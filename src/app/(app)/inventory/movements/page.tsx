import { ArrowLeftRight, Download } from "lucide-react";
import { ListToolbar } from "@/components/data/toolbar";
import { Pagination, parseList, range, type SearchParams } from "@/components/data/list";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { MOVEMENT_SELECT, MovementsTable, TXN_LABEL, type MovementRow } from "@/components/inventory/movements-table";
import { getSession, requirePermission } from "@/lib/auth";
import { lookups } from "@/lib/services/lookups";

export const metadata = { title: "Stock movements" };

export default async function MovementsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const ctx = await requirePermission("inventory.read");
  const sp = await searchParams;
  const params = parseList(sp, { sortable: ["occurred_at"], defaultSort: "occurred_at", defaultDir: "desc", filters: ["type", "warehouse", "item", "from", "to"], pageSize: 50 });
  const { supabase } = await getSession();
  let q = supabase.from("inventory_transactions").select(MOVEMENT_SELECT, { count: "exact" }).eq("organization_id", ctx.org.id);
  const f = params.filters;
  if (f.type) q = q.eq("txn_type", f.type);
  if (f.warehouse) q = q.eq("warehouse_id", f.warehouse);
  if (f.item && /^[0-9a-f-]{36}$/.test(f.item)) q = q.eq("stock_item_id", f.item);
  if (f.from && /^\d{4}-\d{2}-\d{2}$/.test(f.from)) q = q.gte("occurred_at", f.from);
  if (f.to && /^\d{4}-\d{2}-\d{2}$/.test(f.to)) q = q.lt("occurred_at", new Date(new Date(f.to).getTime() + 86400000).toISOString());
  const [{ data, count }, { warehouses }] = await Promise.all([q.order("occurred_at", { ascending: false }).range(...range(params)), lookups(ctx.org.id, ["warehouses"])]);
  const rows = (data ?? []) as unknown as MovementRow[];
  const ids = rows.map((r) => r.id);
  const { data: rev } = ids.length ? await supabase.from("inventory_transactions").select("reversal_of_id").in("reversal_of_id", ids) : { data: [] };
  const reversed = new Set((rev ?? []).map((r) => r.reversal_of_id as string));
  const exportQs = new URLSearchParams(Object.entries(f)).toString();

  return (
    <>
      <PageHeader
        title="Stock movements"
        description="The immutable stock ledger. Mistakes are corrected with reversals, never by editing or deleting entries."
        actions={
          ctx.can("inventory.export") && (
            <Button asChild>
              {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- file download, not a page */}
                  <a href={`/api/export/movements${exportQs ? `?${exportQs}` : ""}`}>
                <Download /> Export CSV
              </a>
            </Button>
          )
        }
      />
      <Card>
        <ListToolbar
          search={false}
          filters={[
            { name: "type", label: "Type", options: Object.entries(TXN_LABEL).map(([value, l]) => ({ value, label: l.label })) },
            { name: "warehouse", label: "Warehouse", options: warehouses },
          ]}
        />
        {rows.length === 0 ? (
          <EmptyState icon={<ArrowLeftRight />} title="No movements found" />
        ) : (
          <MovementsTable rows={rows} showItem costs={ctx.can("costing.read")} currency={ctx.settings.currency} dateFormat={ctx.settings.date_format} tz={ctx.settings.timezone} canReverse={ctx.can("inventory.approve")} reversed={reversed} />
        )}
        <Pagination params={params} total={count ?? 0} base="/inventory/movements" sp={sp} />
      </Card>
    </>
  );
}
