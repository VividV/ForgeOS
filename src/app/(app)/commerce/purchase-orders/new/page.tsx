import Link from "next/link";
import { Card, CardBody } from "@/components/ui/card";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { getSession, requirePermission } from "@/lib/auth";
import { lookups } from "@/lib/services/lookups";
import { purchasableItems } from "@/lib/services/procurement";
import { PurchaseOrderForm, type PoLine } from "../form";

export const metadata = { title: "New purchase order" };

export default async function NewPoPage({ searchParams }: { searchParams: Promise<{ requisition?: string; supplier?: string }> }) {
  const ctx = await requirePermission("procurement.create");
  const sp = await searchParams;
  const { supabase } = await getSession();
  const [items, o] = await Promise.all([purchasableItems(ctx.org.id), lookups(ctx.org.id, ["suppliers", "warehouses"])]);
  let lines: PoLine[] = [];
  let warehouse = o.warehouses[0]?.value ?? "";
  let supplier = sp.supplier ?? "";
  let notes = "";
  if (sp.requisition) {
    const { data: r } = await supabase.from("purchase_requisitions").select("number, warehouse_id, status").eq("id", sp.requisition).single();
    const { data: ri } = await supabase.from("purchase_requisition_items").select("id, stock_item_id, quantity, purchase_order_item_id, stock_items(materials(preferred_supplier_id))").eq("requisition_id", sp.requisition);
    lines = (ri ?? [])
      .filter((x) => !x.purchase_order_item_id)
      .map((x) => ({
        stock_item_id: x.stock_item_id,
        quantity: String(x.quantity),
        unit_price: String(items.find((i) => i.value === x.stock_item_id)?.cost || ""),
        discount_pct: "",
        tax_pct: "",
        description: "",
        requisition_item_id: x.id,
      }));
    warehouse = r?.warehouse_id ?? warehouse;
    supplier = supplier || ((ri?.[0]?.stock_items as unknown as { materials: { preferred_supplier_id: string | null } } | null)?.materials?.preferred_supplier_id ?? "");
    notes = r ? `Ref: requisition ${r.number}` : "";
  }
  return (
    <>
      <PageHeader title="New purchase order" breadcrumb={[{ label: "Purchase orders", href: "/commerce/purchase-orders" }, { label: "New" }]} />
      <Card className="max-w-5xl">
        <CardBody>
          {o.suppliers.length === 0 ? (
            <EmptyState title="Add a supplier first" action={<Link href="/commerce/suppliers" className="text-[13px] font-medium text-accent-ink hover:underline">Suppliers</Link>} />
          ) : (
            <PurchaseOrderForm
              id={null}
              items={items}
              suppliers={o.suppliers}
              warehouses={o.warehouses}
              currency={ctx.settings.currency}
              header={{ supplier_id: supplier, warehouse_id: warehouse, expected_date: "", payment_terms: "", notes, shipping_cost: "", requisition_id: sp.requisition }}
              lines={lines}
            />
          )}
        </CardBody>
      </Card>
    </>
  );
}
