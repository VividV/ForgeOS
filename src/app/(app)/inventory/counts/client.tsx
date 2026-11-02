"use client";
import { ClipboardCheck } from "lucide-react";
import { z } from "zod";
import { startStockCount } from "@/app/actions/ops";
import { FormDialog } from "@/components/forms/form-dialog";

export function StartCount({ warehouses }: { warehouses: { value: string; label: string }[] }) {
  return (
    <FormDialog
      triggerLabel="Start a count"
      triggerIcon={<ClipboardCheck />}
      triggerVariant="primary"
      title="Start a stock count"
      description="Creates a count sheet with every item in the warehouse. Avoid moving stock in that warehouse until the count is approved."
      schema={z.object({ warehouse_id: z.string().min(1, "Choose a warehouse") })}
      fields={[
        { name: "warehouse_id", label: "Warehouse", type: "select", required: true, options: warehouses },
        { name: "scope", label: "What to count", type: "select", options: [{ value: "all", label: "Everything" }, { value: "materials", label: "Materials only" }, { value: "finished_goods", label: "Finished goods only" }] },
        { name: "blind", label: "Blind count (counters don't see the system quantity)", type: "checkbox", span: 2 },
        { name: "notes", label: "Notes", type: "textarea", span: 2 },
      ]}
      defaultValues={{ warehouse_id: warehouses[0]?.value ?? "", scope: "all", blind: true }}
      action={startStockCount}
      submitLabel="Create count sheet"
    />
  );
}
