import { ListChecks, Plus } from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { TBody, TD, TH, THead, TR, Table } from "@/components/ui/table";
import { getSession, requirePermission } from "@/lib/auth";
import { TemplateToggle } from "./toggle";

export const metadata = { title: "Quality checklists" };

export default async function TemplatesPage() {
  const ctx = await requirePermission("quality.read");
  const { supabase } = await getSession();
  const { data } = await supabase.from("quality_templates").select("id, name, applies_to, is_active, production_stages(name), products(name), quality_template_items(count)").eq("organization_id", ctx.org.id).order("is_active", { ascending: false }).order("name");
  const manage = ctx.can("quality.manage");
  return (
    <>
      <PageHeader
        title="Quality checklists"
        breadcrumb={[{ label: "Quality control", href: "/operations/quality" }, { label: "Checklists" }]}
        description="Reusable inspection checklists for production steps and incoming goods."
        actions={
          manage && (
            <Button asChild variant="primary">
              <Link href="/operations/quality/templates/new">
                <Plus /> New checklist
              </Link>
            </Button>
          )
        }
      />
      <Card>
        {(data ?? []).length === 0 ? (
          <EmptyState icon={<ListChecks />} title="No checklists yet" description="e.g. Final garment inspection: stitching, measurements, labels, pressing." />
        ) : (
          <Table>
            <THead>
              <tr>
                <TH>Name</TH>
                <TH>Used for</TH>
                <TH>Stage / product</TH>
                <TH align="right">Checks</TH>
                <TH>Status</TH>
                <TH />
              </tr>
            </THead>
            <TBody>
              {(data ?? []).map((t) => (
                <TR key={t.id}>
                  <TD>
                    {manage ? (
                      <Link className="font-medium hover:text-accent-ink" href={`/operations/quality/templates/${t.id}`}>
                        {t.name}
                      </Link>
                    ) : (
                      <span className="font-medium">{t.name}</span>
                    )}
                  </TD>
                  <TD>{t.applies_to === "production" ? "Production" : "Goods received"}</TD>
                  <TD className="text-muted">{[(t.production_stages as unknown as { name: string } | null)?.name, (t.products as unknown as { name: string } | null)?.name].filter(Boolean).join(" · ") || "Any"}</TD>
                  <TD align="right">{(t.quality_template_items as unknown as { count: number }[])[0]?.count ?? 0}</TD>
                  <TD>{t.is_active ? <Badge tone="success">Active</Badge> : <Badge>Inactive</Badge>}</TD>
                  <TD align="right">{manage && <TemplateToggle id={t.id} active={t.is_active} />}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>
    </>
  );
}
