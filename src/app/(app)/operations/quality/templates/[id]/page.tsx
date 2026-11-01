import { notFound } from "next/navigation";
import { Card, CardBody } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/misc";
import { getSession, requirePermission } from "@/lib/auth";
import { lookups } from "@/lib/services/lookups";
import { TemplateForm, type TemplateValues } from "../form";

export const metadata = { title: "Checklist" };

/** Handles both /templates/new and /templates/[id]. */
export default async function TemplatePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requirePermission("quality.manage");
  const { supabase } = await getSession();
  const isNew = id === "new";
  let initial: TemplateValues = { name: "", applies_to: "production", stage_id: "", product_id: "", description: "", items: [{ name: "", check_type: "pass_fail", target: "", required: true }] };
  if (!isNew) {
    const { data: t } = await supabase.from("quality_templates").select("*, quality_template_items(*)").eq("id", id).eq("organization_id", ctx.org.id).maybeSingle();
    if (!t) notFound();
    const items = [...((t.quality_template_items as { sequence: number; name: string; check_type: TemplateValues["items"][number]["check_type"]; target: string | null; required: boolean }[]) ?? [])].sort((a, b) => a.sequence - b.sequence);
    initial = { name: t.name, applies_to: t.applies_to, stage_id: t.stage_id ?? "", product_id: t.product_id ?? "", description: t.description ?? "", items: items.map((i) => ({ name: i.name, check_type: i.check_type, target: i.target ?? "", required: i.required })) };
  }
  const [{ stages }, { data: products }] = await Promise.all([lookups(ctx.org.id, ["stages"]), supabase.from("products").select("id, name").eq("organization_id", ctx.org.id).is("deleted_at", null).order("name")]);
  return (
    <>
      <PageHeader title={isNew ? "New checklist" : initial.name} breadcrumb={[{ label: "Quality control", href: "/operations/quality" }, { label: "Checklists", href: "/operations/quality/templates" }, { label: isNew ? "New" : initial.name }]} />
      <Card className="max-w-4xl">
        <CardBody>
          <TemplateForm id={isNew ? null : id} initial={initial} stages={stages} products={(products ?? []).map((p) => ({ value: p.id, label: p.name }))} />
        </CardBody>
      </Card>
    </>
  );
}
