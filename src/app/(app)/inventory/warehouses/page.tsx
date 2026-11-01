import { Warehouse } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { TBody, TD, TH, THead, TR, Table } from "@/components/ui/table";
import { getSession, requirePermission } from "@/lib/auth";
import { formatMoney, formatQty } from "@/lib/format";
import { lookups } from "@/lib/services/lookups";
import { WarehouseDialog, WarehouseToggle } from "./dialogs";

export const metadata = { title: "Warehouses" };

export default async function WarehousesPage() {
  const ctx = await requirePermission("warehouses.read");
  const { supabase } = await getSession();
  const [{ data: rows }, { data: balances }, opts] = await Promise.all([
    supabase.from("warehouses").select("*, factories!warehouses_factory_id_fkey(name)").eq("organization_id", ctx.org.id).is("deleted_at", null).order("name"),
    ctx.can("inventory.read")
      ? supabase.from("inventory_balances").select("warehouse_id, on_hand, stock_items(average_cost)").eq("organization_id", ctx.org.id).neq("on_hand", 0)
      : Promise.resolve({ data: [] as { warehouse_id: string; on_hand: number; stock_items: unknown }[] }),
    lookups(ctx.org.id, ["factories"]),
  ]);
  const stats = new Map<string, { items: number; value: number }>();
  for (const b of balances ?? []) {
    const s = stats.get(b.warehouse_id) ?? { items: 0, value: 0 };
    s.items += 1;
    s.value += Number(b.on_hand) * Number((b.stock_items as unknown as { average_cost: number } | null)?.average_cost ?? 0);
    stats.set(b.warehouse_id, s);
  }
  const manage = ctx.can("warehouses.manage");
  const costs = ctx.can("costing.read");

  return (
    <>
      <PageHeader title="Warehouses" description="Stores and locations that hold stock. Every factory has a default store." actions={manage && <WarehouseDialog factories={opts.factories} />} />
      <Card>
        {(rows ?? []).length === 0 ? (
          <EmptyState icon={<Warehouse />} title="No warehouses" description="Warehouses are created with each factory, or add one here." />
        ) : (
          <Table>
            <THead>
              <tr>
                <TH>Code</TH>
                <TH>Name</TH>
                <TH>Factory</TH>
                <TH align="right">Items in stock</TH>
                {costs && <TH align="right">Stock value</TH>}
                <TH>Status</TH>
                {manage && <TH align="right">Actions</TH>}
              </tr>
            </THead>
            <TBody>
              {(rows ?? []).map((w) => (
                <TR key={w.id}>
                  <TD className="font-mono text-xs">{w.code}</TD>
                  <TD>{w.name}</TD>
                  <TD>{(w.factories as unknown as { name: string } | null)?.name ?? "—"}</TD>
                  <TD align="right">{formatQty(stats.get(w.id)?.items ?? 0)}</TD>
                  {costs && <TD align="right">{formatMoney(stats.get(w.id)?.value ?? 0, ctx.settings.currency)}</TD>}
                  <TD>{w.is_active ? <Badge tone="success">Active</Badge> : <Badge>Inactive</Badge>}</TD>
                  {manage && (
                    <TD align="right">
                      <div className="flex justify-end gap-1">
                        <WarehouseDialog factories={opts.factories} warehouse={w} />
                        <WarehouseToggle id={w.id} active={w.is_active} />
                      </div>
                    </TD>
                  )}
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>
    </>
  );
}
