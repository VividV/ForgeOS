"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { actionContext } from "@/lib/auth";
import { friendlyError, type ActionResult } from "@/lib/errors";
import {
  bomHeaderSchema, bomLineSchema, factorySchema, materialSchema, productSchema, stageSchema, supplierSchema, variantSchema,
  warehouseSchema, workCentreSchema,
} from "@/lib/validation/catalog";
import { parseOrFields } from "@/lib/validation/common";
import type { SupabaseClient } from "@supabase/supabase-js";

type R = ActionResult<{ id?: string; redirect?: string }>;
const err = (e: { code?: string; message?: string }): R => ({ ok: false, error: friendlyError(e) });

async function categoryId(sb: SupabaseClient, table: "product_categories" | "material_categories", org: string, name: string | null) {
  if (!name) return null;
  const { data } = await sb.from(table).select("id").eq("organization_id", org).ilike("name", name).maybeSingle();
  if (data) return data.id as string;
  const { data: created, error } = await sb.from(table).insert({ organization_id: org, name }).select("id").single();
  if (error) throw error;
  return created.id as string;
}

// Factories, work centres, warehouses ---------------------------------------------
export async function createFactory(values: Record<string, unknown>): Promise<R> {
  const p = parseOrFields(factorySchema, values);
  if (!p.ok) return p.error;
  const c = await actionContext("work_centres.manage");
  if ("error" in c) return { ok: false, error: c.error! };
  const { data, error } = await c.supabase.rpc("create_factory", { p_org: c.ctx.org.id, p: { ...p.data, work_centre_count: 0 } });
  if (error) return err(error);
  revalidatePath("/operations/work-centres");
  return { ok: true, data: { id: data as string }, message: "Factory created with its own store" };
}

export async function updateFactory(id: string, values: Record<string, unknown>): Promise<R> {
  const p = parseOrFields(factorySchema, values);
  if (!p.ok) return p.error;
  const c = await actionContext("work_centres.manage");
  if ("error" in c) return { ok: false, error: c.error! };
  const { error } = await c.supabase.from("factories").update(p.data).eq("id", id).eq("organization_id", c.ctx.org.id);
  if (error) return err(error);
  revalidatePath("/operations/work-centres");
  return { ok: true, message: "Factory updated" };
}

export async function saveWorkCentre(id: string | null, values: Record<string, unknown>): Promise<R> {
  const p = parseOrFields(workCentreSchema, values);
  if (!p.ok) return p.error;
  const c = await actionContext("work_centres.manage");
  if ("error" in c) return { ok: false, error: c.error! };
  const q = id
    ? c.supabase.from("work_centres").update(p.data).eq("id", id).eq("organization_id", c.ctx.org.id)
    : c.supabase.from("work_centres").insert({ ...p.data, organization_id: c.ctx.org.id });
  const { error } = await q;
  if (error) return err(error);
  revalidatePath("/operations/work-centres");
  return { ok: true, message: id ? "Work centre updated" : "Work centre added" };
}

export async function setWorkCentreActive(id: string, active: boolean): Promise<R> {
  const c = await actionContext("work_centres.manage");
  if ("error" in c) return { ok: false, error: c.error! };
  const { error } = await c.supabase.from("work_centres").update({ is_active: active }).eq("id", id).eq("organization_id", c.ctx.org.id);
  if (error) return err(error);
  revalidatePath("/operations/work-centres");
  return { ok: true, message: active ? "Work centre activated" : "Work centre deactivated" };
}

export async function saveWarehouse(id: string | null, values: Record<string, unknown>): Promise<R> {
  const p = parseOrFields(warehouseSchema, values);
  if (!p.ok) return p.error;
  const c = await actionContext("warehouses.manage");
  if ("error" in c) return { ok: false, error: c.error! };
  const q = id
    ? c.supabase.from("warehouses").update(p.data).eq("id", id).eq("organization_id", c.ctx.org.id)
    : c.supabase.from("warehouses").insert({ ...p.data, organization_id: c.ctx.org.id });
  const { error } = await q;
  if (error) return err(error);
  revalidatePath("/inventory/warehouses");
  return { ok: true, message: id ? "Warehouse updated" : "Warehouse added" };
}

export async function setWarehouseActive(id: string, active: boolean): Promise<R> {
  const c = await actionContext("warehouses.manage");
  if ("error" in c) return { ok: false, error: c.error! };
  if (!active) {
    const { data } = await c.supabase.from("inventory_balances").select("on_hand").eq("warehouse_id", id).neq("on_hand", 0).limit(1);
    if (data && data.length) return { ok: false, error: "This warehouse still holds stock. Transfer it out before deactivating." };
  }
  const { error } = await c.supabase.from("warehouses").update({ is_active: active }).eq("id", id).eq("organization_id", c.ctx.org.id);
  if (error) return err(error);
  revalidatePath("/inventory/warehouses");
  return { ok: true, message: active ? "Warehouse activated" : "Warehouse deactivated" };
}

