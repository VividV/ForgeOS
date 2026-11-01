"use client";
import { Pencil, Plus } from "lucide-react";
import { FormDialog } from "@/components/forms/form-dialog";
import { saveSupplier } from "@/app/actions/catalog";
import { supplierSchema } from "@/lib/validation/catalog";

export function SupplierDialog({ supplier }: { supplier?: Record<string, unknown> & { id: string; name: string } }) {
  return (
    <FormDialog
      wide
      triggerLabel={supplier ? "" : "Add supplier"}
      triggerIcon={supplier ? <Pencil /> : <Plus />}
      triggerVariant={supplier ? "ghost" : "primary"}
      triggerSize={supplier ? "icon-sm" : "md"}
      title={supplier ? `Edit ${supplier.name}` : "Add supplier"}
      schema={supplierSchema}
      defaultValues={supplier}
      fields={[
        { name: "name", label: "Supplier name", required: true },
        { name: "code", label: "Code", required: true, uppercase: true, placeholder: "SUP-001" },
        { name: "contact_name", label: "Contact person" },
        { name: "phone", label: "Phone", type: "tel" },
        { name: "email", label: "Email", type: "email" },
        { name: "payment_terms", label: "Payment terms", placeholder: "50% upfront, balance on delivery" },
        { name: "lead_time_days", label: "Lead time (days)", type: "number" },
        { name: "address", label: "Address" },
        { name: "notes", label: "Notes", type: "textarea" },
      ]}
      action={(v) => saveSupplier(supplier?.id ?? null, v)}
    />
  );
}
