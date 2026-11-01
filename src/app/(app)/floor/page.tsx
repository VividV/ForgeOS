import { ChevronRight, HardHat } from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState, PageHeader, Progress } from "@/components/ui/misc";
import { getSession, requirePermission } from "@/lib/auth";
import { formatDate, formatQty } from "@/lib/format";
import { OfflineSync } from "./sync";

export const metadata = { title: "My job cards" };

type Card_ = {
  id: string; code: string; status: string; target_quantity: number; quantity_completed: number; quantity_rejected: number; completed_at: string | null;
  operation_name: string; order_number: string; order_due_date: string | null; order_priority: string; product_name: string;
};

export default async function FloorPage() {
  const ctx = await requirePermission("job_cards.work");
  const { supabase } = await getSession();
  const { data } = await supabase.rpc("my_job_cards", { p_org: ctx.org.id, p_include_completed: true });
  const all = (data ?? []) as Card_[];
  const open = all.filter((c) => c.status !== "completed");
  const recent = all.filter((c) => c.status === "completed").sort((a, b) => (b.completed_at ?? "").localeCompare(a.completed_at ?? "")).slice(0, 5);

  return (
    <div className="mx-auto max-w-xl">
      <PageHeader title={`Hello${ctx.profile.full_name ? `, ${ctx.profile.full_name.split(" ")[0]}` : ""}`} description="Your assigned work. Tap a job to start it and record what you complete." />
      <OfflineSync />
      {open.length === 0 ? (
        <Card>
          <EmptyState icon={<HardHat />} title="No jobs assigned to you" description="When your supervisor issues a job card to you, it appears here." />
        </Card>
      ) : (
        <ul className="flex flex-col gap-3">
          {open.map((c) => (
            <li key={c.id}>
              <Link href={`/floor/jobs/${c.id}`} className="flex items-center gap-3 rounded-xl border border-line bg-surface p-4 shadow-card active:bg-subtle">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs text-muted">{c.code}</span>
                    {c.status === "in_progress" && <Badge tone="accent">In progress</Badge>}
                    {c.status === "paused" && <Badge tone="warning">Paused</Badge>}
                    {(c.order_priority === "urgent" || c.order_priority === "high") && <Badge tone="danger">{c.order_priority}</Badge>}
                  </div>
                  <p className="mt-1 text-base font-semibold">{c.operation_name}</p>
                  <p className="text-[13px] text-muted">
                    {c.product_name} · {c.order_number}
                    {c.order_due_date ? ` · due ${formatDate(c.order_due_date, ctx.settings.date_format)}` : ""}
                  </p>
                  <div className="mt-2 flex items-center gap-2">
                    <Progress value={(Number(c.quantity_completed) / Number(c.target_quantity)) * 100} />
                    <span className="tabular text-xs">
                      {formatQty(c.quantity_completed)}/{formatQty(c.target_quantity)}
                    </span>
                  </div>
                </div>
                <ChevronRight className="size-5 text-faint" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      )}
      {recent.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Recently completed</h2>
          <ul className="divide-y divide-line rounded-xl border border-line bg-surface">
            {recent.map((c) => (
              <li key={c.id} className="flex justify-between px-4 py-2.5 text-[13px]">
                <span>
                  <span className="font-mono text-xs text-muted">{c.code}</span> {c.operation_name}
                </span>
                <span className="tabular">{formatQty(c.quantity_completed)} done</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
