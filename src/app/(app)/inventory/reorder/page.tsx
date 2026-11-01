import { BellRing, FilePlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { StockStatusBadge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { TBody, TD, TH, THead, TR, Table } from "@/components/ui/table";
import { getSession, requirePermission } from "@/lib/auth";
import { formatMoney, formatQty } from "@/lib/format";

export const metadata = { title: "Reorder alerts" };

export default async function ReorderPage() {
  const ctx = await requirePermission("inventory.read");
  const { supabase } = await getSession();
  const [{ data: levels }, { data: mats }, { data: pending }] = await Promise.all([
    supabase.from("stock_levels").select("stock_item_id, material_id, name, code, uom_code, on_hand, reserved, available, average_cost, reorder_level, min_stock, max_stock, stock_status, last_movement_at, is_active").eq("organization_id", ctx.org.id).not("material_id", "is", null).in("stock_status", ["low", "out_of_stock"]),
    supabase.from("materials").select("id, reorder_quantity, standard_cost, suppliers:preferred_supplier_id(name, lead_time_days)").eq("organization_id", ctx.org.id),
    supabase.from("production_order_materials").select("stock_item_id, quantity_required, quantity_reserved, quantity_issued, production_orders!inner(status)").eq("organization_id", ctx.org.id).in("production_orders.status", ["materials_pending", "approved"]),
  ]);
  const matBy = new Map((mats ?? []).map((m) => [m.id, m]));
  const shortBy = new Map<string, number>();
  for (const p of pending ?? []) {
    const s = Number(p.quantity_required) - Number(p.quantity_reserved) - Number(p.quantity_issued);
    if (s > 0) shortBy.set(p.stock_item_id, (shortBy.get(p.stock_item_id) ?? 0) + s);
  }
  const rows = (levels ?? [])
    .filter((l) => l.is_active && (Number(l.reorder_level) > 0 || Number(l.min_stock) > 0 || l.last_movement_at || shortBy.has(l.stock_item_id)))
    .map((l) => {
      const m = matBy.get(l.material_id!);
      const target = l.max_stock ? Number(l.max_stock) : Math.max(Number(l.reorder_level), Number(l.min_stock)) + Number(m?.reorder_quantity ?? 0);
      const shortage = shortBy.get(l.stock_item_id) ?? 0;
      // Suggested quantity: bring available back up to target and cover open production shortages.
      const suggested = Math.max(Number(m?.reorder_quantity ?? 0), target - Number(l.available) + shortage, shortage);
      return { ...l, supplier: (m?.suppliers as unknown as { name: string; lead_time_days: number | null } | null) ?? null, shortage, suggested, unit: Number(l.average_cost) || Number(m?.standard_cost ?? 0) };
    })
    .sort((a, b) => Number(a.stock_status !== "out_of_stock") - Number(b.stock_status !== "out_of_stock"));
  const costs = ctx.can("costing.read");

  return (
    <>
      <PageHeader
        title="Reorder alerts"
        actions={
          rows.length > 0 &&
          ctx.can("requisitions.create") && (
            <Button asChild variant="primary">
              <Link href="/commerce/requisitions/new?suggest=1">
                <FilePlus /> Create requisition
              </Link>
            </Button>
          )
        }
        description="Materials at or below their reorder level, plus shortages blocking approved production orders. Suggested quantity = refill to maximum (or reorder level + reorder quantity) and cover open shortages." />
      <Card>
        {rows.length === 0 ? (
          <EmptyState icon={<BellRing />} title="Nothing to reorder" description="Set reorder levels on materials so ForgeOS can warn you before you run out." />
        ) : (
          <Table>
            <THead>
              <tr>
                <TH>Material</TH>
                <TH align="right">Available</TH>
                <TH align="right">Reorder level</TH>
                <TH align="right">Production shortage</TH>
                <TH align="right">Suggested order</TH>
                {costs && <TH align="right">Est. value</TH>}
                <TH>Preferred supplier</TH>
                <TH>Status</TH>
              </tr>
            </THead>
            <TBody>
              {rows.map((r) => (
                <TR key={r.stock_item_id}>
                  <TD>
                    <Link href={`/inventory/materials/${r.material_id}`} className="font-medium hover:text-accent-ink">
                      {r.name}
                    </Link>
                    <span className="ml-2 font-mono text-xs text-muted">{r.code}</span>
                  </TD>
                  <TD align="right">
                    {formatQty(r.available)} {r.uom_code}
                  </TD>
                  <TD align="right">{formatQty(Math.max(Number(r.reorder_level), Number(r.min_stock)))}</TD>
                  <TD align="right" className={r.shortage ? "text-warning-ink" : "text-muted"}>
                    {r.shortage ? formatQty(r.shortage) : "—"}
                  </TD>
                  <TD align="right" className="font-medium">
                    {formatQty(Math.ceil(r.suggested))} {r.uom_code}
                  </TD>
                  {costs && <TD align="right">{formatMoney(Math.ceil(r.suggested) * r.unit, ctx.settings.currency)}</TD>}
                  <TD className="text-muted">{r.supplier ? `${r.supplier.name}${r.supplier.lead_time_days != null ? ` · ${r.supplier.lead_time_days}d lead` : ""}` : "—"}</TD>
                  <TD>
                    <StockStatusBadge status={r.stock_status} />
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>
      <p className="mt-3 text-xs text-muted">Purchase orders and supplier delivery tracking arrive with the procurement module. Until then, receive deliveries from each material&apos;s page.</p>
    </>
  );
}
