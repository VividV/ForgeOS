import { Card, CardBody } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/misc";
import { requirePermission } from "@/lib/auth";
import { lookups } from "@/lib/services/lookups";
import { MaterialForm } from "../material-form";

export const metadata = { title: "New material" };

export default async function NewMaterialPage() {
  const ctx = await requirePermission("materials.create");
  const o = await lookups(ctx.org.id, ["uoms", "suppliers", "warehouses"]);
  return (
    <>
      <PageHeader title="New material" breadcrumb={[{ label: "Raw materials", href: "/inventory/materials" }, { label: "New" }]} description="After creating it, record its opening balance or receive stock from the material page." />
      <Card className="max-w-3xl">
        <CardBody>
          <MaterialForm uoms={o.uoms} suppliers={o.suppliers} warehouses={o.warehouses} showCosts={ctx.can("costing.read")} />
        </CardBody>
      </Card>
    </>
  );
}
