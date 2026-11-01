import "server-only";
import { getSession } from "@/lib/auth";

/** Purchasable materials with current availability, for line editors. */
export async function purchasableItems(orgId: string) {
  const { supabase } = await getSession();
  const { data } = await supabase
    .from("stock_levels")
    .select("stock_item_id, code, name, uom_code, available, average_cost")
    .eq("organization_id", orgId)
    .not("material_id", "is", null)
    .eq("is_active", true)
    .order("name");
  return (data ?? []).map((m) => ({
    value: m.stock_item_id as string,
    label: `${m.name} (${m.code})`,
    uom: m.uom_code as string,
    available: Number(m.available),
    cost: Number(m.average_cost),
  }));
}
