"use client";
import { SchemaForm } from "@/components/forms/schema-form";
import { saveProduct } from "@/app/actions/catalog";
import { productSchema } from "@/lib/validation/catalog";

export function ProductForm({
  product,
  uoms,
  showCosts,
}: {
  product?: Record<string, unknown> & { id: string };
  uoms: { value: string; label: string }[];
  showCosts: boolean;
}) {
  return (
    <SchemaForm
      schema={productSchema}
      defaultValues={product ?? { status: "active", uom_id: uoms.find((u) => u.label.includes("(pcs)"))?.value }}
      fields={[
        { name: "name", label: "Product name", required: true, autoFocus: !product, placeholder: "Men's Cotton Shirt" },
        { name: "code", label: "Product code", required: true, uppercase: true, placeholder: "SHIRT-M" },
        { name: "sku", label: "SKU" },
        { name: "category", label: "Category", placeholder: "e.g. Shirts" },
        { name: "uom_id", label: "Unit", type: "select", required: true, options: uoms },
        { name: "status", label: "Status", type: "select", required: true, options: [{ value: "active", label: "Active" }, { value: "draft", label: "Draft" }, { value: "discontinued", label: "Discontinued" }] },
        { name: "standard_minutes_per_unit", label: "Standard production time (minutes per unit)", type: "number" },
        { name: "selling_price", label: "Selling price", type: "number" },
        ...(showCosts ? [{ name: "target_cost", label: "Target cost per unit", type: "number" as const }] : []),
        { name: "description", label: "Description / specification", type: "textarea" },
      ]}
      action={(v) => saveProduct(product?.id ?? null, v)}
      submitLabel={product ? "Save changes" : "Create product"}
      cancelHref={product ? undefined : "/commerce/products"}
    />
  );
}
