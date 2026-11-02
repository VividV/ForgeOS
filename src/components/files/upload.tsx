"use client";
import { Paperclip, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";
import { deleteAttachment, uploadAttachment } from "@/app/actions/ops";
import { Button } from "@/components/ui/button";

export function UploadButton({ entityType, entityId, label = "Add photo or file", asLogo, accept = "image/jpeg,image/png,image/webp,application/pdf" }: { entityType: string; entityId: string; label?: string; asLogo?: boolean; accept?: string }) {
  const router = useRouter();
  const ref = React.useRef<HTMLInputElement>(null);
  const [pending, start] = React.useTransition();
  const onPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (file.size > 4 * 1024 * 1024) return void toast.error("Files must be 4 MB or smaller");
    const fd = new FormData();
    fd.set("entity_type", entityType);
    fd.set("entity_id", entityId);
    fd.set("file", file);
    if (asLogo) fd.set("as_logo", "1");
    start(async () => {
      const r = await uploadAttachment(fd);
      if (!r.ok) return void toast.error(r.error);
      toast.success(r.message ?? "Uploaded");
      router.refresh();
    });
  };
  return (
    <>
      {/* capture lets phones open the camera directly */}
      <input ref={ref} type="file" accept={accept} capture={asLogo ? undefined : "environment"} className="hidden" onChange={onPick} aria-label={label} />
      <Button size="sm" loading={pending} onClick={() => ref.current?.click()}>
        <Paperclip /> {label}
      </Button>
    </>
  );
}

export function DeleteAttachment({ id }: { id: string }) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  return (
    <Button
      size="icon-sm"
      variant="ghost"
      aria-label="Remove file"
      loading={pending}
      onClick={() =>
        start(async () => {
          const r = await deleteAttachment(id);
          if (!r.ok) return void toast.error(r.error);
          toast.success(r.message ?? "Removed");
          router.refresh();
        })
      }
    >
      <Trash2 />
    </Button>
  );
}
