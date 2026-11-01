import { AlertTriangle, ArrowRight, CircleAlert } from "lucide-react";
import Link from "next/link";
import { ListToolbar } from "@/components/data/toolbar";
import type { SearchParams } from "@/components/data/list";
import { RankBars, TimeColumns, TrendLine } from "@/components/charts/charts";
import { PRODUCTION_STATUS } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { EmptyState, PageHeader, Stat } from "@/components/ui/misc";
import { getSession, requirePermission } from "@/lib/auth";
import { formatDate, formatMoney, formatPct, formatQty } from "@/lib/format";
import { lookups } from "@/lib/services/lookups";

export const metadata = { title: "Mission Control" };

type Summary = {
  range: { from: string; to: string; today: string; timezone: string };
  can_see_costs: boolean;
  can_see_inventory: boolean;
  can_see_production: boolean;
  production?: { active_orders: number; in_progress: number; behind_schedule: number; materials_pending: number; awaiting_approval: number; completed_today: number; completed_in_range: number; on_time_in_range: number; due_in_range_with_date: number };
  output?: { planned_completed_orders: number; accepted: number; rejected: number };
  quality?: { good: number; rejected: number };
  output_by_day?: { day: string; accepted: number; rejected: number }[];
  floor_output_by_day?: { day: string; good: number; rejected: number }[];
  orders_by_status?: { status: string; count: number }[];
  work_centres?: { name: string; good: number; rejected: number; downtime_minutes: number }[];
  inventory?: { materials_tracked: number; low_stock: number; out_of_stock: number; raw_material_value: number | null; finished_goods_value: number | null };
  inventory_by_category?: { category: string; value: number }[];
  consumption_by_day?: { day: string; value: number | null; movements: number }[];
};
type Alert = { kind: string; severity: string; title: string; detail: string | null; link: string };

const RANGES: Record<string, number> = { "7": 7, "30": 30, "90": 90 };
const s = (v: SearchParams[string]) => (Array.isArray(v) ? v[0] : v) ?? "";
const shortDay = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });

