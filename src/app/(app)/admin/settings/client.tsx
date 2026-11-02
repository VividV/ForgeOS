"use client";
import { DescriptionList } from "@/components/ui/card";
import { SchemaForm } from "@/components/forms/schema-form";
import { saveConfigurationSettings, saveOrgDetails } from "@/app/actions/settings";
import { BUSINESS_TYPES, COUNTRIES, INDUSTRIES, TIMEZONES, configSchema, orgSettingsSchema } from "@/lib/validation/onboarding";
import { z } from "zod";

export function OrgSettingsForm({ defaults, editable }: { defaults: Record<string, unknown>; editable: boolean }) {
  if (!editable)
    return (
      <DescriptionList
        items={["name", "business_type", "industry", "country", "phone", "email", "website", "address"].map((k) => ({ label: k.replace("_", " "), value: String(defaults[k] ?? "—") }))}
      />
    );
  return (
    <SchemaForm
      schema={orgSettingsSchema}
      defaultValues={defaults}
      fields={[
        { name: "name", label: "Company name", required: true, span: 2 },
        { name: "business_type", label: "Business type", type: "select", options: BUSINESS_TYPES },
        { name: "industry", label: "Industry", type: "select", options: INDUSTRIES },
        { name: "country", label: "Country", type: "select", required: true, options: COUNTRIES },
        { name: "phone", label: "Phone", type: "tel" },
        { name: "email", label: "Company email", type: "email" },
        { name: "website", label: "Website", type: "url" },
        { name: "address", label: "Address", type: "textarea" },
        { name: "tax_id", label: "Tax ID (TIN)", hint: "Printed on tax invoices" },
        { name: "invoice_bank_details", label: "Payment details on invoices", type: "textarea", placeholder: "Bank, account name, account number" },
        { name: "invoice_footer", label: "Invoice footer", type: "textarea", placeholder: "e.g. Thank you for your business. Goods remain our property until paid in full." },
      ]}
      action={saveOrgDetails}
    />
  );
}

export function PrefsForm({ defaults, editable }: { defaults: Record<string, unknown>; editable: boolean }) {
  return (
    <SchemaForm
      schema={configSchema.extend({ timezone: z.string().min(3), allow_negative_stock: z.boolean().optional(), require_final_inspection: z.boolean().optional(), po_approval_threshold: z.string().nullish() })}
      defaultValues={defaults}
      fields={[
        { name: "currency", label: "Currency", type: "select", required: true, disabled: !editable, options: [{ value: "NGN", label: "NGN (₦)" }, { value: "USD", label: "USD ($)" }, { value: "GBP", label: "GBP (£)" }, { value: "EUR", label: "EUR (€)" }], hint: "Changing currency relabels values; it does not convert them." },
        { name: "timezone", label: "Time zone", type: "select", required: true, disabled: !editable, options: TIMEZONES.map((t) => ({ value: t, label: t })) },
        { name: "date_format", label: "Date format", type: "select", required: true, disabled: !editable, options: [{ value: "dd/MM/yyyy", label: "31/12/2026" }, { value: "MM/dd/yyyy", label: "12/31/2026" }, { value: "yyyy-MM-dd", label: "2026-12-31" }] },
        { name: "measurement_system", label: "Measurement", type: "select", required: true, disabled: !editable, options: [{ value: "metric", label: "Metric" }, { value: "imperial", label: "Imperial" }] },
        { name: "fiscal_year_start_month", label: "Fiscal year starts", type: "select", required: true, disabled: !editable, options: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"].map((m, i) => ({ value: String(i + 1), label: m })) },
        { name: "inventory_valuation", label: "Inventory valuation", type: "select", required: true, disabled: !editable, options: [{ value: "weighted_average", label: "Weighted average" }, { value: "fifo", label: "FIFO (coming soon)" }] },
        { name: "costing_method", label: "Costing", type: "select", required: true, disabled: !editable, options: [{ value: "actual", label: "Actual" }, { value: "standard", label: "Standard" }] },
        { name: "require_production_approval", label: "Production orders need approval", type: "checkbox", disabled: !editable },
        { name: "require_final_inspection", label: "Require a final quality inspection before output is stocked", type: "checkbox", disabled: !editable },
        { name: "po_approval_threshold", label: "Auto-approve purchase orders up to", type: "number", min: "0", step: "any", disabled: !editable, hint: "0 means every purchase order needs an approver." },
      ]}
      action={saveConfigurationSettings}
    />
  );
}
