import { Lock } from "lucide-react";
import Link from "next/link";
import { ProductionStatusBadge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { TBody, TD, TH, THead, TR, Table } from "@/components/ui/table";
import { getSession, requirePermission } from "@/lib/auth";
import { formatDate, formatQty, relativeTime } from "@/lib/format";

export const metadata = { title: "Material reservations" };

export default async function ReservationsPage() {
  const ctx = await requirePermission("inventory.read");
  const { supabase } = await getSession();
  const { data } = await supabase
    .from("material_reservations")
    .select("id, quantity, updated_at, warehouses(code), stock_item_details(name, code, uom_code, material_id), production_orders(id, number, status, due_date), production_order_materials(quantity_required, quantity_issued)")
    .eq("organization_id", ctx.org.id)
    .eq("status", "active")
    .gt("quantity", 0)
    .order("updated_at", { ascending: false })
    .limit(500);
  return (
    <>
      <PageHeader title="Material reservations" description="Stock held for approved production orders. Reserved stock can't be transferred, adjusted out or issued to other orders. Reservations are released when an order is completed or cancelled." />
      <Card>
        {(data ?? []).length === 0 ? (
          <EmptyState icon={<Lock />} title="No active reservations" description="Approving a production order reserves its materials." />
        ) : (
          <Table>
            <THead>
              <tr>
                <TH>Material</TH>
                <TH>Order</TH>
                <TH>Order status</TH>
                <TH>Warehouse</TH>
                <TH align="right">Reserved</TH>
                <TH align="right">Required / issued</TH>
                <TH>Due</TH>
                <TH>Updated</TH>
              </tr>
            </THead>
            <TBody>
              {(data ?? []).map((r) => {
                const it = r.stock_item_details as unknown as { name: string; code: string; uom_code: string; material_id: string | null };
                const po = r.production_orders as unknown as { id: string; number: string; status: string; due_date: string | null };
                const pm = r.production_order_materials as unknown as { quantity_required: number; quantity_issued: number };
                return (
                  <TR key={r.id}>
                    <TD>
                      {it.material_id ? (
                        <Link href={`/inventory/materials/${it.material_id}`} className="hover:text-accent-ink">
                          {it.name}
                        </Link>
                      ) : (
                        it.name
                      )}
                    </TD>
                    <TD>
                      <Link href={`/operations/production-orders/${po.id}`} className="font-medium text-accent-ink hover:underline">
                        {po.number}
                      </Link>
                    </TD>
                    <TD>
                      <ProductionStatusBadge status={po.status} />
                    </TD>
                    <TD className="text-muted">{(r.warehouses as unknown as { code: string }).code}</TD>
                    <TD align="right" className="font-medium">
                      {formatQty(r.quantity, 4)} {it.uom_code}
                    </TD>
                    <TD align="right" className="text-muted">
                      {formatQty(pm.quantity_required, 2)} / {formatQty(pm.quantity_issued, 2)}
                    </TD>
                    <TD className="text-muted">{formatDate(po.due_date, ctx.settings.date_format)}</TD>
                    <TD className="text-muted">{relativeTime(r.updated_at)}</TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        )}
      </Card>
    </>
  );
}
