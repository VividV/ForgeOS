import { FilePlus, Sparkles } from "lucide-react";
import Link from "next/link";
import { RankBars } from "@/components/charts/charts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { TBody, TD, TH, THead, TR, Table } from "@/components/ui/table";
import { getSession, requirePermission } from "@/lib/auth";
import { formatDate, formatQty } from "@/lib/format";

export const metadata = { title: "Insights" };

type Fc = { stock_item_id: string; product_id: string; name: string; code: string; uom_code: string; weekly_avg: number; trend_pct: number | null; open_orders: number; available: number; in_production: number; forecast_demand: number; projected_gap: number; weeks_of_cover: number | null };
type Mr = { stock_item_id: string; material_id: string; name: string; code: string; uom_code: string; for_open_production: number; for_forecast: number; available: number; on_order: number; net_requirement: number; lead_time_days: number | null; order_by: string; supplier: string | null };
type Bn = { stage_id: string; stage: string; in_progress: number; queued: number; completed: number; avg_hours: number | null; downtime_minutes: number; score: number; is_bottleneck: boolean };
type An = { kind: string; severity: string; title: string; detail: string; link: string };

export default async function InsightsPage({ searchParams }: { searchParams: Promise<{ weeks?: string }> }) {
  const ctx = await requirePermission("dashboard.read", "production_orders.read", "inventory.read");
  const sp = await searchParams;
  const weeks = Math.min(Math.max(Number(sp.weeks) || 4, 1), 12);
  const { supabase } = await getSession();
  const [fc, mr, bn, an] = await Promise.all([
    supabase.rpc("demand_forecast", { p_org: ctx.org.id, p_weeks: weeks }),
    supabase.rpc("material_requirements", { p_org: ctx.org.id, p_weeks: weeks }),
    ctx.can("production_orders.read") ? supabase.rpc("bottleneck_analysis", { p_org: ctx.org.id, p_days: 30 }) : Promise.resolve({ data: [] }),
    ctx.canAny("dashboard.read", "production_orders.read") ? supabase.rpc("detect_anomalies", { p_org: ctx.org.id }) : Promise.resolve({ data: [] }),
  ]);
  const forecast = (fc.data ?? []) as Fc[];
  const mrp = ((mr.data ?? []) as Mr[]).filter((m) => Number(m.net_requirement) > 0 || Number(m.for_open_production) > 0);
  const stages = (bn.data ?? []) as Bn[];
  const anomalies = (an.data ?? []) as An[];
  const bottleneck = stages.find((s) => s.is_bottleneck);
  const today = new Date().toISOString().slice(0, 10);
  const df = ctx.settings.date_format;
  return (
    <>
      <PageHeader
        title="Insights"
        description="Forecasts, material planning, bottlenecks and anomalies, calculated by fixed, explainable rules from your own records. No AI needed."
        actions={
          ctx.can("ai.use") && (
            <Button asChild>
              <Link href="/intelligence/copilot">
                <Sparkles /> Ask Forge
              </Link>
            </Button>
          )
        }
      />
      <div className="mb-3 flex items-center gap-2 text-[13px]">
        <span className="text-muted">Planning horizon:</span>
        {[2, 4, 8, 12].map((w) => (
          <Link key={w} href={`/intelligence/insights?weeks=${w}`} className={`rounded px-2 py-1 ${w === weeks ? "bg-subtle font-medium" : "text-muted hover:text-ink"}`}>
            {w} weeks
          </Link>
        ))}
      </div>
      <div className="mb-4 grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader title="Anomalies" description="Things that look unusual compared with your own recent history" />
          {anomalies.length === 0 ? (
            <EmptyState title="Nothing unusual" description="Checked: reject spikes, material over-use, large adjustments, output drops and late suppliers." />
          ) : (
            <ul className="divide-y divide-line">
              {anomalies.map((a, i) => (
                <li key={i} className="px-4 py-2.5 text-[13px]">
                  <Link href={a.link} className="font-medium hover:text-accent-ink">
                    {a.title}
                  </Link>{" "}
                  <Badge tone={a.severity === "critical" ? "danger" : a.severity === "warning" ? "warning" : "info"}>{a.kind.replace(/_/g, " ")}</Badge>
                  <p className="text-xs text-muted">{a.detail}</p>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card>
          <CardHeader title="Production flow" description={bottleneck ? `Likely bottleneck: ${bottleneck.stage}` : "Work waiting and time taken per stage (last 30 days)"} />
          <CardBody>
            {stages.every((s) => Number(s.score) === 0) ? (
              <EmptyState title="Not enough production history yet" />
            ) : (
              <RankBars data={stages.filter((s) => Number(s.score) > 0).map((s) => ({ label: s.stage, value: Number(s.score) }))} empty="No queues" />
            )}
            <p className="mt-2 text-xs text-muted">Score = (steps in progress + waiting) × average hours per step + downtime hours.</p>
          </CardBody>
        </Card>
      </div>
      <Card className="mb-4">
        <CardHeader title={`Product demand · next ${weeks} weeks`} description="Weighted average of the last 8 weeks of dispatches plus open customer orders, against free stock and production in progress." />
        {forecast.length === 0 ? (
          <EmptyState title="No sales history yet" description="Forecasts appear once you dispatch customer orders." />
        ) : (
          <Table>
            <THead>
              <tr>
                <TH>Product</TH>
                <TH align="right">Avg / week</TH>
                <TH align="right">Trend</TH>
                <TH align="right">Open orders</TH>
                <TH align="right">Free stock</TH>
                <TH align="right">In production</TH>
                <TH align="right">Shortfall</TH>
                <TH align="right">Weeks of cover</TH>
              </tr>
            </THead>
            <TBody>
              {forecast.map((f) => (
                <TR key={f.stock_item_id}>
                  <TD>
                    <Link className="hover:text-accent-ink" href={`/commerce/products/${f.product_id}`}>
                      {f.name}
                    </Link>{" "}
                    <span className="font-mono text-xs text-muted">{f.code}</span>
                  </TD>
                  <TD align="right">{formatQty(f.weekly_avg, 1)}</TD>
                  <TD align="right" className={f.trend_pct == null ? "text-muted" : Number(f.trend_pct) > 0 ? "text-success" : "text-danger-ink"}>
                    {f.trend_pct == null ? "—" : `${Number(f.trend_pct) > 0 ? "+" : ""}${f.trend_pct}%`}
                  </TD>
                  <TD align="right">{formatQty(f.open_orders)}</TD>
                  <TD align="right">{formatQty(f.available)}</TD>
                  <TD align="right">{formatQty(f.in_production)}</TD>
                  <TD align="right" className={Number(f.projected_gap) > 0 ? "font-semibold text-warning-ink" : "text-muted"}>
                    {formatQty(f.projected_gap)}
                  </TD>
                  <TD align="right" className={f.weeks_of_cover != null && Number(f.weeks_of_cover) < 2 ? "text-danger-ink" : ""}>
                    {f.weeks_of_cover == null ? "—" : formatQty(f.weeks_of_cover, 1)}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>
      <Card>
        <CardHeader
          title="Materials to order"
          description="Open production needs plus materials for any forecast shortfall (through the approved BOM) plus reorder level, minus free stock and open purchase orders."
          action={
            ctx.can("requisitions.create") &&
            mrp.some((m) => Number(m.net_requirement) > 0) && (
              <Button asChild size="sm" variant="primary">
                <Link href="/commerce/requisitions/new?suggest=1">
                  <FilePlus /> Create requisition
                </Link>
              </Button>
            )
          }
        />
        {mrp.length === 0 ? (
          <EmptyState title="Nothing to order" />
        ) : (
          <Table>
            <THead>
              <tr>
                <TH>Material</TH>
                <TH align="right">For production</TH>
                <TH align="right">For forecast</TH>
                <TH align="right">Free stock</TH>
                <TH align="right">On order</TH>
                <TH align="right">To order</TH>
                <TH>Order by</TH>
                <TH>Supplier</TH>
              </tr>
            </THead>
            <TBody>
              {mrp.map((m) => (
                <TR key={m.stock_item_id}>
                  <TD>
                    <Link className="hover:text-accent-ink" href={`/inventory/materials/${m.material_id}`}>
                      {m.name}
                    </Link>{" "}
                    <span className="font-mono text-xs text-muted">{m.code}</span>
                  </TD>
                  <TD align="right">{formatQty(m.for_open_production)}</TD>
                  <TD align="right">{formatQty(m.for_forecast)}</TD>
                  <TD align="right">{formatQty(m.available)}</TD>
                  <TD align="right">{formatQty(m.on_order)}</TD>
                  <TD align="right" className={Number(m.net_requirement) > 0 ? "font-semibold" : "text-muted"}>
                    {formatQty(m.net_requirement)} {m.uom_code}
                  </TD>
                  <TD className={Number(m.net_requirement) > 0 && m.order_by <= today ? "font-medium text-danger-ink" : "text-muted"}>{Number(m.net_requirement) > 0 ? (m.order_by <= today ? "Now" : formatDate(m.order_by, df)) : "—"}</TD>
                  <TD className="text-muted">
                    {m.supplier ?? "—"}
                    {m.lead_time_days != null && ` · ${m.lead_time_days} d`}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>
    </>
  );
}
