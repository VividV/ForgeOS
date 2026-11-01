import { notFound, redirect } from "next/navigation";
import { Card, CardBody } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/misc";
import { getSession, requirePermission } from "@/lib/auth";
import { lookups } from "@/lib/services/lookups";
import { purchasableItems } from "@/lib/services/procurement";
import { PurchaseOrderForm } from "../../form";

export const metadata = { title: "Edit purchase order" };

export default async function EditPoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requirePermission("procurement.create");
  const { supabase } = await getSession();
  const { data: po } = await supabase.from("purchase_orders").select("*").eq("id", id).eq("organization_id", ctx.org.id).maybeSingle();
  if (!po) notFound();
  if (!["draft", "pending_approval"].includes(po.status)) redirect(`/commerce/purchase-orders/${id}`);
  const [{ data: lines }, items, o] = await Promise.all([
    supabase.from("purchase_order_items").select("*").eq("purchase_order_id", id).order("line_no"),
    purchasableItems(ctx.org.id),
    lookups(ctx.org.id, ["suppliers", "warehouses"]),
  ]);
  const str = (v: unknown) => (v === null || v === undefined ? "" : String(v));
  return (
    <>
      <PageHeader title={`Edit ${po.number}`} breadcrumb={[{ label: "Purchase orders", href: "/commerce/purchase-orders" }, { label: po.number, href: `/commerce/purchase-orders/${id}` }, { label: "Edit" }]} description="Saving returns the order to draft; it needs approval again." />
      <Card className="max-w-5xl">
        <CardBody>
          <PurchaseOrderForm
            id={id}
            items={items}
            suppliers={o.suppliers}
            warehouses={o.warehouses}
            currency={po.currency}
            header={{ supplier_id: po.supplier_id, warehouse_id: po.warehouse_id, expected_date: str(po.expected_date), payment_terms: str(po.payment_terms), notes: str(po.notes), shipping_cost: str(po.shipping_cost), requisition_id: po.requisition_id ?? undefined }}
            lines={(lines ?? []).map((l) => ({ stock_item_id: l.stock_item_id, quantity: str(l.quantity), unit_price: str(l.unit_price), discount_pct: str(l.discount_pct), tax_pct: str(l.tax_pct), description: str(l.description) }))}
          />
        </CardBody>
      </Card>
    </>
  );
}
