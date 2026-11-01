import "server-only";
import { getSession } from "@/lib/auth";
import type { TemplateOpt } from "@/components/quality/inspection-dialog";

/** Active checklists for an inspection type, optionally narrowed to a product. */
export async function inspectionTemplates(orgId: string, appliesTo: "production" | "goods_receipt", productId?: string | null): Promise<TemplateOpt[]> {
  const { supabase } = await getSession();
  const { data } = await supabase
    .from("quality_templates")
    .select("id, name, product_id, quality_template_items(id, name, check_type, target, required, sequence)")
    .eq("organization_id", orgId)
    .eq("applies_to", appliesTo)
    .eq("is_active", true)
    .order("name");
  return (data ?? [])
    .filter((t) => !t.product_id || !productId || t.product_id === productId)
    .map((t) => ({
      id: t.id,
      name: t.name,
      items: [...((t.quality_template_items as { id: string; name: string; check_type: string; target: string | null; required: boolean; sequence: number }[]) ?? [])].sort((a, b) => a.sequence - b.sequence),
    }));
}
