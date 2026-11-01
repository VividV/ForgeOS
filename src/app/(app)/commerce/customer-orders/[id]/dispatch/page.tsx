import { notFound, redirect } from "next/navigation";
import { Card, CardBody } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/misc";
import { getSession, requirePermission } from "@/lib/auth";
import { DispatchForm } from "./form";

export const metadata = { title: "Dispatch goods" };

export default async function DispatchPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requirePermission("sales_orders.dispatch");
  const { supabase } = await getSession();
  const { data: so } = await supabase.from("sales_orders").select("id, number, status, shipping_address, customers(name), warehouses(name)").eq("id", id).eq("organization_id", ctx.org.id).maybeSingle();
  if (!so) notFound();
  if (!["confirmed", "partially_dispatched"].includes(so.status)) redirect(`/commerce/customer-orders/${id}`);
  const { data } = await supabase.rpc("sales_order_lines", { p_so: id });
  const lines = ((data ?? []) as { id: string; name: string; code: string; uom_code: string; quantity: number; dispatched: number; allocated: number; available: number }[])
    .filter((l) => Number(l.quantity) > Number(l.dispatched))
    .map((l) => ({ id: l.id, name: `${l.name} (${l.code})`, uom: l.uom_code, outstanding: Number(l.quantity) - Number(l.dispatched), allocated: Number(l.allocated), free: Math.max(Number(l.available), 0) }));
  return (
    <>
      <PageHeader
        title={`Dispatch · ${so.number}`}
        breadcrumb={[{ label: "Customer orders", href: "/commerce/customer-orders" }, { label: so.number, href: `/commerce/customer-orders/${id}` }, { label: "Dispatch" }]}
        description={`To ${(so.customers as unknown as { name: string }).name} from ${(so.warehouses as unknown as { name: string }).name}. Goods held for this order go first; you can also send other free stock.`}
      />
      <Card className="max-w-4xl">
        <CardBody>
          <DispatchForm orderId={so.id} lines={lines} address={so.shipping_address} />
        </CardBody>
      </Card>
    </>
  );
}
