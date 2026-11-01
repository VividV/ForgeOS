"use client";
import * as React from "react";
import type { z } from "zod";
import { Button, type ButtonProps } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import type { ActionResult } from "@/lib/errors";
import { SchemaForm, type FieldDef } from "./schema-form";

/** A button that opens a dialog containing a validated form bound to a server action. */
export function FormDialog({
  triggerLabel,
  triggerIcon,
  triggerVariant = "secondary",
  triggerSize = "md",
  title,
  description,
  schema,
  fields,
  defaultValues,
  action,
  submitLabel,
  successMessage,
  wide,
}: {
  triggerLabel: React.ReactNode;
  triggerIcon?: React.ReactNode;
  triggerVariant?: ButtonProps["variant"];
  triggerSize?: ButtonProps["size"];
  title: string;
  description?: string;
  schema: z.ZodType;
  fields: FieldDef[];
  defaultValues?: Record<string, unknown>;
  action: (values: Record<string, unknown>) => Promise<ActionResult<{ id?: string; redirect?: string }>>;
  submitLabel?: string;
  successMessage?: string;
  wide?: boolean;
}) {
  const [open, setOpen] = React.useState(false);
  return (
    <Dialog
      open={open}
      onOpenChange={setOpen}
      title={title}
      description={description}
      className={wide ? "max-w-2xl" : undefined}
      trigger={
        <Button variant={triggerVariant} size={triggerSize}>
          {triggerIcon}
          {triggerLabel}
        </Button>
      }
    >
      {open && (
        <SchemaForm
          schema={schema}
          fields={fields}
          defaultValues={defaultValues}
          action={action}
          submitLabel={submitLabel}
          successMessage={successMessage}
          columns={wide ? 2 : 1}
          onSuccess={() => setOpen(false)}
        />
      )}
    </Dialog>
  );
}