// Stages & routing -------------------------------------------------------------------
export async function saveStage(id: string | null, values: Record<string, unknown>): Promise<R> {
  const p = parseOrFields(stageSchema, values);
  if (!p.ok) return p.error;
  const c = await actionContext("routing.manage");
  if ("error" in c) return { ok: false, error: c.error! };
  const q = id
    ? c.supabase.from("production_stages").update(p.data).eq("id", id).eq("organization_id", c.ctx.org.id)
    : c.supabase.from("production_stages").insert({ ...p.data, organization_id: c.ctx.org.id });
  const { error } = await q;
  if (error) return err(error);
  revalidatePath("/operations/stages");
  return { ok: true, message: "Stage saved" };
}

const routingStepsSchema = z.object({
  routing_id: z.uuid(),
  steps: z
    .array(
      z.object({
        stage_id: z.uuid("Choose a stage"),
        name: z.string().trim().min(1, "Name the step").max(80),
        work_centre_id: z.union([z.uuid(), z.literal("")]).optional(),
        standard_minutes_per_unit: z.preprocess((v) => (v === "" || v == null ? undefined : Number(v)), z.number().min(0).optional()),
        instructions: z.string().max(1000).optional(),
        requires_quality_check: z.boolean().optional(),
      }),
    )
    .min(1, "A routing needs at least one step"),
});

export async function saveRoutingSteps(values: unknown): Promise<R> {
  const p = parseOrFields(routingStepsSchema, values);
  if (!p.ok) return p.error;
  const c = await actionContext("routing.manage");
  if ("error" in c) return { ok: false, error: c.error! };
  const org = c.ctx.org.id;
  // Existing orders keep their own operation snapshot, so routing edits are safe.
  const del = await c.supabase.from("routing_steps").delete().eq("routing_id", p.data.routing_id).eq("organization_id", org);
  if (del.error) return err(del.error);
  const { error } = await c.supabase.from("routing_steps").insert(
    p.data.steps.map((s, i) => ({
      organization_id: org,
      routing_id: p.data.routing_id,
      sequence: i + 1,
      stage_id: s.stage_id,
      name: s.name,
      work_centre_id: s.work_centre_id || null,
      standard_minutes_per_unit: s.standard_minutes_per_unit ?? null,
      instructions: s.instructions || null,
      requires_quality_check: s.requires_quality_check ?? false,
    })),
  );
  if (error) return err(error);
  revalidatePath("/operations/stages");
  return { ok: true, message: "Routing saved. New production orders will use these steps." };
}

export async function createRouting(values: Record<string, unknown>): Promise<R> {
  const p = parseOrFields(z.object({ name: z.string().trim().min(2).max(80), copy_from: z.union([z.uuid(), z.literal("")]).optional() }), values);
  if (!p.ok) return p.error;
  const c = await actionContext("routing.manage");
  if ("error" in c) return { ok: false, error: c.error! };
  const { data, error } = await c.supabase.from("routing_templates").insert({ organization_id: c.ctx.org.id, name: p.data.name }).select("id").single();
  if (error) return err(error);
  if (p.data.copy_from) {
    const { data: steps } = await c.supabase.from("routing_steps").select("*").eq("routing_id", p.data.copy_from);
    if (steps?.length) {
      await c.supabase.from("routing_steps").insert(
        steps.map(({ id: _id, created_at: _c, routing_id: _r, ...s }) => ({ ...s, routing_id: data.id })),
      );
    }
  }
  revalidatePath("/operations/stages");
  return { ok: true, message: "Routing created", data: { redirect: `/operations/stages?routing=${data.id}` } };
}

export async function applyStageTemplate(template: string): Promise<R> {
  const c = await actionContext("routing.manage");
  if ("error" in c) return { ok: false, error: c.error! };
  const { error } = await c.supabase.rpc("apply_stage_template", { p_org: c.ctx.org.id, p_template: template });
  if (error) return err(error);
  revalidatePath("/operations/stages");
  return { ok: true, message: "Stage template applied" };
}

