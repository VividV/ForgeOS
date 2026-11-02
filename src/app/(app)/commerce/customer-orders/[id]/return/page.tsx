import { notFound } from "next/navigation";
import { Card, CardBody } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/misc";
import { getSession, requirePermission } from "@/lib/auth";
import { lookups } from "@/lib/services/lookups";
import { ReturnForm } from "./form";

export const metadata = { title: "Record return" };

export default async function ReturnPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requirePermission("sales_orders.dispatch");
  const { supabase } = await getSession();
  const { data: so } = await supabase.from("sales_orders").select("id, number, warehouse_id, customers(name)").eq("id", id).eq("organization_id", ctx.org.id).maybeSingle();
  if (!so) notFound();
  const [{ data }, { warehouses }] = await Promise.all([supabase.rpc("sales_order_lines", { p_so: id }), lookups(ctx.org.id, ["warehouses"])]);
  const lines = ((data ?? []) as { id: string; name: string; code: string; uom_code: string; dispatched: number; returned: number }[])
    .filter((l) => Number(l.dispatched) > Number(l.returned))
    .map((l) => ({ id: l.id, name: `${l.name} (${l.code})`, uom: l.uom_code, returnable: Number(l.dispatched) - Number(l.returned) }));
  return (
    <>
      <PageHeader
        title={`Return · ${so.number}`}
        breadcrumb={[{ label: "Customer orders", href: "/commerce/customer-orders" }, { label: so.number, href: `/commerce/customer-orders/${id}` }, { label: "Return" }]}
        description={`Goods coming back from ${(so.customers as unknown as { name: string }).name}. Good items go back into stock at the cost they left at; damaged items are recorded but not restocked.`}
      />
      <Card className="max-w-4xl">
        <CardBody>
          <ReturnForm orderId={so.id} lines={lines} warehouses={warehouses} defaultWarehouse={so.warehouse_id} canCredit={ctx.can("sales_orders.manage")} />
        </CardBody>
      </Card>
    </>
  );
}
