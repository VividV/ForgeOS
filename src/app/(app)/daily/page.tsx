import Link from "next/link";
import type { SearchParams } from "@/components/data/list";
import { Card, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/form";
import { EmptyState, PageHeader, Stat } from "@/components/ui/misc";
import { TBody, TD, TH, THead, TR, Table } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { getSession, requirePermission } from "@/lib/auth";
import { formatDate, formatQty, todayIn } from "@/lib/format";

export const metadata = { title: "Daily production" };

function dayBounds(day: string, tz: string) {
  // find the UTC instant of local midnight by probing the offset
  const probe = new Date(`${day}T12:00:00Z`);
  const local = new Date(probe.toLocaleString("en-US", { timeZone: tz }));
  const offset = local.getTime() - probe.getTime();
  const start = new Date(new Date(`${day}T00:00:00Z`).getTime() - offset);
  return [start.toISOString(), new Date(start.getTime() + 86400000).toISOString()] as const;
}

export default async function DailyPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const ctx = await requirePermission("production_orders.read");
  const sp = await searchParams;
  const tz = ctx.settings.timezone;
  const day = typeof sp.day === "string" && /^\d{4}-\d{2}-\d{2}$/.test(sp.day) ? sp.day : todayIn(tz);
  const [from, to] = dayBounds(day, tz);
  const { supabase } = await getSession();
  const [{ data: logs }, { data: outputs }, { data: downtime }] = await Promise.all([
    supabase
      .from("production_logs")
      .select("quantity_good, quantity_rejected, production_order_id, production_orders(number, products(name)), production_operations(name, sequence), profiles:created_by(full_name)")
      .eq("organization_id", ctx.org.id)
      .in("log_type", ["progress", "defect"])
      .gte("occurred_at", from)
      .lt("occurred_at", to),
    supabase.from("production_outputs").select("quantity_good, quantity_rejected, production_orders(id, number, products(name))").eq("organization_id", ctx.org.id).gte("recorded_at", from).lt("recorded_at", to),
    supabase.from("downtime_logs").select("minutes, reason, work_centres(name)").eq("organization_id", ctx.org.id).gte("started_at", from).lt("started_at", to),
  ]);

  type Row = { order: string; orderId: string; product: string; step: string; seq: number; good: number; rejected: number };
  const byStep = new Map<string, Row>();
  const byPerson = new Map<string, { good: number; rejected: number }>();
  for (const l of logs ?? []) {
    const po = l.production_orders as unknown as { number: string; products: { name: string } };
    const op = l.production_operations as unknown as { name: string; sequence: number } | null;
    const k = `${l.production_order_id}:${op?.sequence ?? 0}`;
    const r = byStep.get(k) ?? { order: po.number, orderId: l.production_order_id, product: po.products.name, step: op?.name ?? "—", seq: op?.sequence ?? 0, good: 0, rejected: 0 };
    r.good += Number(l.quantity_good ?? 0);
    r.rejected += Number(l.quantity_rejected ?? 0);
    byStep.set(k, r);
    const who = (l.profiles as unknown as { full_name: string } | null)?.full_name || "Unknown";
    const pr = byPerson.get(who) ?? { good: 0, rejected: 0 };
    pr.good += Number(l.quantity_good ?? 0);
    pr.rejected += Number(l.quantity_rejected ?? 0);
    byPerson.set(who, pr);
  }
  const rows = [...byStep.values()].sort((a, b) => a.order.localeCompare(b.order) || a.seq - b.seq);
  const totalGood = rows.reduce((s, r) => s + r.good, 0);
  const totalRej = rows.reduce((s, r) => s + r.rejected, 0);
  const stocked = (outputs ?? []).reduce((s, o) => s + Number(o.quantity_good), 0);
  const downMin = (downtime ?? []).reduce((s, d) => s + d.minutes, 0);
  const canPeople = ctx.can("reports.read");

  return (
    <>
      <PageHeader
        title="Daily production"
        description={`What happened on the floor on ${formatDate(day, ctx.settings.date_format)}.`}
        actions={
          <form className="flex items-center gap-2">
            <Input type="date" name="day" defaultValue={day} className="w-40" aria-label="Day" />
            <Button type="submit">Show</Button>
          </form>
        }
      />
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Units processed (all steps)" value={formatQty(totalGood)} />
        <Stat label="Rejected at steps" value={formatQty(totalRej)} tone={totalRej > 0 ? "warning" : undefined} />
        <Stat label="Finished goods stocked" value={formatQty(stocked)} hint={`${(outputs ?? []).length} order(s) completed`} />
        <Stat label="Downtime" value={`${downMin} min`} tone={downMin > 0 ? "warning" : undefined} />
      </div>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
        <Card>
          <CardHeader title="Output by order and step" />
          {rows.length === 0 ? (
            <EmptyState title="No production recorded on this day" />
          ) : (
            <Table>
              <THead>
                <tr>
                  <TH>Order</TH>
                  <TH>Product</TH>
                  <TH>Step</TH>
                  <TH align="right">Good</TH>
                  <TH align="right">Rejected</TH>
                </tr>
              </THead>
              <TBody>
                {rows.map((r, i) => (
                  <TR key={i}>
                    <TD>
                      <Link href={`/operations/production-orders/${r.orderId}`} className="font-medium hover:text-accent-ink">
                        {r.order}
                      </Link>
                    </TD>
                    <TD>{r.product}</TD>
                    <TD className="text-muted">
                      {r.seq}. {r.step}
                    </TD>
                    <TD align="right">{formatQty(r.good)}</TD>
                    <TD align="right">{formatQty(r.rejected)}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </Card>
        <div className="flex flex-col gap-4">
          {canPeople && (
            <Card>
              <CardHeader title="Recorded by" description="Visible to report readers only" />
              {byPerson.size === 0 ? (
                <EmptyState title="—" />
              ) : (
                <Table>
                  <TBody>
                    {[...byPerson.entries()].sort((a, b) => b[1].good - a[1].good).map(([who, v]) => (
                      <TR key={who}>
                        <TD>{who}</TD>
                        <TD align="right">{formatQty(v.good)} good</TD>
                        <TD align="right" className="text-muted">
                          {formatQty(v.rejected)} rej.
                        </TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
              )}
            </Card>
          )}
          <Card>
            <CardHeader title="Downtime" />
            {(downtime ?? []).length === 0 ? (
              <EmptyState title="No downtime recorded" />
            ) : (
              <ul className="divide-y divide-line">
                {(downtime ?? []).map((d, i) => (
                  <li key={i} className="flex justify-between gap-2 px-4 py-2 text-[13px]">
                    <span>
                      {d.reason}
                      {(d.work_centres as unknown as { name: string } | null) && <span className="text-muted"> · {(d.work_centres as unknown as { name: string }).name}</span>}
                    </span>
                    <span className="tabular">{d.minutes} min</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
