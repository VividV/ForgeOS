import { notFound, redirect } from "next/navigation";
import { Card, CardBody } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/misc";
import { getSession, requirePermission } from "@/lib/auth";
import { lookups } from "@/lib/services/lookups";
import { sellableItems } from "@/lib/services/sales";
import { CustomerOrderForm } from "../../form";

export const metadata = { title: "Edit customer order" };

export default async function EditCustomerOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requirePermission("sales_orders.create");
  const { supabase } = await getSession();
  const { data: so } = await supabase.from("sales_orders").select("*").eq("id", id).eq("organization_id", ctx.org.id).maybeSingle();
  if (!so) notFound();
  if (so.status !== "draft") redirect(`/commerce/customer-orders/${id}`);
  const [{ data: lines }, items, o, { data: custs }] = await Promise.all([
    supabase.from("sales_order_items").select("*").eq("sales_order_id", id).order("line_no"),
    sellableItems(ctx.org.id),
    lookups(ctx.org.id, ["warehouses"]),
    supabase.from("customers").select("id, name, code, payment_terms, shipping_address, billing_address").eq("organization_id", ctx.org.id).is("deleted_at", null).order("name"),
  ]);
  const str = (v: unknown) => (v === null || v === undefined ? "" : String(v));
  return (
    <>
      <PageHeader title={`Edit ${so.number}`} breadcrumb={[{ label: "Customer orders", href: "/commerce/customer-orders" }, { label: so.number, href: `/commerce/customer-orders/${id}` }, { label: "Edit" }]} />
      <Card className="max-w-5xl">
        <CardBody>
          <CustomerOrderForm
            id={id}
            items={items}
            customers={(custs ?? []).map((c) => ({ value: c.id, label: `${c.name} (${c.code})`, payment_terms: c.payment_terms, address: c.shipping_address ?? c.billing_address }))}
            warehouses={o.warehouses}
            currency={so.currency}
            defaultTax=""
            header={{ customer_id: so.customer_id, warehouse_id: so.warehouse_id, requested_date: str(so.requested_date), customer_reference: str(so.customer_reference), payment_terms: str(so.payment_terms), shipping_address: str(so.shipping_address), notes: str(so.notes), shipping_charge: str(so.shipping_charge) }}
            lines={(lines ?? []).map((l) => ({ stock_item_id: l.stock_item_id, quantity: str(l.quantity), unit_price: str(l.unit_price), discount_pct: str(l.discount_pct), tax_pct: str(l.tax_pct), description: str(l.description) }))}
          />
        </CardBody>
      </Card>
    </>
  );
}
