import Link from "next/link";
import { Card, CardBody } from "@/components/ui/card";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { getSession, requirePermission } from "@/lib/auth";
import { lookups } from "@/lib/services/lookups";
import { sellableItems } from "@/lib/services/sales";
import { CustomerOrderForm } from "../form";

export const metadata = { title: "New customer order" };

export default async function NewCustomerOrderPage({ searchParams }: { searchParams: Promise<{ customer?: string }> }) {
  const ctx = await requirePermission("sales_orders.create");
  const sp = await searchParams;
  const { supabase } = await getSession();
  const [items, o, { data: custs }] = await Promise.all([
    sellableItems(ctx.org.id),
    lookups(ctx.org.id, ["warehouses"]),
    supabase.from("customers").select("id, name, code, payment_terms, shipping_address, billing_address").eq("organization_id", ctx.org.id).is("deleted_at", null).eq("is_active", true).order("name"),
  ]);
  const customers = (custs ?? []).map((c) => ({ value: c.id, label: `${c.name} (${c.code})`, payment_terms: c.payment_terms, address: c.shipping_address ?? c.billing_address }));
  const pre = customers.find((c) => c.value === sp.customer);
  return (
    <>
      <PageHeader title="New customer order" breadcrumb={[{ label: "Customer orders", href: "/commerce/customer-orders" }, { label: "New" }]} />
      <Card className="max-w-5xl">
        <CardBody>
          {customers.length === 0 ? (
            <EmptyState title="Add a customer first" action={<Link className="text-[13px] font-medium text-accent-ink hover:underline" href="/commerce/customers">Customers</Link>} />
          ) : items.length === 0 ? (
            <EmptyState title="Add a product first" action={<Link className="text-[13px] font-medium text-accent-ink hover:underline" href="/commerce/products/new">New product</Link>} />
          ) : (
            <CustomerOrderForm
              id={null}
              items={items}
              customers={customers}
              warehouses={o.warehouses}
              currency={ctx.settings.currency}
              defaultTax=""
              header={{ customer_id: pre?.value ?? "", warehouse_id: o.warehouses[0]?.value ?? "", requested_date: "", customer_reference: "", payment_terms: pre?.payment_terms ?? "", shipping_address: pre?.address ?? "", notes: "", shipping_charge: "" }}
              lines={[]}
            />
          )}
        </CardBody>
      </Card>
    </>
  );
}
