"use client";
import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";
import { Button, type ButtonProps } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, FormError, Textarea } from "@/components/ui/form";
import type { ActionResult } from "@/lib/errors";

/**
 * Runs a server action on click. With `confirm`, shows a confirmation dialog first
 * (required for destructive actions). With `noteLabel`, collects a note/reason.
 */
export function ActionButton({
  action,
  children,
  confirm,
  confirmLabel = "Confirm",
  noteLabel,
  noteRequired,
  successMessage,
  redirectTo,
  ...buttonProps
}: Omit<ButtonProps, "onClick" | "action"> & {
  action: (note?: string) => Promise<ActionResult<{ redirect?: string } | unknown>>;
  confirm?: { title: string; description?: React.ReactNode };
  confirmLabel?: string;
  noteLabel?: string;
  noteRequired?: boolean;
  successMessage?: string;
  redirectTo?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [pending, startTransition] = React.useTransition();
  const [note, setNote] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);

  const run = () =>
    startTransition(async () => {
      setError(null);
      const res = await action(noteLabel ? note : undefined);
      if (!res.ok) {
        if (open) setError(res.error);
        else toast.error(res.error);
        return;
      }
      setOpen(false);
      setNote("");
      toast.success(res.message ?? successMessage ?? "Done");
      const dest = redirectTo ?? ((res.data as { redirect?: string } | undefined)?.redirect);
      if (dest) router.push(dest);
      else router.refresh();
    });

  if (!confirm && !noteLabel) {
    return (
      <Button {...buttonProps} loading={pending} onClick={run}>
        {children}
      </Button>
    );
  }
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) setError(null);
      }}
      title={confirm?.title ?? String(children)}
      description={confirm?.description}
      trigger={<Button {...buttonProps}>{children}</Button>}
    >
      <div className="flex flex-col gap-4">
        <FormError message={error} />
        {noteLabel && (
          <Field label={noteLabel} htmlFor="action-note" required={noteRequired}>
            <Textarea id="action-note" value={note} onChange={(e) => setNote(e.target.value)} autoFocus />
          </Field>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setOpen(false)} type="button">
            Cancel
          </Button>
          <Button
            variant={buttonProps.variant === "danger" || buttonProps.variant === "danger-outline" ? "danger" : "primary"}
            loading={pending}
            disabled={noteRequired && !note.trim()}
            onClick={run}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
