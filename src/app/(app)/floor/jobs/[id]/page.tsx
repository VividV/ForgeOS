import { notFound } from "next/navigation";
import { requirePermission, getSession } from "@/lib/auth";
import { Attachments } from "@/components/files/attachments";
import { OfflineSync } from "../../sync";
import { FloorJob, type FloorJobData } from "./job";

export const metadata = { title: "Job" };

export default async function FloorJobPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requirePermission("job_cards.work", "job_cards.update", "job_cards.read");
  const { supabase } = await getSession();
  const { data } = await supabase.rpc("get_job_card", { p_card: id });
  if (!data) notFound();
  return (
    <div className="mx-auto max-w-xl">
      <OfflineSync />
      <FloorJob job={data as FloorJobData} />
      <div className="mt-4">
        <Attachments entityType="production_order" entityId={(data as { order: { id: string } }).order.id} canUpload={(data as { status: string }).status !== "completed"} userId={ctx.user.id} title="Photos (defects, problems, finished work)" />
      </div>
    </div>
  );
}
