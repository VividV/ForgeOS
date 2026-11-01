import { Card, CardBody } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/misc";
import { requirePermission } from "@/lib/auth";
import { lookups } from "@/lib/services/lookups";
import { ProductForm } from "../product-form";

export const metadata = { title: "New product" };

export default async function NewProductPage() {
  const ctx = await requirePermission("products.create");
  const { uoms } = await lookups(ctx.org.id, ["uoms"]);
  return (
    <>
      <PageHeader title="New product" breadcrumb={[{ label: "Products", href: "/commerce/products" }, { label: "New" }]} description="A standard variant is created automatically. Add sizes and colours as variants afterwards." />
      <Card className="max-w-3xl">
        <CardBody>
          <ProductForm uoms={uoms} showCosts={ctx.can("costing.read")} />
        </CardBody>
      </Card>
    </>
  );
}
