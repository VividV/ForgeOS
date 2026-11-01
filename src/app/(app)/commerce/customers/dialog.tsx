"use client";
import { Pencil, Plus } from "lucide-react";
import { FormDialog } from "@/components/forms/form-dialog";
import { saveCustomer } from "@/app/actions/sales";
import { customerSchema } from "@/lib/validation/sales";

export function CustomerDialog({ customer }: { customer?: Record<string, unknown> & { id: string; name: string } }) {
  return (
    <FormDialog
      wide
      triggerLabel={customer ? "Edit" : "Add customer"}
      triggerIcon={customer ? <Pencil /> : <Plus />}
      triggerVariant={customer ? "secondary" : "primary"}
      title={customer ? `Edit ${customer.name}` : "Add customer"}
      schema={customerSchema}
      defaultValues={customer ? { ...customer, credit_limit: customer.credit_limit == null ? "" : String(customer.credit_limit) } : { customer_type: "business" }}
      fields={[
        { name: "name", label: "Customer name", required: true },
        { name: "code", label: "Code", required: true, uppercase: true, placeholder: "CUS-001" },
        {
          name: "customer_type",
          label: "Type",
          type: "select",
          options: [
            { value: "business", label: "Business" },
            { value: "retailer", label: "Retailer / boutique" },
            { value: "distributor", label: "Distributor" },
            { value: "individual", label: "Individual" },
          ],
        },
        { name: "contact_name", label: "Contact person" },
        { name: "phone", label: "Phone", type: "tel" },
        { name: "email", label: "Email", type: "email" },
        { name: "billing_address", label: "Billing address", type: "textarea" },
        { name: "shipping_address", label: "Delivery address", type: "textarea", hint: "Leave blank to use the billing address" },
        { name: "payment_terms", label: "Payment terms", placeholder: "e.g. 50% deposit, balance before dispatch" },
        { name: "credit_limit", label: "Credit limit", type: "number", min: "0", step: "any" },
        { name: "tax_id", label: "Tax ID (TIN)" },
        { name: "notes", label: "Notes", type: "textarea" },
      ]}
      action={(v) => saveCustomer(customer?.id ?? null, v)}
    />
  );
}
