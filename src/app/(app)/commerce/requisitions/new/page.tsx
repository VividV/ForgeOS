import { Card, CardBody } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/misc";
import { getSession, requirePermission } from "@/lib/auth";
import { lookups } from "@/lib/services/lookups";
import { purchasableItems } from "@/lib/services/procurement";
import { RequisitionForm } from "../form";

export const metadata = { title: "New requisition" };

export default async function NewRequisitionPage({ searchParams }: { searchParams: Promise<{ suggest?: string; order?: string }> }) {
  const ctx = await requirePermission("requisitions.create");
  const sp = await searchParams;
  const { supabase } = await getSession();
  const [items, { warehouses }] = await Promise.all([purchasableItems(ctx.org.id), lookups(ctx.org.id, ["warehouses"])]);
  let initial: { stock_item_id: string; quantity: string; notes: string }[] = [];
  let source: "manual" | "reorder" | "production_shortage" = "manual";
  let orderId: string | undefined;
  if (sp.order) {
    // shortages for one production order
    const { data } = await supabase.from("production_order_materials").select("stock_item_id, quantity_required, quantity_reserved, quantity_issued").eq("production_order_id", sp.order);
    initial = (data ?? [])
      .map((m) => ({ stock_item_id: m.stock_item_id, quantity: String(+(Number(m.quantity_required) - Number(m.quantity_reserved) - Number(m.quantity_issued)).toFixed(4)), notes: "" }))
      .filter((l) => Number(l.quantity) > 0);
    source = "production_shortage";
    orderId = sp.order;
  } else if (sp.suggest) {
    const { data } = await supabase.rpc("procurement_suggestions", { p_org: ctx.org.id });
    initial = ((data ?? []) as { stock_item_id: string; suggested: number; production_shortage: number }[]).map((s) => ({
      stock_item_id: s.stock_item_id,
      quantity: String(Math.ceil(Number(s.suggested))),
      notes: Number(s.production_shortage) > 0 ? "Covers production shortage" : "Below reorder level",
    }));
    source = "reorder";
  }
  return (
    <>
      <PageHeader
        title="New purchase requisition"
        breadcrumb={[{ label: "Purchase requisitions", href: "/commerce/requisitions" }, { label: "New" }]}
        description="Request materials. An approver reviews it, then procurement turns it into a purchase order."
      />
      <Card className="max-w-4xl">
        <CardBody>
          <RequisitionForm items={items} warehouses={warehouses} initial={initial} source={source} productionOrderId={orderId} />
        </CardBody>
      </Card>
    </>
  );
}
