import "server-only";
import { getSession } from "@/lib/auth";

/** Sellable product variants with selling price and free stock per warehouse, for the order line editor. */
export async function sellableItems(orgId: string) {
  const { supabase } = await getSession();
  const [{ data: items }, { data: bals }] = await Promise.all([
    supabase.from("stock_item_details").select("id, name, code, uom_code, product_variant_id, product_id").eq("organization_id", orgId).not("product_variant_id", "is", null).eq("is_active", true).order("name"),
    supabase.from("inventory_balances").select("stock_item_id, warehouse_id, available").eq("organization_id", orgId),
  ]);
  const variantIds = (items ?? []).map((i) => i.product_variant_id as string);
  const { data: variants } = variantIds.length
    ? await supabase.from("product_variants").select("id, selling_price, products(selling_price)").in("id", variantIds)
    : { data: [] };
  const price = new Map((variants ?? []).map((v) => [v.id, Number(v.selling_price ?? (v.products as unknown as { selling_price: number | null } | null)?.selling_price ?? 0)]));
  return (items ?? []).map((i) => ({
    value: i.id as string,
    label: `${i.name} (${i.code})`,
    uom: i.uom_code as string,
    price: price.get(i.product_variant_id as string) ?? 0,
    available: Object.fromEntries((bals ?? []).filter((b) => b.stock_item_id === i.id).map((b) => [b.warehouse_id as string, Number(b.available)])),
  }));
}

export type SellableItem = Awaited<ReturnType<typeof sellableItems>>[number];
