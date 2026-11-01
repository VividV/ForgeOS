"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { actionContext } from "@/lib/auth";
import { friendlyError, type ActionResult } from "@/lib/errors";

const rowsSchema = z.array(z.record(z.string(), z.string().max(2000))).min(1).max(5000);

export async function importMaterials(rows: unknown, warehouseId: string | null): Promise<ActionResult<{ created?: number; opening_balances?: number }>> {
  const p = rowsSchema.safeParse(rows);
  if (!p.success) return { ok: false, error: "The file couldn't be read. Check it has at most 5,000 rows." };
  if (warehouseId && !z.uuid().safeParse(warehouseId).success) return { ok: false, error: "Invalid warehouse" };
  const c = await actionContext("materials.create");
  if ("error" in c) return { ok: false, error: c.error! };
  const { data, error } = await c.supabase.rpc("import_materials", { p_org: c.ctx.org.id, p_rows: p.data, p_warehouse: warehouseId });
  if (error) return { ok: false, error: friendlyError(error) };
  revalidatePath("/inventory", "layout");
  const d = data as { created: number; opening_balances: number };
  return { ok: true, data: d, message: `Imported ${d.created} materials${d.opening_balances ? `, ${d.opening_balances} with opening stock` : ""}` };
}

export async function importProducts(rows: unknown): Promise<ActionResult<{ created?: number }>> {
  const p = rowsSchema.safeParse(rows);
  if (!p.success) return { ok: false, error: "The file couldn't be read. Check it has at most 5,000 rows." };
  const c = await actionContext("products.create");
  if ("error" in c) return { ok: false, error: c.error! };
  const { data, error } = await c.supabase.rpc("import_products", { p_org: c.ctx.org.id, p_rows: p.data });
  if (error) return { ok: false, error: friendlyError(error) };
  revalidatePath("/commerce/products");
  const d = data as { created: number };
  return { ok: true, data: d, message: `Imported ${d.created} products` };
}
