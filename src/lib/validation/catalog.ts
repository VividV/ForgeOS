import { z } from "zod";
import { code, nonNegative, optNonNegative, optPositive, optText, optUuid, pct, positive, reqText, shortCode, uuid } from "./common";

export const factorySchema = z.object({
  name: reqText("a name", 120),
  address: optText(300),
  capacity_per_day: optNonNegative,
  capacity_unit: optText(30),
  timezone: z.string().min(3).max(60),
  is_active: z.boolean().optional(),
});

export const workCentreSchema = z.object({
  factory_id: uuid("Choose a factory"),
  name: reqText("a name", 120),
  code: shortCode,
  description: optText(300),
  capacity_units_per_hour: optNonNegative,
  hourly_cost: optNonNegative,
});

export const warehouseSchema = z.object({
  name: reqText("a name", 120),
  code: shortCode,
  factory_id: optUuid,
  address: optText(300),
});

export const stageSchema = z.object({
  name: reqText("a name", 80),
  sequence: z.preprocess((v) => (v === "" ? undefined : Number(v)), z.number().int().min(1).max(10000)),
  is_quality_stage: z.boolean().optional(),
});

export const productSchema = z.object({
  code: code("Product code"),
  name: reqText("a product name"),
  sku: optText(64),
  category: optText(80),
  description: optText(2000),
  uom_id: uuid("Choose a unit"),
  standard_minutes_per_unit: optNonNegative,
  target_cost: optNonNegative,
  selling_price: optNonNegative,
  status: z.enum(["draft", "active", "discontinued"]),
});

export const variantSchema = z.object({
  name: reqText("a variant name", 80),
  sku: optText(64),
  size: optText(40),
  colour: optText(40),
  selling_price: optNonNegative,
});

export const materialSchema = z
  .object({
    code: code("Material code"),
    name: reqText("a material name"),
    kind: z.enum(["raw_material", "consumable", "packaging"]),
    category: optText(80),
    sku: optText(64),
    description: optText(2000),
    stock_uom_id: uuid("Choose a stock unit"),
    purchase_uom_id: optUuid,
    purchase_conversion_factor: optPositive,
    standard_cost: optNonNegative,
    preferred_supplier_id: optUuid,
    min_stock: optNonNegative,
    reorder_level: optNonNegative,
    reorder_quantity: optPositive,
    max_stock: optNonNegative,
    default_warehouse_id: optUuid,
    storage_location: optText(80),
  })
  .refine((v) => v.max_stock === undefined || v.max_stock === null || v.max_stock >= (v.reorder_level ?? 0), {
    path: ["max_stock"],
    message: "Maximum stock must be at least the reorder level",
  });

export const supplierSchema = z.object({
  code: shortCode,
  name: reqText("a supplier name"),
  contact_name: optText(120),
  email: z.union([z.email("Enter a valid email"), z.literal("")]).optional().transform((v) => v || null),
  phone: optText(40),
  address: optText(300),
  payment_terms: optText(120),
  lead_time_days: z.preprocess((v) => (v === "" || v == null ? undefined : Number(v)), z.number().int().min(0).max(365).optional()),
  notes: optText(2000),
});

export const bomLineSchema = z.object({
  stock_item_id: uuid("Choose a material"),
  quantity: positive("Quantity must be greater than zero"),
  wastage_pct: pct,
  notes: optText(200),
});

export const bomHeaderSchema = z.object({
  name: optText(120),
  output_quantity: positive(),
  notes: optText(2000),
});

export { nonNegative };
