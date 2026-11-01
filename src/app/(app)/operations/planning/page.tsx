import { CalendarRange, Kanban, Table2 } from "lucide-react";
import Link from "next/link";
import { ListToolbar } from "@/components/data/toolbar";
import type { SearchParams } from "@/components/data/list";
import { Badge, PriorityBadge, ProductionStatusBadge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState, PageHeader, Progress } from "@/components/ui/misc";
import { TBody, TD, TH, THead, TR, Table } from "@/components/ui/table";
import { getSession, requirePermission } from "@/lib/auth";
import { formatDate, formatQty, todayIn } from "@/lib/format";
import { lookups } from "@/lib/services/lookups";
import { cn } from "@/lib/utils";

export const metadata = { title: "Production planning" };

type Order = {
  id: string; number: string; status: string; priority: string; quantity_planned: number; quantity_completed: number; due_date: string | null;
  planned_start_date: string | null; actual_start_at: string | null; actual_end_at: string | null; manager_id: string | null;
  products: { name: string }; factories: { name: string };
  production_operations: { sequence: number; stage_id: string; status: string; quantity_completed: number; name: string }[];
  job_cards: { assigned_team: string | null; assignee: { full_name: string } | null; status: string }[];
};

const s = (v: SearchParams[string]) => (Array.isArray(v) ? v[0] : v) ?? "";

