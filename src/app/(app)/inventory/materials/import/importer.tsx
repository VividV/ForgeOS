"use client";
import * as React from "react";
import { CsvImporter } from "@/components/import/csv-importer";
import { Field, Select } from "@/components/ui/form";
import { importMaterials } from "@/app/actions/imports";

export function MaterialImporter({ existingCodes, units, warehouses, canStock }: { existingCodes: string[]; units: string[]; warehouses: { value: string; label: string }[]; canStock: boolean }) {
  const [wh, setWh] = React.useState(warehouses[0]?.value ?? "");
  return (
    <CsvImporter
      templateName="forgeos-materials-template.csv"
      existingCodes={existingCodes}
      doneHref="/inventory/materials"
      fields={[
        { key: "code", label: "Code", required: true, kind: "code", aliases: ["material_code", "item_code"], example: "FAB-COT-WHT" },
        { key: "name", label: "Name", required: true, aliases: ["material", "material_name", "description_short"], example: "Cotton fabric (white)" },
        { key: "unit", label: "Unit", required: true, aliases: ["uom", "unit_of_measure", "stock_unit"], allowed: units, example: "m" },
        { key: "category", label: "Category", example: "Fabrics" },
        { key: "kind", label: "Type", allowed: ["raw_material", "consumable", "packaging"], example: "raw_material" },
        { key: "sku", label: "SKU", example: "" },
        { key: "standard_cost", label: "Standard cost", kind: "number", aliases: ["cost", "unit_cost"], example: "1500" },
        { key: "reorder_level", label: "Reorder level", kind: "number", aliases: ["reorder_point"], example: "100" },
        { key: "min_stock", label: "Minimum stock", kind: "number", example: "50" },
        { key: "max_stock", label: "Maximum stock", kind: "number", example: "1000" },
        ...(canStock
          ? [
              { key: "opening_quantity", label: "Opening quantity", kind: "number" as const, aliases: ["quantity", "qty", "stock", "on_hand"], example: "350" },
              { key: "opening_unit_cost", label: "Opening unit cost", kind: "number" as const, example: "1450" },
            ]
          : []),
        { key: "description", label: "Description", example: "" },
      ]}
      extra={
        canStock && (
          <Field label="Put opening stock into" htmlFor="imp-wh" className="max-w-sm">
            <Select id="imp-wh" value={wh} onChange={(e) => setWh(e.target.value)}>
              {warehouses.map((w) => (
                <option key={w.value} value={w.value}>
                  {w.label}
                </option>
              ))}
            </Select>
          </Field>
        )
      }
      onImport={(rows) => importMaterials(rows, canStock ? wh || null : null)}
    />
  );
}
