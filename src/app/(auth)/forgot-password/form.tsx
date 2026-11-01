"use client";
import { z } from "zod";
import { SchemaForm } from "@/components/forms/schema-form";
import { requestPasswordReset } from "@/app/actions/session";

export function ForgotForm() {
  return (
    <SchemaForm
      schema={z.object({ email: z.email("Enter a valid email") })}
      columns={1}
      fields={[{ name: "email", label: "Email", type: "email", required: true, autoFocus: true, autoComplete: "email" }]}
      action={requestPasswordReset}
      submitLabel="Send reset link"
      onSuccess={() => undefined}
    />
  );
}
