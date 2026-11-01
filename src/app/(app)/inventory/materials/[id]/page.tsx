import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge, ProductionStatusBadge, StockStatusBadge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { EmptyState, PageHeader, Stat } from "@/components/ui/misc";
import { TBody, TD, TH, THead, TR, Table } from "@/components/ui/table";
import { MOVEMENT_SELECT, MovementsTable, type MovementRow } from "@/components/inventory/movements-table";
import { StockActions } from "@/components/inventory/stock-actions";
import { getSession, requirePermission } from "@/lib/auth";
import { formatMoney, formatQty } from "@/lib/format";
import { lookups } from "@/lib/services/lookups";
import { MaterialForm } from "../material-form";
import { MaterialActiveToggle } from "./toggle";

export default async function MaterialPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requirePermission("materials.read");
  const { supabase } = await getSession();
  const { data: m } = await supabase
    .from("materials")
    .select("*, material_categories(name), stock_uom:units_of_measure!materials_organization_id_stock_uom_id_fkey(code)")
    .eq("id", id)
    .eq("organization_id", ctx.org.id)
    .is("deleted_at", null)
    .maybeSingle();
  if (!m) notFound();
  const { data: si } = await supabase.from("stock_levels").select("*").eq("material_id", id).single();
  const inv = ctx.can("inventory.read");
  const [{ data: balances }, { data: moves }, { data: reservations }, { data: usedIn }, o] = await Promise.all([
    inv ? supabase.from("inventory_balances").select("warehouse_id, on_hand, reserved, available, warehouses(code, name)").eq("stock_item_id", si?.stock_item_id ?? "") : Promise.resolve({ data: [] }),
    inv ? supabase.from("inventory_transactions").select(MOVEMENT_SELECT).eq("stock_item_id", si?.stock_item_id ?? "").order("occurred_at", { ascending: false }).limit(25) : Promise.resolve({ data: [] }),
    inv
      ? supabase.from("material_reservations").select("quantity, production_orders(id, number, status, due_date)").eq("stock_item_id", si?.stock_item_id ?? "").eq("status", "active").gt("quantity", 0)
      : Promise.resolve({ data: [] }),
    supabase.from("bom_items").select("quantity, bills_of_materials!inner(id, version, status, products(name))").eq("stock_item_id", si?.stock_item_id ?? "").eq("bills_of_materials.status", "approved"),
    lookups(ctx.org.id, ["uoms", "suppliers", "warehouses"]),
  ]);
  const costs = ctx.can("costing.read");
  const cur = ctx.settings.currency;
  const uom = (m.stock_uom as unknown as { code: string } | null)?.code ?? "";
  const hasMoves = (moves ?? []).length > 0;
  const reversed = new Set((moves as MovementRow[] | null)?.map((t) => t.reversal_of_id).filter(Boolean) as string[]);

  return (
    <>
      <PageHeader
        title={m.name}
        meta={
          <>
            {si && <StockStatusBadge status={si.stock_status} />}
            {!m.is_active && <Badge>Inactive</Badge>}
          </>
        }
        breadcrumb={[{ label: "Raw materials", href: "/inventory/materials" }, { label: m.code }]}
        actions={
          <>
            {si && inv && (
              <StockActions
                stockItemId={si.stock_item_id}
                uom={uom}
                warehouses={o.warehouses}
                defaultWarehouse={m.default_warehouse_id}
                can={{ create: ctx.can("inventory.create"), adjust: ctx.can("inventory.adjust") }}
                showCosts={costs}
                defaultCost={m.standard_cost}
              />
            )}
            {ctx.can("materials.update") && <MaterialActiveToggle id={m.id} active={m.is_active} />}
          </>
        }
      />
      {si && inv && (
        <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label="On hand" value={`${formatQty(si.on_hand)} ${uom}`} />
          <Stat label="Reserved for production" value={`${formatQty(si.reserved)} ${uom}`} />
          <Stat label="Available" value={`${formatQty(si.available)} ${uom}`} tone={si.stock_status === "out_of_stock" ? "danger" : si.stock_status === "low" ? "warning" : undefined} hint={Number(m.reorder_level) > 0 ? `Reorder at ${formatQty(m.reorder_level)}` : "No reorder level set"} />
          {costs ? <Stat label="Stock value" value={formatMoney(si.stock_value, cur)} hint={`Avg cost ${formatMoney(si.average_cost, cur)} / ${uom}`} /> : <Stat label="Warehouses holding stock" value={(balances ?? []).filter((b) => Number(b.on_hand) !== 0).length} />}
        </div>
      )}
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_440px]">
        <div className="flex flex-col gap-4">
          {inv && (
            <Card>
              <CardHeader title="Stock by warehouse" />
              {(balances ?? []).length === 0 ? (
                <EmptyState title="No stock recorded" description="Record an opening balance or receive stock to start tracking." />
              ) : (
                <Table>
                  <THead>
                    <tr>
                      <TH>Warehouse</TH>
                      <TH align="right">On hand</TH>
                      <TH align="right">Reserved</TH>
                      <TH align="right">Available</TH>
                    </tr>
                  </THead>
                  <TBody>
                    {(balances ?? []).map((b) => (
                      <TR key={b.warehouse_id}>
                        <TD>{(b.warehouses as unknown as { name: string } | null)?.name}</TD>
                        <TD align="right">{formatQty(b.on_hand, 4)}</TD>
                        <TD align="right">{formatQty(b.reserved, 4)}</TD>
                        <TD align="right" className="font-medium">
                          {formatQty(b.available, 4)}
                        </TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
              )}
            </Card>
          )}
          {inv && (reservations ?? []).length > 0 && (
            <Card>
              <CardHeader title="Reserved for production orders" />
              <Table>
                <THead>
                  <tr>
                    <TH>Order</TH>
                    <TH>Status</TH>
                    <TH align="right">Reserved</TH>
                  </tr>
                </THead>
                <TBody>
                  {(reservations ?? []).map((r, i) => {
                    const po = r.production_orders as unknown as { id: string; number: string; status: string };
                    return (
                      <TR key={i}>
                        <TD>
                          <Link href={`/operations/production-orders/${po.id}`} className="text-accent-ink hover:underline">
                            {po.number}
                          </Link>
                        </TD>
                        <TD>
                          <ProductionStatusBadge status={po.status} />
                        </TD>
                        <TD align="right">
                          {formatQty(r.quantity, 4)} {uom}
                        </TD>
                      </TR>
                    );
                  })}
                </TBody>
              </Table>
            </Card>
          )}
          {inv && (
            <Card>
              <CardHeader
                title="Recent movements"
                action={
                  <Link href={`/inventory/movements?item=${si?.stock_item_id}`} className="text-[13px] text-accent-ink hover:underline">
                    View all
                  </Link>
                }
              />
              {hasMoves ? (
                <MovementsTable rows={moves as unknown as MovementRow[]} costs={costs} currency={cur} dateFormat={ctx.settings.date_format} tz={ctx.settings.timezone} canReverse={ctx.can("inventory.approve")} reversed={reversed} />
              ) : (
                <EmptyState title="No movements yet" />
              )}
            </Card>
          )}
          <Card>
            <CardHeader title="Used in approved BOMs" />
            {(usedIn ?? []).length === 0 ? (
              <EmptyState title="Not used in any approved BOM" />
            ) : (
              <Table>
                <TBody>
                  {(usedIn ?? []).map((u, i) => {
                    const b = u.bills_of_materials as unknown as { id: string; version: number; products: { name: string } };
                    return (
                      <TR key={i}>
                        <TD>
                          <Link href={`/commerce/boms/${b.id}`} className="hover:text-accent-ink">
                            {b.products.name} · v{b.version}
                          </Link>
                        </TD>
                        <TD align="right">
                          {formatQty(u.quantity, 4)} {uom} per unit
                        </TD>
                      </TR>
                    );
                  })}
                </TBody>
              </Table>
            )}
          </Card>
        </div>
        <Card>
          <CardHeader title="Details" />
          <CardBody>
            <MaterialForm
              material={{ ...m, category: (m.material_categories as unknown as { name: string } | null)?.name ?? "", standard_cost: costs ? m.standard_cost : undefined }}
              uoms={o.uoms}
              suppliers={o.suppliers}
              warehouses={o.warehouses}
              showCosts={costs}
              unitLocked={hasMoves}
            />
          </CardBody>
        </Card>
      </div>
    </>
  );
}
