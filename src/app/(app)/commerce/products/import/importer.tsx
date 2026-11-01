"use client";
import { CsvImporter } from "@/components/import/csv-importer";
import { importProducts } from "@/app/actions/imports";

export function ProductImporter({ existingCodes, units }: { existingCodes: string[]; units: string[] }) {
  return (
    <CsvImporter
      templateName="forgeos-products-template.csv"
      existingCodes={existingCodes}
      doneHref="/commerce/products"
      fields={[
        { key: "code", label: "Code", required: true, kind: "code", aliases: ["product_code", "style", "style_code"], example: "SHIRT-M" },
        { key: "name", label: "Name", required: true, aliases: ["product", "product_name"], example: "Men's Cotton Shirt" },
        { key: "unit", label: "Unit", aliases: ["uom"], allowed: units, example: "pcs" },
        { key: "category", label: "Category", example: "Shirts" },
        { key: "sku", label: "SKU", example: "" },
        { key: "selling_price", label: "Selling price", kind: "number", aliases: ["price"], example: "15000" },
        { key: "target_cost", label: "Target cost", kind: "number", example: "6000" },
        { key: "standard_minutes_per_unit", label: "Std. minutes / unit", kind: "number", aliases: ["minutes", "sam"], example: "35" },
        { key: "description", label: "Description", example: "" },
      ]}
      onImport={(rows) => importProducts(rows)}
    />
  );
}
