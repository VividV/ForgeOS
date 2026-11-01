import Link from "next/link";
import { Card, CardBody } from "@/components/ui/card";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { getSession, requirePermission } from "@/lib/auth";
import { lookups } from "@/lib/services/lookups";
import { NewOrderForm } from "./form";

export const metadata = { title: "New production order" };

export default async function NewOrderPage({ searchParams }: { searchParams: Promise<{ product?: string; quantity?: string; source?: string }> }) {
  const ctx = await requirePermission("production_orders.create");
  const sp = await searchParams;
  const { supabase } = await getSession();
  const [{ data: products }, opts] = await Promise.all([
    supabase
      .from("products")
      .select("id, code, name, product_variants(id, name, is_default, is_active), bills_of_materials!inner(id, status, variant_id)")
      .eq("organization_id", ctx.org.id)
      .eq("status", "active")
      .is("deleted_at", null)
      .eq("bills_of_materials.status", "approved")
      .order("name"),
    lookups(ctx.org.id, ["factories", "warehouses", "members"]),
  ]);
  const list = (products ?? []).map((p) => ({
    id: p.id,
    label: `${p.name} (${p.code})`,
    variants: ((p.product_variants as { id: string; name: string; is_default: boolean; is_active: boolean }[]) ?? []).filter((v) => v.is_active).sort((a, b) => Number(b.is_default) - Number(a.is_default)),
  }));

  return (
    <>
      <PageHeader
        title="New production order"
        breadcrumb={[{ label: "Production orders", href: "/operations/production-orders" }, { label: "New" }]}
        description="Material requirements and production steps are copied from the approved BOM and routing when the order is created."
      />
      <Card className="max-w-3xl">
        <CardBody>
          {list.length === 0 ? (
            <EmptyState
              title="No products are ready for production"
              description="A product needs an approved bill of materials before it can be produced."
              action={
                <Link href="/commerce/products" className="text-[13px] font-medium text-accent-ink hover:underline">
                  Go to products
                </Link>
              }
            />
          ) : opts.factories.length === 0 ? (
            <EmptyState title="Add a factory first" action={<Link href="/operations/work-centres" className="text-[13px] font-medium text-accent-ink hover:underline">Factories</Link>} />
          ) : (
            <NewOrderForm
              products={list}
              factories={opts.factories}
              warehouses={opts.warehouses}
              members={opts.members}
              defaults={{ product_id: sp.product ?? "", quantity: sp.quantity ?? "", source: sp.source === "replenishment" ? "replenishment" : "manual" }}
              requireApproval={ctx.settings.require_production_approval}
              canApprove={ctx.can("production_orders.approve")}
            />
          )}
        </CardBody>
      </Card>
    </>
  );
}
