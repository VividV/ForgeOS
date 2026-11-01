import { Card, CardBody } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/misc";
import { getSession, requirePermission } from "@/lib/auth";
import { lookups } from "@/lib/services/lookups";
import { AdjustmentForm } from "./form";

export const metadata = { title: "New stock adjustment" };

export default async function NewAdjustmentPage() {
  const ctx = await requirePermission("inventory.adjust");
  const { supabase } = await getSession();
  const [{ warehouses }, { data: items }, { data: balances }] = await Promise.all([
    lookups(ctx.org.id, ["warehouses"]),
    supabase.from("stock_item_details").select("id, name, code, uom_code, kind").eq("organization_id", ctx.org.id).eq("is_active", true).order("name"),
    supabase.from("inventory_balances").select("stock_item_id, warehouse_id, on_hand, available").eq("organization_id", ctx.org.id),
  ]);
  return (
    <>
      <PageHeader title="New stock adjustment" breadcrumb={[{ label: "Stock adjustments", href: "/inventory/adjustments" }, { label: "New" }]} description="Use this after a stock count, or to write off damaged or wasted stock. Each line becomes a ledger entry." />
      <Card className="max-w-4xl">
        <CardBody>
          <AdjustmentForm
            warehouses={warehouses}
            items={(items ?? []).map((i) => ({ value: i.id, label: `${i.name} (${i.code})`, uom: i.uom_code }))}
            balances={(balances ?? []).map((b) => ({ item: b.stock_item_id, wh: b.warehouse_id, on_hand: Number(b.on_hand), available: Number(b.available) }))}
            canOverride={ctx.can("inventory.approve")}
            showCosts={ctx.can("costing.read")}
          />
        </CardBody>
      </Card>
    </>
  );
}