// Products ------------------------------------------------------------------------
export async function saveProduct(id: string | null, values: Record<string, unknown>): Promise<R> {
  const p = parseOrFields(productSchema, values);
  if (!p.ok) return p.error;
  const c = await actionContext(id ? "products.update" : "products.create");
  if ("error" in c) return { ok: false, error: c.error! };
  try {
    const { category, ...rest } = p.data;
    const row = { ...rest, category_id: await categoryId(c.supabase, "product_categories", c.ctx.org.id, category) };
    if (id) {
      const { error } = await c.supabase.from("products").update(row).eq("id", id).eq("organization_id", c.ctx.org.id);
      if (error) return err(error);
      revalidatePath(`/commerce/products/${id}`);
      return { ok: true, message: "Product updated", data: { id } };
    }
    const { data, error } = await c.supabase.from("products").insert({ ...row, organization_id: c.ctx.org.id }).select("id").single();
    if (error) return err(error);
    revalidatePath("/commerce/products");
    return { ok: true, message: "Product created", data: { id: data.id, redirect: `/commerce/products/${data.id}` } };
  } catch (e) {
    return err(e as { code?: string });
  }
}

export async function archiveProduct(id: string): Promise<R> {
  const c = await actionContext("products.delete");
  if ("error" in c) return { ok: false, error: c.error! };
  const { error } = await c.supabase.from("products").update({ deleted_at: new Date().toISOString(), status: "discontinued" }).eq("id", id).eq("organization_id", c.ctx.org.id);
  if (error) return err(error);
  revalidatePath("/commerce/products");
  return { ok: true, message: "Product archived", data: { redirect: "/commerce/products" } };
}

export async function saveVariant(productId: string, variantId: string | null, values: Record<string, unknown>): Promise<R> {
  const p = parseOrFields(variantSchema, values);
  if (!p.ok) return p.error;
  const c = await actionContext("products.update", "products.create");
  if ("error" in c) return { ok: false, error: c.error! };
  const q = variantId
    ? c.supabase.from("product_variants").update(p.data).eq("id", variantId).eq("organization_id", c.ctx.org.id)
    : c.supabase.from("product_variants").insert({ ...p.data, product_id: productId, organization_id: c.ctx.org.id });
  const { error } = await q;
  if (error) return err(error);
  revalidatePath(`/commerce/products/${productId}`);
  return { ok: true, message: variantId ? "Variant updated" : "Variant added" };
}

export async function setVariantActive(productId: string, variantId: string, active: boolean): Promise<R> {
  const c = await actionContext("products.update");
  if ("error" in c) return { ok: false, error: c.error! };
  const { error } = await c.supabase.from("product_variants").update({ is_active: active }).eq("id", variantId).eq("is_default", false);
  if (error) return err(error);
  revalidatePath(`/commerce/products/${productId}`);
  return { ok: true, message: active ? "Variant activated" : "Variant deactivated" };
}

// Materials -----------------------------------------------------------------------
export async function saveMaterial(id: string | null, values: Record<string, unknown>): Promise<R> {
  const p = parseOrFields(materialSchema, values);
  if (!p.ok) return p.error;
  const c = await actionContext(id ? "materials.update" : "materials.create");
  if ("error" in c) return { ok: false, error: c.error! };
  try {
    const { category, ...rest } = p.data;
    const row = {
      ...rest,
      purchase_conversion_factor: rest.purchase_conversion_factor ?? 1,
      min_stock: rest.min_stock ?? 0,
      reorder_level: rest.reorder_level ?? 0,
      category_id: await categoryId(c.supabase, "material_categories", c.ctx.org.id, category),
    };
    if (id) {
      const { error } = await c.supabase.from("materials").update(row).eq("id", id).eq("organization_id", c.ctx.org.id);
      if (error) return err(error);
      revalidatePath(`/inventory/materials/${id}`);
      return { ok: true, message: "Material updated", data: { id } };
    }
    const { data, error } = await c.supabase.from("materials").insert({ ...row, organization_id: c.ctx.org.id }).select("id").single();
    if (error) return err(error);
    revalidatePath("/inventory/materials");
    return { ok: true, message: "Material created", data: { id: data.id, redirect: `/inventory/materials/${data.id}` } };
  } catch (e) {
    return err(e as { code?: string });
  }
}

export async function setMaterialActive(id: string, active: boolean): Promise<R> {
  const c = await actionContext("materials.update");
  if ("error" in c) return { ok: false, error: c.error! };
  const { error } = await c.supabase.from("materials").update({ is_active: active }).eq("id", id).eq("organization_id", c.ctx.org.id);
  if (error) return err(error);
  revalidatePath(`/inventory/materials/${id}`);
  return { ok: true, message: active ? "Material activated" : "Material deactivated" };
}

// Suppliers -----------------------------------------------------------------------
export async function saveSupplier(id: string | null, values: Record<string, unknown>): Promise<R> {
  const p = parseOrFields(supplierSchema, values);
  if (!p.ok) return p.error;
  const c = await actionContext("suppliers.manage");
  if ("error" in c) return { ok: false, error: c.error! };
  const q = id
    ? c.supabase.from("suppliers").update(p.data).eq("id", id).eq("organization_id", c.ctx.org.id)
    : c.supabase.from("suppliers").insert({ ...p.data, organization_id: c.ctx.org.id });
  const { error } = await q;
  if (error) return err(error);
  revalidatePath("/commerce/suppliers");
  return { ok: true, message: id ? "Supplier updated" : "Supplier added" };
}

