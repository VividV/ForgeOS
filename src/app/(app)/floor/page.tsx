import { ChevronRight, HardHat } from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState, PageHeader, Progress } from "@/components/ui/misc";
import { getSession, requirePermission } from "@/lib/auth";
import { formatDate, formatQty } from "@/lib/format";
import { OfflineSync } from "./sync";

export const metadata = { title: "My job cards" };

export default async function FloorPage() {
  const ctx = await requirePermission("job_cards.work");
  const { supabase } = await getSession();
  const { data } = await supabase
    .from("job_cards")
    .select("id, code, status, target_quantity, quantity_completed, quantity_rejected, production_orders(number, due_date, priority, status, products(name)), production_operations(name)")
    .eq("organization_id", ctx.org.id)
    .eq("assigned_user_id", ctx.user.id)
    .in("status", ["open", "in_progress", "paused"])
    .order("issued_at");
  const { data: recent } = await supabase
    .from("job_cards")
    .select("id, code, quantity_completed, completed_at, production_operations(name)")
    .eq("organization_id", ctx.org.id)
    .eq("assigned_user_id", ctx.user.id)
    .eq("status", "completed")
    .order("completed_at", { ascending: false })
    .limit(5);

  return (
    <div className="mx-auto max-w-xl">
      <PageHeader title={`Hello${ctx.profile.full_name ? `, ${ctx.profile.full_name.split(" ")[0]}` : ""}`} description="Your assigned work. Tap a job to start it and record what you complete." />
      <OfflineSync />
      {(data ?? []).length === 0 ? (
        <Card>
          <EmptyState icon={<HardHat />} title="No jobs assigned to you" description="When your supervisor issues a job card to you, it appears here." />
        </Card>
      ) : (
        <ul className="flex flex-col gap-3">
          {(data ?? []).map((c) => {
            const po = c.production_orders as unknown as { number: string; due_date: string | null; priority: string; products: { name: string } };
            return (
              <li key={c.id}>
                <Link href={`/floor/jobs/${c.id}`} className="flex items-center gap-3 rounded-xl border border-line bg-surface p-4 shadow-card active:bg-subtle">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs text-muted">{c.code}</span>
                      {c.status === "in_progress" && <Badge tone="accent">In progress</Badge>}
                      {c.status === "paused" && <Badge tone="warning">Paused</Badge>}
                      {(po.priority === "urgent" || po.priority === "high") && <Badge tone="danger">{po.priority}</Badge>}
                    </div>
                    <p className="mt-1 text-base font-semibold">{(c.production_operations as unknown as { name: string }).name}</p>
                    <p className="text-[13px] text-muted">
                      {po.products.name} · {po.number}
                      {po.due_date ? ` · due ${formatDate(po.due_date, ctx.settings.date_format)}` : ""}
                    </p>
                    <div className="mt-2 flex items-center gap-2">
                      <Progress value={(Number(c.quantity_completed) / Number(c.target_quantity)) * 100} />
                      <span className="tabular text-xs">
                        {formatQty(c.quantity_completed)}/{formatQty(c.target_quantity)}
                      </span>
                    </div>
                  </div>
                  <ChevronRight className="size-5 text-faint" />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
      {(recent ?? []).length > 0 && (
        <section className="mt-8">
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Recently completed</h2>
          <ul className="divide-y divide-line rounded-xl border border-line bg-surface">
            {(recent ?? []).map((c) => (
              <li key={c.id} className="flex justify-between px-4 py-2.5 text-[13px]">
                <span>
                  <span className="font-mono text-xs text-muted">{c.code}</span> {(c.production_operations as unknown as { name: string }).name}
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
