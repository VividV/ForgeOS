import { notFound } from "next/navigation";
import { requirePermission, getSession } from "@/lib/auth";
import { OfflineSync } from "../../sync";
import { FloorJob, type FloorJobData } from "./job";

export const metadata = { title: "Job" };

export default async function FloorJobPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requirePermission("job_cards.work", "job_cards.update", "job_cards.read");
  const { supabase } = await getSession();
  const { data } = await supabase.rpc("get_job_card", { p_card: id });
  if (!data) notFound();
  return (
    <div className="mx-auto max-w-xl">
      <OfflineSync />
      <FloorJob job={data as FloorJobData} />
    </div>
  );
}
