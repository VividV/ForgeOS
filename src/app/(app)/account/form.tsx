"use client";
import { z } from "zod";
import { SchemaForm } from "@/components/forms/schema-form";
import { updatePassword, updateProfile } from "@/app/actions/session";

export function ProfileForm({ defaults }: { defaults: Record<string, unknown> }) {
  return (
    <SchemaForm
      schema={z.object({ full_name: z.string().trim().min(2, "Enter your name") })}
      columns={1}
      defaultValues={defaults}
      fields={[
        { name: "full_name", label: "Full name", required: true },
        { name: "phone", label: "Phone", type: "tel" },
      ]}
      action={updateProfile}
    />
  );
}

export function PasswordForm() {
  return (
    <SchemaForm
      schema={z.object({ password: z.string().min(10, "Use at least 10 characters").regex(/[A-Za-z]/, "Include a letter").regex(/[0-9]/, "Include a number") })}
      columns={1}
      fields={[{ name: "password", label: "New password", type: "password", required: true, autoComplete: "new-password", hint: "At least 10 characters, with a letter and a number." }]}
      action={updatePassword}
      submitLabel="Update password"
    />
  );
}
