import { FileText } from "lucide-react";
import { Card, CardHeader } from "@/components/ui/card";
import { getSession } from "@/lib/auth";
import { DeleteAttachment, UploadButton } from "./upload";

/** Photos and documents attached to a record. Visibility follows the record's own permissions (RLS). */
export async function Attachments({ entityType, entityId, canUpload, title = "Photos & files", userId, canManage }: { entityType: string; entityId: string; canUpload: boolean; title?: string; userId: string; canManage?: boolean }) {
  const { supabase } = await getSession();
  const { data } = await supabase.from("attachment_list").select("id, file_name, content_type, size_bytes, uploaded_by, created_at").eq("entity_type", entityType).eq("entity_id", entityId).order("created_at");
  const files = data ?? [];
  if (!canUpload && files.length === 0) return null;
  return (
    <Card>
      <CardHeader title={title} action={canUpload && <UploadButton entityType={entityType} entityId={entityId} />} />
      {files.length === 0 ? (
        <p className="px-4 py-3 text-[13px] text-muted">No files yet. Photos from a phone camera work well (up to 4 MB).</p>
      ) : (
        <ul className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-3">
          {files.map((f) => (
            <li key={f.id} className="group relative overflow-hidden rounded-md border border-line">
              {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
              <a href={`/api/files/${f.id}`} target="_blank" rel="noreferrer" className="block">
                {f.content_type.startsWith("image/") ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={`/api/files/${f.id}`} alt={f.file_name} className="aspect-square w-full bg-subtle object-cover" loading="lazy" />
                ) : (
                  <div className="flex aspect-square w-full flex-col items-center justify-center gap-1 bg-subtle text-muted">
                    <FileText className="size-8" />
                    <span className="text-xs">PDF</span>
                  </div>
                )}
                <p className="truncate px-2 py-1 text-xs">{f.file_name}</p>
              </a>
              {(f.uploaded_by === userId || canManage) && (
                <div className="absolute right-1 top-1 rounded bg-surface/90">
                  <DeleteAttachment id={f.id} />
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
