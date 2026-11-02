"use client";
import { z } from "zod";
import { updateOrganization } from "@/app/actions/platform";
import { SchemaForm } from "@/components/forms/schema-form";

export function OrgAdminForm({ id, defaults }: { id: string; defaults: Record<string, string> }) {
  return (
    <SchemaForm
      schema={z.object({ note: z.string().trim().min(3, "Explain the change") })}
      defaultValues={defaults}
      fields={[
        { name: "plan", label: "Plan", type: "select", options: ["starter", "growth", "professional", "enterprise"].map((v) => ({ value: v, label: v[0].toUpperCase() + v.slice(1) })) },
        { name: "status", label: "Subscription status", type: "select", options: ["trialing", "active", "past_due", "cancelled", "expired", "comped"].map((v) => ({ value: v, label: v.replace("_", " ") })) },
        { name: "trial_ends_at", label: "Trial ends", type: "date" },
        { name: "current_period_end", label: "Paid until", type: "date" },
        { name: "org_status", label: "Access", type: "select", options: [{ value: "active", label: "Active" }, { value: "suspended", label: "Suspended" }] },
        { name: "note", label: "Note", required: true, placeholder: "e.g. Paid by bank transfer, ref 1234" },
      ]}
      action={(v) => updateOrganization(id, v)}
      submitLabel="Save changes"
    />
  );
}
