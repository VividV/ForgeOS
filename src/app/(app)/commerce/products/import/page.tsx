import { Card, CardBody } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/misc";
import { getSession, requirePermission } from "@/lib/auth";
import { ProductImporter } from "./importer";

export const metadata = { title: "Import products" };

export default async function ImportProductsPage() {
  const ctx = await requirePermission("products.create");
  const { supabase } = await getSession();
  const [{ data: codes }, { data: uoms }] = await Promise.all([
    supabase.from("products").select("code").eq("organization_id", ctx.org.id),
    supabase.from("units_of_measure").select("code").eq("organization_id", ctx.org.id),
  ]);
  return (
    <>
      <PageHeader title="Import products" breadcrumb={[{ label: "Products", href: "/commerce/products" }, { label: "Import" }]} description="Each product gets a standard variant. Add BOMs afterwards from each product's page." />
      <Card>
        <CardBody>
          <ProductImporter existingCodes={(codes ?? []).map((c) => c.code)} units={(uoms ?? []).map((u) => u.code)} />
        </CardBody>
      </Card>
    </>
  );
}
