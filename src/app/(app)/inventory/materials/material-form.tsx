"use client";
import { SchemaForm } from "@/components/forms/schema-form";
import { saveMaterial } from "@/app/actions/catalog";
import { materialSchema } from "@/lib/validation/catalog";

type Opt = { value: string; label: string }[];

export function MaterialForm({
  material,
  uoms,
  suppliers,
  warehouses,
  showCosts,
  unitLocked,
}: {
  material?: Record<string, unknown> & { id: string };
  uoms: Opt;
  suppliers: Opt;
  warehouses: Opt;
  showCosts: boolean;
  unitLocked?: boolean;
}) {
  return (
    <SchemaForm
      schema={materialSchema}
      defaultValues={material ?? { kind: "raw_material", purchase_conversion_factor: 1 }}
      fields={[
        { name: "name", label: "Material name", required: true, autoFocus: !material, placeholder: "Cotton fabric (white)" },
        { name: "code", label: "Material code", required: true, uppercase: true, placeholder: "FAB-COT-WHT" },
        { name: "kind", label: "Type", type: "select", required: true, options: [{ value: "raw_material", label: "Raw material" }, { value: "consumable", label: "Consumable" }, { value: "packaging", label: "Packaging" }] },
        { name: "category", label: "Category", placeholder: "e.g. Fabrics" },
        { name: "sku", label: "SKU / supplier reference" },
        { name: "stock_uom_id", label: "Stock unit", type: "select", required: true, options: uoms, disabled: unitLocked, hint: unitLocked ? "Locked because stock has moved." : "The unit you count and issue in." },
        { name: "purchase_uom_id", label: "Purchase unit", type: "select", options: uoms, hint: "Optional, e.g. rolls." },
        { name: "purchase_conversion_factor", label: "Stock units per purchase unit", type: "number", hint: "e.g. 1 roll = 50 m → 50" },
        ...(showCosts ? [{ name: "standard_cost", label: "Standard cost per stock unit", type: "number" as const, hint: "Used for estimates until stock is received at actual cost." }] : []),
        { name: "preferred_supplier_id", label: "Preferred supplier", type: "select", options: suppliers },
        { name: "min_stock", label: "Minimum stock", type: "number" },
        { name: "reorder_level", label: "Reorder level", type: "number", hint: "Alert when available stock falls to this level." },
        { name: "reorder_quantity", label: "Reorder quantity", type: "number" },
        { name: "max_stock", label: "Maximum stock", type: "number" },
        { name: "default_warehouse_id", label: "Default warehouse", type: "select", options: warehouses },
        { name: "storage_location", label: "Storage location / bin", placeholder: "Rack A3" },
        { name: "description", label: "Description", type: "textarea" },
      ]}
      action={(v) => saveMaterial(material?.id ?? null, unitLocked && material ? { ...v, stock_uom_id: material.stock_uom_id } : v)}
      submitLabel={material ? "Save changes" : "Create material"}
      cancelHref={material ? undefined : "/inventory/materials"}
    />
  );
}
