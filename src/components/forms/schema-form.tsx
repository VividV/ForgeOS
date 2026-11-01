"use client";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import * as React from "react";
import { useForm, type Resolver } from "react-hook-form";
import { toast } from "sonner";
import type { z } from "zod";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, FormError, Input, Select, Textarea } from "@/components/ui/form";
import type { ActionResult } from "@/lib/errors";
import { cn } from "@/lib/utils";

export type FieldDef = {
  name: string;
  label: string;
  type?: "text" | "number" | "email" | "date" | "time" | "textarea" | "select" | "checkbox" | "password" | "url" | "tel";
  options?: { value: string; label: string }[];
  placeholder?: string;
  hint?: React.ReactNode;
  required?: boolean;
  span?: 1 | 2;
  step?: string;
  min?: string;
  autoFocus?: boolean;
  disabled?: boolean;
  autoComplete?: string;
  uppercase?: boolean;
};

type Values = Record<string, unknown>;

export function SchemaForm({
  schema,
  fields,
  defaultValues = {},
  action,
  submitLabel = "Save",
  successMessage = "Saved",
  onSuccess,
  cancelHref,
  columns = 2,
  extra,
}: {
  schema: z.ZodType;
  fields: FieldDef[];
  defaultValues?: Values;
  action: (values: Values) => Promise<ActionResult<{ id?: string; redirect?: string }>>;
  submitLabel?: string;
  successMessage?: string;
  onSuccess?: (data?: { id?: string; redirect?: string }) => void;
  cancelHref?: string;
  columns?: 1 | 2;
  extra?: React.ReactNode;
}) {
  const router = useRouter();
  const [formError, setFormError] = React.useState<string | null>(null);
  const form = useForm<Values>({
    resolver: zodResolver(schema as never) as unknown as Resolver<Values>,
    defaultValues: Object.fromEntries(fields.map((f) => [f.name, defaultValues[f.name] ?? (f.type === "checkbox" ? false : "")])),
  });
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = form;

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    const res = await action(values);
    if (!res.ok) {
      setFormError(res.error);
      for (const [k, v] of Object.entries(res.fieldErrors ?? {})) setError(k, { message: v });
      return;
    }
    toast.success(res.message ?? successMessage);
    if (res.data?.redirect) router.push(res.data.redirect);
    else router.refresh();
    onSuccess?.(res.data);
  });

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      <FormError message={formError} />
      <div className={cn("grid grid-cols-1 gap-4", columns === 2 && "sm:grid-cols-2")}>
        {fields.map((f) => {
          const err = errors[f.name]?.message as string | undefined;
          const id = `f-${f.name}`;
          const common = {
            id,
            "aria-invalid": err ? true : undefined,
            "aria-describedby": err ? `${id}-error` : undefined,
            disabled: f.disabled,
            autoFocus: f.autoFocus,
          } as const;
          if (f.type === "checkbox") {
            return (
              <div key={f.name} className={cn(f.span === 2 && "sm:col-span-2")}>
                <Checkbox label={f.label} {...register(f.name)} {...common} />
                {f.hint && <p className="mt-1 pl-6 text-xs text-muted">{f.hint}</p>}
              </div>
            );
          }
          return (
            <Field key={f.name} label={f.label} htmlFor={id} error={err} hint={f.hint} required={f.required} className={cn((f.span === 2 || f.type === "textarea") && "sm:col-span-2")}>
              {f.type === "textarea" ? (
                <Textarea placeholder={f.placeholder} {...register(f.name)} {...common} />
              ) : f.type === "select" ? (
                <Select {...register(f.name)} {...common}>
                  {!f.required && <option value="">—</option>}
                  {f.required && <option value="" disabled>Select…</option>}
                  {f.options?.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </Select>
              ) : (
                <Input
                  type={f.type ?? "text"}
                  inputMode={f.type === "number" ? "decimal" : undefined}
                  step={f.step ?? (f.type === "number" ? "any" : undefined)}
                  min={f.min}
                  placeholder={f.placeholder}
                  autoComplete={f.autoComplete}
                  className={f.uppercase ? "uppercase" : undefined}
                  {...register(f.name, f.uppercase ? { setValueAs: (v: string) => (typeof v === "string" ? v.toUpperCase() : v) } : undefined)}
                  {...common}
                />
              )}
            </Field>
          );
        })}
      </div>
      {extra}
      <div className="flex items-center justify-end gap-2 border-t border-line pt-4">
        {cancelHref && (
          <Button type="button" variant="ghost" onClick={() => router.push(cancelHref)}>
            Cancel
          </Button>
        )}
        <Button type="submit" variant="primary" loading={isSubmitting}>
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}