export default async function OverviewPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const ctx = await requirePermission("dashboard.read");
  const sp = await searchParams;
  const days = RANGES[s(sp.range)] ?? 30;
  const factory = s(sp.factory) || null;
  const { supabase } = await getSession();
  const to = new Date();
  const from = new Date(to.getTime() - (days - 1) * 86400000);
  const [{ data, error }, { data: alerts }, { factories }] = await Promise.all([
    supabase.rpc("dashboard_summary", { p_org: ctx.org.id, p_factory: factory, p_from: from.toISOString().slice(0, 10), p_to: null }),
    supabase.rpc("operational_alerts", { p_org: ctx.org.id, p_factory: factory }),
    lookups(ctx.org.id, ["factories"]),
  ]);
  if (error) throw new Error(error.message);
  const d = data as Summary;
  const cur = ctx.settings.currency;
  const p = d.production;
  const q = d.quality;
  const rejRate = q && Number(q.good) + Number(q.rejected) > 0 ? (Number(q.rejected) / (Number(q.good) + Number(q.rejected))) * 100 : null;
  const onTime = p && p.due_in_range_with_date > 0 ? (p.on_time_in_range / p.due_in_range_with_date) * 100 : null;
  const alertList = ((alerts ?? []) as Alert[]).sort((a, b) => (a.severity === "critical" ? -1 : 1) - (b.severity === "critical" ? -1 : 1));
  const empty = p && p.active_orders === 0 && p.completed_in_range === 0 && (d.inventory?.materials_tracked ?? 0) === 0;

  return (
    <>
      <PageHeader
        title="Mission Control"
        description={`${ctx.org.name} · ${formatDate(d.range.from, ctx.settings.date_format)} – ${formatDate(d.range.to, ctx.settings.date_format)} (${d.range.timezone})`}
      />
      <Card className="mb-4">
        <ListToolbar
          search={false}
          filters={[
            { name: "range", label: "Period", options: [{ value: "7", label: "Last 7 days" }, { value: "30", label: "Last 30 days" }, { value: "90", label: "Last 90 days" }] },
            { name: "factory", label: "Factory", options: factories },
          ]}
        />
      </Card>

      {empty && (
        <Card className="mb-4">
          <EmptyState
            title="Nothing to report yet"
            description="Mission Control fills in from real records: add materials and stock, approve a BOM and run your first production order."
            action={
              <Link href="/commerce/products/new" className="text-[13px] font-medium text-accent-ink hover:underline">
                Add your first product
              </Link>
            }
          />
        </Card>
      )}

      {p && (
        <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          <Stat label="Active orders" value={p.active_orders} hint={`${p.in_progress} in progress`} href="/operations/production-orders" />
          <Stat label="Behind schedule" value={p.behind_schedule} tone={p.behind_schedule > 0 ? "danger" : undefined} href="/alerts" />
          <Stat label="Completed today" value={p.completed_today} hint={`${p.completed_in_range} in period`} />
          <Stat label="On-time completion" value={formatPct(onTime, 0)} hint={p.due_in_range_with_date ? `${p.on_time_in_range} of ${p.due_in_range_with_date} with due dates` : "No completed orders with due dates"} />
          <Stat label="Waiting for materials" value={p.materials_pending} tone={p.materials_pending > 0 ? "warning" : undefined} href="/operations/production-orders?status=materials_pending&view=all" />
          <Stat label="Floor rejection rate" value={formatPct(rejRate)} hint={q ? `${formatQty(q.rejected)} of ${formatQty(Number(q.good) + Number(q.rejected))} units` : undefined} tone={rejRate !== null && rejRate > 5 ? "warning" : undefined} />
        </div>
      )}
      {d.inventory && (
        <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
          {d.can_see_costs && <Stat label="Raw material stock value" value={formatMoney(d.inventory.raw_material_value, cur, { compact: true })} hint="At weighted average cost" href="/inventory" />}
          {d.can_see_costs && <Stat label="Finished goods value" value={formatMoney(d.inventory.finished_goods_value, cur, { compact: true })} href="/inventory/finished-goods" />}
          <Stat label="Low-stock materials" value={d.inventory.low_stock} tone={d.inventory.low_stock > 0 ? "warning" : undefined} href="/inventory/reorder" />
          <Stat label="Out of stock" value={d.inventory.out_of_stock} tone={d.inventory.out_of_stock > 0 ? "danger" : undefined} href="/inventory/reorder" />
        </div>
      )}

      <div className="grid gap-4 xl:grid-cols-3">
        <div className="flex flex-col gap-4 xl:col-span-2">
          {d.floor_output_by_day && (
            <Card>
              <CardHeader title="Floor output per day" description="Units recorded as completed or rejected at production steps (all steps)." />
              <CardBody>
                <TimeColumns
                  data={d.floor_output_by_day.map((x) => ({ day: shortDay(x.day), good: Number(x.good), rejected: Number(x.rejected) }))}
                  xKey="day"
                  series={[
                    { key: "good", label: "Good" },
                    { key: "rejected", label: "Rejected" },
                  ]}
                />
              </CardBody>
            </Card>
          )}
          {d.output && d.output_by_day && (
            <Card>
              <CardHeader
                title="Finished goods output"
                description={`Accepted units stocked from completed orders · planned ${formatQty(d.output.planned_completed_orders)} vs actual ${formatQty(Number(d.output.accepted) + Number(d.output.rejected))} (${formatQty(d.output.accepted)} accepted)`}
              />
              <CardBody>
                <TimeColumns
                  data={d.output_by_day.map((x) => ({ day: shortDay(x.day), accepted: Number(x.accepted), rejected: Number(x.rejected) }))}
                  xKey="day"
                  series={[
                    { key: "accepted", label: "Accepted" },
                    { key: "rejected", label: "Rejected" },
                  ]}
                />
              </CardBody>
            </Card>
          )}
          {d.consumption_by_day && d.can_see_costs && (
            <Card>
              <CardHeader title="Material consumption" description="Net value of materials issued to production per day (issues minus returns)." />
              <CardBody>
                <TrendLine data={d.consumption_by_day.map((x) => ({ day: shortDay(x.day), value: Number(x.value ?? 0) }))} xKey="day" yKey="value" label="Materials issued" money={cur} />
              </CardBody>
            </Card>
          )}
        </div>
        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader
              title="Alerts"
              description="Rule-based, from live records"
              action={
                <Link href="/alerts" className="text-[13px] text-accent-ink hover:underline">
                  All
                </Link>
              }
            />
            {alertList.length === 0 ? (
              <EmptyState title="No alerts" description="Nothing overdue, short or out of range." />
            ) : (
              <ul className="divide-y divide-line">
                {alertList.slice(0, 7).map((a, i) => (
                  <li key={i}>
                    <Link href={a.link} className="flex gap-2.5 px-4 py-2.5 hover:bg-subtle/60">
                      {a.severity === "critical" ? <CircleAlert className="mt-0.5 size-4 shrink-0 text-danger" aria-label="Critical" /> : <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" aria-label="Warning" />}
                      <span className="min-w-0">
                        <span className="block text-[13px] font-medium">{a.title}</span>
                        {a.detail && <span className="block truncate text-xs text-muted">{a.detail}</span>}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          {d.orders_by_status && (
            <Card>
              <CardHeader title="Orders by status" />
              <CardBody>
                <RankBars data={d.orders_by_status.map((x) => ({ label: PRODUCTION_STATUS[x.status]?.label ?? x.status, value: Number(x.count) }))} empty="No orders yet" />
              </CardBody>
            </Card>
          )}
          {d.inventory_by_category && (
            <Card>
              <CardHeader title="Raw material value by category" />
              <CardBody>
                <RankBars data={d.inventory_by_category.map((x) => ({ label: x.category, value: Number(x.value) }))} money={cur} empty="No valued stock yet" />
              </CardBody>
            </Card>
          )}
          {d.work_centres && d.work_centres.length > 0 && (
            <Card>
              <CardHeader title="Work-centre output" description="Good units recorded in the period" />
              <CardBody>
                <RankBars data={d.work_centres.slice(0, 8).map((w) => ({ label: `${w.name}${w.downtime_minutes ? ` · ${w.downtime_minutes} min down` : ""}`, value: Number(w.good) }))} empty="No step output assigned to work centres yet" />
              </CardBody>
            </Card>
          )}
          <Link href="/intelligence/reports" className="flex items-center justify-between rounded-lg border border-line bg-surface px-4 py-3 text-[13px] font-medium hover:border-line-strong">
            Operational reports <ArrowRight className="size-4" />
          </Link>
        </div>
      </div>
    </>
  );
}