export default async function PlanningPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const ctx = await requirePermission("production_orders.read");
  const sp = await searchParams;
  const view = ["board", "table", "timeline"].includes(s(sp.view)) ? s(sp.view) : "board";
  const { supabase } = await getSession();
  const today = todayIn(ctx.settings.timezone);
  const since = new Date(Date.now() - 7 * 86400000).toISOString();

  let q = supabase
    .from("production_orders")
    .select("id, number, status, priority, quantity_planned, quantity_completed, due_date, planned_start_date, actual_start_at, actual_end_at, manager_id, products!inner(name), factories(name), production_operations(sequence, stage_id, status, quantity_completed, name), job_cards(assigned_team, status, assignee:profiles!job_cards_assignee_profile_fk(full_name))")
    .eq("organization_id", ctx.org.id)
    .or(`status.not.in.(completed,cancelled),actual_end_at.gte.${since}`)
    .neq("status", "cancelled");
  if (s(sp.factory)) q = q.eq("factory_id", s(sp.factory));
  if (s(sp.priority)) q = q.eq("priority", s(sp.priority));
  if (s(sp.manager)) q = q.eq("manager_id", s(sp.manager));
  if (s(sp.status)) q = q.eq("status", s(sp.status));
  if (s(sp.due) === "overdue") q = q.lt("due_date", today);
  if (s(sp.due) === "week") q = q.lte("due_date", new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10));
  if (s(sp.q)) q = q.ilike("products.name", `%${s(sp.q).replace(/[%_]/g, "")}%`);
  const [{ data }, { data: stages }, opts] = await Promise.all([
    q.order("due_date", { ascending: true, nullsFirst: false }).limit(300),
    supabase.from("production_stages").select("id, name, is_quality_stage").eq("organization_id", ctx.org.id).eq("is_active", true).order("sequence"),
    lookups(ctx.org.id, ["factories", "members"]),
  ]);
  const orders = (data ?? []) as unknown as Order[];
  const base = "/operations/planning";
  const qs = (v: string) => {
    const u = new URLSearchParams(Object.entries(sp).flatMap(([k, val]) => (val ? [[k, s(val)]] : [])));
    u.set("view", v);
    return `${base}?${u}`;
  };

  const progress = (o: Order) => {
    const ops = o.production_operations.filter((x) => x.status !== "skipped").sort((a, b) => a.sequence - b.sequence);
    return o.status === "completed" ? Number(o.quantity_completed) : Number(ops.at(-1)?.quantity_completed ?? 0);
  };
  const currentStage = (o: Order) => {
    const ops = o.production_operations.filter((x) => x.status !== "skipped").sort((a, b) => a.sequence - b.sequence);
    return ops.find((x) => x.status !== "completed")?.stage_id ?? null;
  };
  const team = (o: Order) =>
    [...new Set(o.job_cards.filter((j) => j.status !== "cancelled").map((j) => j.assignee?.full_name || j.assigned_team).filter(Boolean))].join(", ");
  const late = (o: Order) => o.due_date && o.due_date < today && !["completed", "cancelled"].includes(o.status);

  const PLANNED = ["draft", "awaiting_approval", "approved", "materials_pending", "ready_to_start"];
  const columns = [
    { key: "planned", label: "Planned", items: orders.filter((o) => PLANNED.includes(o.status) && !o.production_operations.some((x) => x.status !== "pending")) },
    ...(stages ?? []).map((st) => ({
      key: st.id,
      label: st.name,
      items: orders.filter((o) => !["completed"].includes(o.status) && !(PLANNED.includes(o.status) && !o.production_operations.some((x) => x.status !== "pending")) && currentStage(o) === st.id),
    })),
    { key: "inspection", label: "Awaiting final inspection", items: orders.filter((o) => o.status === "quality_inspection" && currentStage(o) === null) },
    { key: "done", label: "Completed (7 days)", items: orders.filter((o) => o.status === "completed") },
  ].filter((c) => c.key !== "inspection" || c.items.length > 0);

  const Card_ = ({ o }: { o: Order }) => {
    const done = progress(o);
    return (
      <Link href={`/operations/production-orders/${o.id}`} className={cn("block rounded-lg border bg-surface p-3 shadow-card transition-colors hover:border-line-strong", late(o) ? "border-danger/40" : "border-line")}>
        <div className="flex items-center justify-between gap-2">
          <span className="text-[13px] font-semibold">{o.number}</span>
          <PriorityBadge priority={o.priority} />
        </div>
        <p className="mt-1 truncate text-[13px] text-ink-soft">{o.products.name}</p>
        <div className="mt-2 flex justify-between text-xs">
          <span className="tabular">
            {formatQty(done)} / {formatQty(o.quantity_planned)}
          </span>
          <span className="tabular text-muted">{formatQty(Math.max(Number(o.quantity_planned) - done, 0))} left</span>
        </div>
        <Progress value={(done / Number(o.quantity_planned)) * 100} className="mt-1" tone={o.status === "completed" ? "success" : late(o) ? "danger" : "accent"} />
        <div className="mt-2 flex items-center justify-between gap-2 text-xs">
          <span className={late(o) ? "font-medium text-danger-ink" : "text-muted"}>{o.due_date ? `${late(o) ? "Overdue · " : "Due "}${formatDate(o.due_date, ctx.settings.date_format)}` : "No due date"}</span>
          {o.status !== "in_progress" && o.status !== "completed" && <ProductionStatusBadge status={o.status} />}
        </div>
        {team(o) && <p className="mt-1.5 truncate text-xs text-muted">{team(o)}</p>}
      </Link>
    );
  };

  // timeline window: 4 weeks from the earliest relevant date
  const start = new Date(`${today}T00:00:00Z`);
  start.setUTCDate(start.getUTCDate() - 7);
  const days = 35;
  const dayIdx = (d: string | null) => (d ? Math.round((new Date(`${d.slice(0, 10)}T00:00:00Z`).getTime() - start.getTime()) / 86400000) : null);

  return (
    <>
      <PageHeader
        title="Production planning"
        description="Orders move across the board as each production step is completed on the floor."
        actions={
          <div className="flex rounded-md border border-line-strong bg-surface p-0.5" role="tablist" aria-label="View">
            {[
              { k: "board", l: "Board", I: Kanban },
              { k: "table", l: "Table", I: Table2 },
              { k: "timeline", l: "Timeline", I: CalendarRange },
            ].map(({ k, l, I }) => (
              <Link key={k} href={qs(k)} role="tab" aria-selected={view === k} className={cn("flex items-center gap-1.5 rounded px-2.5 py-1 text-[13px]", view === k ? "bg-ink text-white" : "text-muted hover:text-ink")}>
                <I className="size-3.5" /> {l}
              </Link>
            ))}
          </div>
        }
      />
      <Card className="mb-4">
        <ListToolbar
          placeholder="Search product"
          filters={[
            { name: "factory", label: "Factory", options: opts.factories },
            { name: "priority", label: "Priority", options: ["urgent", "high", "normal", "low"].map((p) => ({ value: p, label: p })) },
            { name: "manager", label: "Manager", options: opts.members },
            { name: "due", label: "Due", options: [{ value: "overdue", label: "Overdue" }, { value: "week", label: "Within 7 days" }] },
          ]}
        />
      </Card>

      {orders.length === 0 ? (
        <Card>
          <EmptyState icon={<Kanban />} title="Nothing scheduled" description="Approved production orders appear here." />
        </Card>
      ) : view === "board" ? (
        <div className="-mx-4 overflow-x-auto px-4 pb-4 lg:-mx-8 lg:px-8">
          <div className="flex min-w-max gap-3">
            {columns.map((c) => (
              <section key={c.key} className="flex w-72 shrink-0 flex-col rounded-lg bg-subtle/70 p-2" aria-label={c.label}>
                <header className="mb-2 flex items-center justify-between px-1">
                  <h2 className="text-[12px] font-semibold uppercase tracking-wide text-muted">{c.label}</h2>
                  <span className="tabular rounded bg-surface px-1.5 text-[11px] text-muted">{c.items.length}</span>
                </header>
                <div className="flex flex-col gap-2">
                  {c.items.map((o) => (
                    <Card_ key={o.id} o={o} />
                  ))}
                  {c.items.length === 0 && <p className="px-1 py-6 text-center text-xs text-faint">Empty</p>}
                </div>
              </section>
            ))}
          </div>
        </div>
      ) : view === "table" ? (
        <Card>
          <Table>
            <THead>
              <tr>
                <TH>Order</TH>
                <TH>Product</TH>
                <TH>Factory</TH>
                <TH>Current step</TH>
                <TH align="right">Done</TH>
                <TH align="right">Remaining</TH>
                <TH>Team</TH>
                <TH>Due</TH>
                <TH>Status</TH>
              </tr>
            </THead>
            <TBody>
              {orders.map((o) => {
                const done = progress(o);
                const cur = o.production_operations.filter((x) => x.status !== "skipped" && x.status !== "completed").sort((a, b) => a.sequence - b.sequence)[0];
                return (
                  <TR key={o.id}>
                    <TD>
                      <Link href={`/operations/production-orders/${o.id}`} className="font-medium hover:text-accent-ink">
                        {o.number}
                      </Link>
                    </TD>
                    <TD>{o.products.name}</TD>
                    <TD className="text-muted">{o.factories?.name}</TD>
                    <TD>{cur?.name ?? (o.status === "completed" ? "—" : "Final inspection")}</TD>
                    <TD align="right">{formatQty(done)}</TD>
                    <TD align="right">{formatQty(Math.max(Number(o.quantity_planned) - done, 0))}</TD>
                    <TD className="max-w-40 truncate text-muted">{team(o) || "—"}</TD>
                    <TD className={late(o) ? "font-medium text-danger-ink" : "text-muted"}>{formatDate(o.due_date, ctx.settings.date_format)}</TD>
                    <TD>
                      <ProductionStatusBadge status={o.status} />
                    </TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        </Card>
      ) : (
        <Card className="overflow-x-auto">
          <div className="min-w-[900px]">
            <div className="grid border-b border-line" style={{ gridTemplateColumns: `200px repeat(${days}, minmax(0, 1fr))` }}>
              <div className="px-3 py-2 text-[11px] font-medium uppercase text-muted">Order</div>
              {Array.from({ length: days }).map((_, i) => {
                const d = new Date(start.getTime() + i * 86400000);
                const iso = d.toISOString().slice(0, 10);
                return (
                  <div key={i} className={cn("border-l border-line py-2 text-center text-[10px] text-muted", iso === today && "bg-accent-soft font-semibold text-accent-ink")}>
                    {d.getUTCDate()}
                    {d.getUTCDate() === 1 || i === 0 ? <div>{d.toLocaleString("en-GB", { month: "short", timeZone: "UTC" })}</div> : null}
                  </div>
                );
              })}
            </div>
            {orders.map((o) => {
              const s0 = dayIdx(o.actual_start_at ?? o.planned_start_date ?? null) ?? dayIdx(today)!;
              const e0 = dayIdx(o.actual_end_at ?? o.due_date ?? null) ?? s0 + 1;
              const a = Math.max(0, Math.min(days - 1, s0));
              const b = Math.max(a, Math.min(days - 1, e0));
              const done = progress(o);
              return (
                <div key={o.id} className="grid items-center border-b border-line last:border-0" style={{ gridTemplateColumns: `200px repeat(${days}, minmax(0, 1fr))` }}>
                  <Link href={`/operations/production-orders/${o.id}`} className="truncate px-3 py-2 text-[13px] hover:text-accent-ink">
                    <span className="font-medium">{o.number}</span> <span className="text-muted">{o.products.name}</span>
                  </Link>
                  <div className="relative h-full py-2" style={{ gridColumn: `${a + 2} / ${b + 3}` }}>
                    <div className={cn("relative h-5 overflow-hidden rounded", o.status === "completed" ? "bg-success/20" : late(o) ? "bg-danger/15" : "bg-accent/15")} title={`${o.number} · ${formatQty(done)}/${formatQty(o.quantity_planned)}`}>
                      <div className={cn("h-full", o.status === "completed" ? "bg-success/60" : late(o) ? "bg-danger/50" : "bg-accent/60")} style={{ width: `${Math.min(100, (done / Number(o.quantity_planned)) * 100)}%` }} />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          <p className="border-t border-line px-3 py-2 text-xs text-muted">
            Bars run from actual (or planned) start to completion (or due date). Fill shows output through the last step. <Badge>Today</Badge> is highlighted.
          </p>
        </Card>
      )}
    </>
  );
}