// BOMs ----------------------------------------------------------------------------
export async function createBomVersion(productId: string, variantId: string | null, copyFrom: string | null): Promise<R> {
  const c = await actionContext("bom.create");
  if ("error" in c) return { ok: false, error: c.error! };
  const { data, error } = await c.supabase.rpc("bom_create_version", { p_product: productId, p_variant: variantId, p_copy_from: copyFrom });
  if (error) return err(error);
  revalidatePath(`/commerce/products/${productId}`);
  return { ok: true, message: "Draft BOM created", data: { id: data as string, redirect: `/commerce/boms/${data}` } };
}

export async function updateBomHeader(bomId: string, values: Record<string, unknown>): Promise<R> {
  const p = parseOrFields(bomHeaderSchema, values);
  if (!p.ok) return p.error;
  const c = await actionContext("bom.update");
  if ("error" in c) return { ok: false, error: c.error! };
  const { error } = await c.supabase.from("bills_of_materials").update(p.data).eq("id", bomId).eq("status", "draft");
  if (error) return err(error);
  revalidatePath(`/commerce/boms/${bomId}`);
  return { ok: true, message: "BOM updated" };
}

export async function addBomLine(bomId: string, values: Record<string, unknown>): Promise<R> {
  const p = parseOrFields(bomLineSchema, values);
  if (!p.ok) return p.error;
  const c = await actionContext("bom.update");
  if ("error" in c) return { ok: false, error: c.error! };
  const { data: last } = await c.supabase.from("bom_items").select("line_no").eq("bom_id", bomId).order("line_no", { ascending: false }).limit(1);
  const { error } = await c.supabase.from("bom_items").insert({ ...p.data, bom_id: bomId, organization_id: c.ctx.org.id, line_no: (last?.[0]?.line_no ?? 0) + 1 });
  if (error) return error.code === "23505" ? { ok: false, error: "That material is already on this BOM. Edit its line instead." } : err(error);
  revalidatePath(`/commerce/boms/${bomId}`);
  return { ok: true, message: "Line added" };
}

export async function updateBomLine(bomId: string, lineId: string, values: Record<string, unknown>): Promise<R> {
  const p = parseOrFields(bomLineSchema.omit({ stock_item_id: true }), values);
  if (!p.ok) return p.error;
  const c = await actionContext("bom.update");
  if ("error" in c) return { ok: false, error: c.error! };
  const { error } = await c.supabase.from("bom_items").update(p.data).eq("id", lineId).eq("bom_id", bomId);
  if (error) return err(error);
  revalidatePath(`/commerce/boms/${bomId}`);
  return { ok: true, message: "Line updated" };
}

export async function removeBomLine(bomId: string, lineId: string): Promise<R> {
  const c = await actionContext("bom.update");
  if ("error" in c) return { ok: false, error: c.error! };
  const { error } = await c.supabase.from("bom_items").delete().eq("id", lineId).eq("bom_id", bomId);
  if (error) return err(error);
  revalidatePath(`/commerce/boms/${bomId}`);
  return { ok: true, message: "Line removed" };
}

export async function bomTransition(bomId: string, action: "submit" | "approve" | "reject" | "archive", note?: string): Promise<R> {
  const c = await actionContext(action === "submit" ? "bom.update" : "bom.approve");
  if ("error" in c) return { ok: false, error: c.error! };
  const { error } = await c.supabase.rpc("bom_transition", { p_bom: bomId, p_action: action, p_note: note || null });
  if (error) return err(error);
  revalidatePath(`/commerce/boms/${bomId}`);
  return { ok: true, message: { submit: "Submitted for approval", approve: "BOM approved", reject: "Returned to draft", archive: "BOM archived" }[action] };
}

export async function deleteDraftBom(bomId: string): Promise<R> {
  const c = await actionContext("bom.update");
  if ("error" in c) return { ok: false, error: c.error! };
  const { data } = await c.supabase.from("bills_of_materials").select("product_id").eq("id", bomId).single();
  const { error, count } = await c.supabase.from("bills_of_materials").delete({ count: "exact" }).eq("id", bomId).eq("status", "draft");
  if (error) return err(error);
  if (!count) return { ok: false, error: "Only draft BOMs can be deleted" };
  return { ok: true, message: "Draft deleted", data: { redirect: data ? `/commerce/products/${data.product_id}` : "/commerce/boms" } };
}
