import { Card, CardBody } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/misc";
import { getSession, requirePermission } from "@/lib/auth";
import { lookups } from "@/lib/services/lookups";
import { MaterialImporter } from "./importer";

export const metadata = { title: "Import materials" };

export default async function ImportMaterialsPage() {
  const ctx = await requirePermission("materials.create");
  const { supabase } = await getSession();
  const [{ data: codes }, { data: uoms }, { warehouses }] = await Promise.all([
    supabase.from("materials").select("code").eq("organization_id", ctx.org.id),
    supabase.from("units_of_measure").select("code").eq("organization_id", ctx.org.id),
    lookups(ctx.org.id, ["warehouses"]),
  ]);
  return (
    <>
      <PageHeader
        title="Import raw materials"
        breadcrumb={[{ label: "Raw materials", href: "/inventory/materials" }, { label: "Import" }]}
        description="Bring materials across from a spreadsheet. Opening quantities are recorded as opening-balance stock movements (not as goods received), so your ledger shows where they came from."
      />
      <Card>
        <CardBody>
          <MaterialImporter existingCodes={(codes ?? []).map((c) => c.code)} units={(uoms ?? []).map((u) => u.code)} warehouses={warehouses} canStock={ctx.can("inventory.create")} />
        </CardBody>
      </Card>
    </>
  );
}
