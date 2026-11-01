import Link from "next/link";
import { RankBars } from "@/components/charts/charts";
import { StockStatusBadge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { EmptyState, PageHeader, Stat } from "@/components/ui/misc";
import { TBody, TD, TH, THead, TR, Table } from "@/components/ui/table";
import { MOVEMENT_SELECT, MovementsTable, type MovementRow } from "@/components/inventory/movements-table";
import { getSession, requirePermission } from "@/lib/auth";
import { formatMoney, formatQty } from "@/lib/format";

export const metadata = { title: "Inventory" };

export default async function InventoryOverview() {
  const ctx = await requirePermission("inventory.read");
  const { supabase } = await getSession();
  const [{ data: levels }, { data: moves }, { count: reservations }] = await Promise.all([
    supabase.from("stock_levels").select("stock_item_id, material_id, product_id, kind, name, code, uom_code, on_hand, reserved, available, stock_value, stock_status, last_movement_at, reorder_level, is_active").eq("organization_id", ctx.org.id),
    supabase.from("inventory_transactions").select(MOVEMENT_SELECT).eq("organization_id", ctx.org.id).order("occurred_at", { ascending: false }).limit(10),
    supabase.from("material_reservations").select("id", { count: "exact", head: true }).eq("organization_id", ctx.org.id).eq("status", "active").gt("quantity", 0),
  ]);
  const all = levels ?? [];
  const mats = all.filter((l) => l.material_id);
  const fg = all.filter((l) => l.product_id);
  const costs = ctx.can("costing.read");
  const cur = ctx.settings.currency;
  const sum = (a: typeof all) => a.reduce((s, l) => s + Number(l.stock_value), 0);
  const attention = mats.filter((m) => m.is_active && (m.stock_status === "low" || (m.stock_status === "out_of_stock" && m.last_movement_at)));
  const slow = mats.filter((m) => Number(m.on_hand) > 0 && m.last_movement_at && Date.now() - new Date(m.last_movement_at).getTime() > 60 * 86400000);
  const excess = mats.filter((m) => m.stock_status === "excess");
  const byKind = ["raw_material", "consumable", "packaging", "finished_good"].map((k) => ({ label: { raw_material: "Raw materials", consumable: "Consumables", packaging: "Packaging", finished_good: "Finished goods" }[k]!, value: sum(all.filter((l) => l.kind === k)) }));

  return (
    <>
      <PageHeader title="Inventory overview" description="Every figure is calculated from the stock ledger. Available stock excludes quantities reserved for production." />
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-5">
        {costs && <Stat label="Total stock value" value={formatMoney(sum(all), cur, { compact: true })} hint="Weighted average cost" />}
        <Stat label="Materials tracked" value={mats.length} href="/inventory/materials" />
        <Stat label="Need reordering" value={attention.length} tone={attention.length ? "warning" : undefined} href="/inventory/reorder" />
        <Stat label="Active reservations" value={reservations ?? 0} href="/inventory/reservations" />
        <Stat label="Finished goods lines in stock" value={fg.filter((f) => Number(f.on_hand) > 0).length} href="/inventory/finished-goods" />
      </div>
      <div className="grid gap-4 xl:grid-cols-3">
        <div className="flex flex-col gap-4 xl:col-span-2">
          <Card>
            <CardHeader title="Needs attention" description="Low or out of stock (active materials)" action={<Link href="/inventory/reorder" className="text-[13px] text-accent-ink hover:underline">Reorder view</Link>} />
            {attention.length === 0 ? (
              <EmptyState title="Stock levels are healthy" />
            ) : (
              <Table>
                <THead>
                  <tr>
                    <TH>Material</TH>
                    <TH align="right">Available</TH>
                    <TH align="right">Reorder level</TH>
                    <TH>Status</TH>
                  </tr>
                </THead>
                <TBody>
                  {attention.slice(0, 10).map((m) => (
                    <TR key={m.stock_item_id}>
                      <TD>
                        <Link href={`/inventory/materials/${m.material_id}`} className="hover:text-accent-ink">
                          {m.name}
                        </Link>
                      </TD>
                      <TD align="right">
                        {formatQty(m.available)} {m.uom_code}
                      </TD>
                      <TD align="right">{formatQty(m.reorder_level)}</TD>
                      <TD>
                        <StockStatusBadge status={m.stock_status} />
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            )}
          </Card>
          <Card>
            <CardHeader title="Latest movements" action={<Link href="/inventory/movements" className="text-[13px] text-accent-ink hover:underline">All movements</Link>} />
            {(moves ?? []).length === 0 ? (
              <EmptyState title="No stock movements yet" />
            ) : (
              <MovementsTable rows={moves as unknown as MovementRow[]} showItem costs={costs} currency={cur} dateFormat={ctx.settings.date_format} tz={ctx.settings.timezone} />
            )}
          </Card>
        </div>
        <div className="flex flex-col gap-4">
          {costs && (
            <Card>
              <CardHeader title="Value by type" />
              <CardBody>
                <RankBars data={byKind.filter((k) => k.value !== 0)} money={cur} empty="No valued stock yet" />
              </CardBody>
            </Card>
          )}
          <Card>
            <CardHeader title="Slow-moving" description="Stock with no movement in 60+ days" />
            {slow.length === 0 ? (
              <EmptyState title="None" />
            ) : (
              <ul className="divide-y divide-line">
                {slow.slice(0, 8).map((m) => (
                  <li key={m.stock_item_id} className="flex justify-between px-4 py-2 text-[13px]">
                    <Link href={`/inventory/materials/${m.material_id}`} className="hover:text-accent-ink">
                      {m.name}
                    </Link>
                    <span className="tabular text-muted">{formatQty(m.on_hand)} {m.uom_code}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card>
            <CardHeader title="Excess stock" description="Above maximum stock level" />
            {excess.length === 0 ? (
              <EmptyState title="None" />
            ) : (
              <ul className="divide-y divide-line">
                {excess.slice(0, 8).map((m) => (
                  <li key={m.stock_item_id} className="flex justify-between px-4 py-2 text-[13px]">
                    <span>{m.name}</span>
                    <span className="tabular text-muted">{formatQty(m.on_hand)} {m.uom_code}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
