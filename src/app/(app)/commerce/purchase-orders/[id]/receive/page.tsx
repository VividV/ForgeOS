import { notFound, redirect } from "next/navigation";
import { Card, CardBody } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/misc";
import { getSession, requirePermission } from "@/lib/auth";
import { lookups } from "@/lib/services/lookups";
import { ReceiveForm } from "./form";

export const metadata = { title: "Receive goods" };

export default async function ReceivePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requirePermission("procurement.create");
  if (!ctx.can("inventory.create")) redirect("/forbidden");
  const { supabase } = await getSession();
  const { data: po } = await supabase.from("purchase_orders").select("id, number, status, warehouse_id, suppliers(name)").eq("id", id).eq("organization_id", ctx.org.id).maybeSingle();
  if (!po) notFound();
  if (!["approved", "sent", "partially_received"].includes(po.status)) redirect(`/commerce/purchase-orders/${id}`);
  const [{ data: lines }, { warehouses }] = await Promise.all([
    supabase.from("purchase_order_items").select("id, line_no, quantity, quantity_received, quantity_rejected, stock_item_details(name, code, uom_code)").eq("purchase_order_id", id).order("line_no"),
    lookups(ctx.org.id, ["warehouses"]),
  ]);
  return (
    <>
      <PageHeader
        title={`Receive goods · ${po.number}`}
        breadcrumb={[{ label: "Purchase orders", href: "/commerce/purchase-orders" }, { label: po.number, href: `/commerce/purchase-orders/${id}` }, { label: "Receive" }]}
        description={`From ${(po.suppliers as unknown as { name: string }).name}. Count what arrived, reject anything damaged or wrong. Only accepted quantities go into stock.`}
      />
      <Card className="max-w-5xl">
        <CardBody>
          <ReceiveForm
            poId={po.id}
            defaultWarehouse={po.warehouse_id}
            warehouses={warehouses}
            lines={(lines ?? []).map((l) => {
              const d = l.stock_item_details as unknown as { name: string; code: string; uom_code: string };
              return { id: l.id, name: `${d.name} (${d.code})`, uom: d.uom_code, outstanding: Math.max(Number(l.quantity) - (Number(l.quantity_received) - Number(l.quantity_rejected)), 0), ordered: Number(l.quantity) };
            })}
          />
        </CardBody>
      </Card>
    </>
  );
}
