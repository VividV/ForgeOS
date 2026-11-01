"use client";
import { DescriptionList } from "@/components/ui/card";
import { SchemaForm } from "@/components/forms/schema-form";
import { saveConfigurationSettings, saveOrgDetails } from "@/app/actions/settings";
import { BUSINESS_TYPES, COUNTRIES, INDUSTRIES, TIMEZONES, configSchema, orgSchema } from "@/lib/validation/onboarding";
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
      schema={orgSchema}
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
      ]}
      action={saveOrgDetails}
    />
  );
}

export function PrefsForm({ defaults, editable }: { defaults: Record<string, unknown>; editable: boolean }) {
  return (
    <SchemaForm
      schema={configSchema.extend({ timezone: z.string().min(3), allow_negative_stock: z.boolean().optional() })}
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
      ]}
      action={saveConfigurationSettings}
    />
  );
}
