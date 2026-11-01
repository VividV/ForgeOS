"use client";
import { PackageCheck } from "lucide-react";
import { z } from "zod";
import { confirmDelivery } from "@/app/actions/sales";
import { FormDialog } from "@/components/forms/form-dialog";

export function ConfirmDelivery({ id }: { id: string }) {
  return (
    <FormDialog
      triggerLabel="Confirm delivery"
      triggerIcon={<PackageCheck />}
      triggerVariant="primary"
      title="Confirm delivery"
      description="Record who received the goods. This can't be changed afterwards."
      schema={z.object({ received_by: z.string().trim().min(2, "Enter who received the goods") })}
      fields={[
        { name: "received_by", label: "Received by", required: true, placeholder: "Name of the person who signed" },
        { name: "notes", label: "Notes", type: "textarea", placeholder: "e.g. 2 cartons slightly dented, contents fine" },
      ]}
      action={(v) => confirmDelivery(id, v)}
      submitLabel="Confirm delivery"
    />
  );
}
