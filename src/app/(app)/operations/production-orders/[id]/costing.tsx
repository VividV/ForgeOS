"use client";
import { Trash2 } from "lucide-react";
import { z } from "zod";
import { addCostEntry, removeCostEntry } from "@/app/actions/costing";
import { ActionButton } from "@/components/forms/action-button";
import { FormDialog } from "@/components/forms/form-dialog";

const hours = z.string().min(1, "Enter hours");

export function CostEntryButtons({
  orderId,
  operations,
  workCentres,
  members,
  labourRate,
}: {
  orderId: string;
  operations: { value: string; label: string }[];
  workCentres: { value: string; label: string }[];
  members: { value: string; label: string }[];
  labourRate: number | null;
}) {
  return (
    <>
      <FormDialog
        triggerLabel="Labour"
        triggerSize="sm"
        title="Record labour"
        description={labourRate != null ? `Leave the rate blank to use the default labour rate (${labourRate}/hour).` : "No default labour rate is set. Enter a rate, or set one under Product costing."}
        schema={z.object({ hours, rate: labourRate == null ? z.string().min(1, "Enter a rate") : z.string().nullish() })}
        fields={[
          { name: "hours", label: "Hours", type: "number", required: true, step: "any", min: "0" },
          { name: "rate", label: "Rate per hour", type: "number", step: "any", min: "0", required: labourRate == null },
          { name: "worker_id", label: "Worker", type: "select", options: members },
          { name: "worker_name", label: "Or worker name (not a user)" },
          { name: "operation_id", label: "Step", type: "select", options: operations },
          { name: "entry_date", label: "Date", type: "date" },
          { name: "notes", label: "Notes", span: 2 },
        ]}
        action={(v) => addCostEntry(orderId, { ...v, entry_type: "labour" })}
      />
      <FormDialog
        triggerLabel="Machine"
        triggerSize="sm"
        title="Record machine time"
        description="Leave the rate blank to use the work centre's hourly cost."
        schema={z.object({ hours, work_centre_id: z.string().min(1, "Choose a work centre") })}
        fields={[
          { name: "work_centre_id", label: "Work centre", type: "select", required: true, options: workCentres },
          { name: "hours", label: "Machine hours", type: "number", required: true, step: "any", min: "0" },
          { name: "rate", label: "Rate per hour (optional)", type: "number", step: "any", min: "0" },
          { name: "operation_id", label: "Step", type: "select", options: operations },
          { name: "entry_date", label: "Date", type: "date" },
          { name: "notes", label: "Notes" },
        ]}
        action={(v) => addCostEntry(orderId, { ...v, entry_type: "machine" })}
      />
      <FormDialog
        triggerLabel="Other cost"
        triggerSize="sm"
        title="Record overhead or other cost"
        description="Direct costs for this order, e.g. packaging, transport, generator diesel."
        schema={z.object({ description: z.string().trim().min(2, "Describe the cost"), amount: z.string().min(1, "Enter an amount") })}
        fields={[
          {
            name: "category",
            label: "Category",
            type: "select",
            required: true,
            options: [
              { value: "packaging", label: "Packaging" },
              { value: "transport", label: "Transport" },
              { value: "utilities", label: "Utilities / power" },
              { value: "overhead", label: "Overhead" },
              { value: "other", label: "Other" },
            ],
          },
          { name: "amount", label: "Amount", type: "number", required: true, step: "any", min: "0" },
          { name: "description", label: "Description", required: true, span: 2 },
        ]}
        defaultValues={{ category: "packaging" }}
        action={(v) => addCostEntry(orderId, { ...v, entry_type: "overhead" })}
      />
    </>
  );
}

export function RemoveCostEntry({ orderId, entryId, kind }: { orderId: string; entryId: string; kind: "labour" | "overhead" }) {
  return (
    <ActionButton size="icon-sm" variant="ghost" aria-label="Remove entry" action={() => removeCostEntry(orderId, entryId, kind)} confirm={{ title: "Remove this cost entry?", description: "The removal is recorded in the audit log." }} confirmLabel="Remove">
      <Trash2 />
    </ActionButton>
  );
}
