"use client";
import { Pencil, Plus } from "lucide-react";
import { z } from "zod";
import { saveCostRate, saveProductEstimate, setCostRateActive } from "@/app/actions/costing";
import { ActionButton } from "@/components/forms/action-button";
import { FormDialog } from "@/components/forms/form-dialog";

type Rate = { id: string; kind: string; name: string; basis: string; rate: string; is_default: boolean };

export function RateButton({ rate }: { rate?: Rate }) {
  return (
    <FormDialog
      triggerLabel={rate ? "" : "Add rate"}
      triggerIcon={rate ? <Pencil /> : <Plus />}
      triggerSize="sm"
      triggerVariant={rate ? "ghost" : "secondary"}
      title={rate ? `Edit ${rate.name}` : "Add cost rate"}
      description="Labour rates are per hour. Overheads can be per labour hour, per unit, a percentage of material cost, or per order. 'Apply automatically' includes the rate in estimates and allocates it on completion."
      schema={z.object({ name: z.string().trim().min(2, "Name the rate"), rate: z.string().min(1, "Enter a rate"), kind: z.string(), basis: z.string() }).refine((v) => v.kind !== "labour" || v.basis === "per_hour", { path: ["basis"], message: "Labour rates are per hour" })}
      fields={[
        { name: "kind", label: "Type", type: "select", required: true, options: [{ value: "labour", label: "Labour" }, { value: "overhead", label: "Overhead" }] },
        { name: "name", label: "Name", required: true, placeholder: "e.g. Tailor rate, Factory rent, Power" },
        {
          name: "basis",
          label: "Applied",
          type: "select",
          required: true,
          options: [
            { value: "per_hour", label: "Per labour hour" },
            { value: "per_unit", label: "Per unit produced" },
            { value: "percent_material", label: "% of material cost" },
            { value: "per_order", label: "Per production order" },
          ],
        },
        { name: "rate", label: "Rate", type: "number", required: true, step: "any", min: "0" },
        { name: "is_default", label: "Default / apply automatically", type: "checkbox" },
      ]}
      defaultValues={rate ?? { kind: "labour", basis: "per_hour", is_default: true }}
      action={(v) => saveCostRate(rate?.id ?? null, v)}
    />
  );
}

export function RateToggle({ id, active }: { id: string; active: boolean }) {
  return (
    <ActionButton size="sm" variant="ghost" action={() => setCostRateActive(id, !active)}>
      {active ? "Deactivate" : "Activate"}
    </ActionButton>
  );
}

export function SaveEstimate({ productId }: { productId: string }) {
  return (
    <ActionButton size="sm" variant="ghost" action={() => saveProductEstimate(productId)} confirm={{ title: "Save as standard cost?", description: "Records today's estimate so you can compare future production against it." }} confirmLabel="Save">
      Save standard
    </ActionButton>
  );
}
