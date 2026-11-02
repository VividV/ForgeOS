"use client";
import { z } from "zod";
import { removeWhatsApp, saveWhatsApp } from "@/app/actions/whatsapp";
import { ActionButton } from "@/components/forms/action-button";
import { SchemaForm } from "@/components/forms/schema-form";

export function WhatsAppForm({ defaults, linked }: { defaults: Record<string, unknown>; linked: boolean }) {
  return (
    <SchemaForm
      columns={1}
      schema={z.object({ phone: z.string().trim().min(8, "Enter your WhatsApp number") })}
      defaultValues={defaults}
      fields={[
        { name: "phone", label: "WhatsApp number", type: "tel", placeholder: "+2348012345678", hint: "International format with country code" },
        { name: "alerts", label: "Send me warnings and critical alerts", type: "checkbox" },
        { name: "daily_summary", label: "Send me a daily production summary", type: "checkbox" },
      ]}
      action={saveWhatsApp}
      submitLabel={linked ? "Save" : "Turn on WhatsApp"}
      extra={
        linked ? (
          <ActionButton variant="ghost" action={() => removeWhatsApp()} confirm={{ title: "Turn off WhatsApp messages?" }} confirmLabel="Turn off">
            Turn off
          </ActionButton>
        ) : undefined
      }
    />
  );
}
