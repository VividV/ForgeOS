import Link from "next/link";
import { Card } from "@/components/ui/card";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { getSession, requirePermission } from "@/lib/auth";
import { formatDateTime, formatQty, relativeTime, sentenceCase } from "@/lib/format";

export const metadata = { title: "Activity feed" };

export default async function ActivityPage() {
  const ctx = await requirePermission("production_orders.read", "audit_logs.read");
  const { supabase } = await getSession();
  const [{ data: logs }, { data: audit }] = await Promise.all([
    ctx.can("production_orders.read")
      ? supabase.from("production_logs").select("id, log_type, message, quantity_good, quantity_rejected, occurred_at, production_order_id, production_orders(number), profiles:created_by(full_name)").eq("organization_id", ctx.org.id).order("occurred_at", { ascending: false }).limit(80)
      : Promise.resolve({ data: [] }),
    ctx.can("audit_logs.read")
      ? supabase.from("audit_logs").select("id, action, entity_type, summary, created_at, profiles:actor_id(full_name)").eq("organization_id", ctx.org.id).not("action", "in", "(update)").order("created_at", { ascending: false }).limit(80)
      : Promise.resolve({ data: [] }),
  ]);
  type Item = { id: string; at: string; who: string; text: React.ReactNode };
  const items: Item[] = [
    ...(logs ?? []).map((l) => ({
      id: `l${l.id}`,
      at: l.occurred_at,
      who: (l.profiles as unknown as { full_name: string } | null)?.full_name ?? "System",
      text: (
        <>
          <Link href={`/operations/production-orders/${l.production_order_id}`} className="font-medium text-accent-ink hover:underline">
            {(l.production_orders as unknown as { number: string }).number}
          </Link>{" "}
          {sentenceCase(l.log_type)}
          {l.quantity_good ? ` · ${formatQty(l.quantity_good)}` : ""}
          {Number(l.quantity_rejected) > 0 ? ` · ${formatQty(l.quantity_rejected)} rejected` : ""}
          {l.message ? <span className="text-muted"> — {l.message}</span> : null}
        </>
      ),
    })),
    ...(audit ?? []).map((a) => ({
      id: `a${a.id}`,
      at: a.created_at,
      who: (a.profiles as unknown as { full_name: string } | null)?.full_name ?? "System",
      text: (
        <>
          {a.summary ?? `${sentenceCase(a.action)} ${a.entity_type.replace(/_/g, " ")}`}
        </>
      ),
    })),
  ].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 100);

  return (
    <>
      <PageHeader title="Activity feed" description="Recent production updates and important changes across the organisation." />
      <Card>
        {items.length === 0 ? (
          <EmptyState title="No activity yet" />
        ) : (
          <ul className="divide-y divide-line">
            {items.map((i) => (
              <li key={i.id} className="flex gap-3 px-4 py-2.5 text-[13px]">
                <span className="w-24 shrink-0 text-xs text-muted" title={formatDateTime(i.at, ctx.settings.date_format, ctx.settings.timezone)}>
                  {relativeTime(i.at)}
                </span>
                <span className="min-w-0 flex-1">{i.text}</span>
                <span className="shrink-0 text-xs text-muted">{i.who}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
