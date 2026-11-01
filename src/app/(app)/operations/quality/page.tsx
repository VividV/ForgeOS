import { ListChecks, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { RankBars } from "@/components/charts/charts";
import { ListToolbar } from "@/components/data/toolbar";
import { Pagination, parseList, range, type SearchParams } from "@/components/data/list";
import { Badge, QcResultBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { EmptyState, PageHeader, Stat } from "@/components/ui/misc";
import { TBody, TD, TH, THead, TR, Table } from "@/components/ui/table";
import { getSession, requirePermission } from "@/lib/auth";
import { formatDate, formatDateTime, formatPct, formatQty, todayIn } from "@/lib/format";

export const metadata = { title: "Quality control" };

export default async function QualityPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const ctx = await requirePermission("quality.read");
  const sp = await searchParams;
  const params = parseList(sp, { sortable: ["inspected_at"], defaultSort: "inspected_at", defaultDir: "desc", filters: ["result", "type"] });
  const { supabase } = await getSession();
  const tz = ctx.settings.timezone;
  const df = ctx.settings.date_format;
  const today = todayIn(tz);
  const from = new Date(Date.parse(today) - 29 * 86400000).toISOString().slice(0, 10);
  let q = supabase
    .from("quality_checks")
    .select("id, number, check_type, is_final, result, quantity_inspected, quantity_rejected, inspected_at, production_orders(number), goods_receipts(number), products(name), inspector:profiles!quality_checks_inspector_id_fkey(full_name)", { count: "exact" })
    .eq("organization_id", ctx.org.id);
  if (params.filters.result) q = q.eq("result", params.filters.result);
  if (params.filters.type) q = q.eq("check_type", params.filters.type);
  if (params.q) q = q.ilike("number", `%${params.q.replace(/[%_]/g, "")}%`);
  const [{ data, count }, { data: defects }, { data: actions }, { data: recent }] = await Promise.all([
    q.order("inspected_at", { ascending: params.dir === "asc" }).range(...range(params)),
    supabase.rpc("defect_summary", { p_org: ctx.org.id, p_from: from, p_to: today }),
    supabase
      .from("corrective_actions")
      .select("id, description, status, due_date, quality_check_id, quality_checks(number), assignee:profiles!corrective_actions_assigned_to_fkey(full_name)")
      .eq("organization_id", ctx.org.id)
      .in("status", ["open", "in_progress"])
      .order("due_date", { ascending: true, nullsFirst: false })
      .limit(10),
    supabase.from("quality_checks").select("quantity_inspected, quantity_rejected, result").eq("organization_id", ctx.org.id).gte("inspected_at", from),
  ]);
  const insp = (recent ?? []).reduce((a, r) => a + Number(r.quantity_inspected), 0);
  const rej = (recent ?? []).reduce((a, r) => a + Number(r.quantity_rejected), 0);
  const fails = (recent ?? []).filter((r) => r.result === "fail").length;
  const byCat = new Map<string, number>();
  for (const d of (defects ?? []) as { category: string; quantity: number }[]) byCat.set(d.category, (byCat.get(d.category) ?? 0) + Number(d.quantity));
  const chart = [...byCat.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([label, value]) => ({ label, value }));

  return (
    <>
      <PageHeader
        title="Quality control"
        description="Inspections, defects and corrective actions across production and incoming goods."
        actions={
          <Button asChild>
            <Link href="/operations/quality/templates">
              <ListChecks /> Checklists
            </Link>
          </Button>
        }
      />
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Units inspected (30 days)" value={formatQty(insp, 0)} />
        <Stat label="Reject rate (30 days)" value={insp ? formatPct((rej / insp) * 100) : "—"} tone={insp && rej / insp > 0.05 ? "danger" : undefined} />
        <Stat label="Failed inspections (30 days)" value={String(fails)} tone={fails ? "warning" : undefined} />
        <Stat label="Open corrective actions" value={String((actions ?? []).length)} tone={(actions ?? []).some((a) => a.due_date && a.due_date < today) ? "danger" : undefined} />
      </div>
      <div className="mb-4 grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader title="Defects by category" description="Last 30 days, units affected" />
          <CardBody>
            <RankBars data={chart} empty="No defects recorded" />
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Open corrective actions" />
          {(actions ?? []).length === 0 ? (
            <EmptyState title="Nothing open" />
          ) : (
            <Table>
              <TBody>
                {(actions ?? []).map((a) => {
                  const late = a.due_date && a.due_date < today;
                  return (
                    <TR key={a.id}>
                      <TD>
                        <Link href={`/operations/quality/${a.quality_check_id}`} className="hover:text-accent-ink">
                          {a.description}
                        </Link>
                        <div className="text-xs text-muted">
                          {(a.quality_checks as unknown as { number: string }).number} · {(a.assignee as unknown as { full_name: string } | null)?.full_name ?? "Unassigned"}
                        </div>
                      </TD>
                      <TD className={late ? "font-medium text-danger-ink" : "text-muted"}>{formatDate(a.due_date, df)}</TD>
                      <TD>{a.status === "in_progress" ? <Badge tone="info">In progress</Badge> : <Badge tone={late ? "danger" : "warning"}>{late ? "Overdue" : "Open"}</Badge>}</TD>
                    </TR>
                  );
                })}
              </TBody>
            </Table>
          )}
        </Card>
      </div>
      <Card>
        <ListToolbar
          placeholder="Search QC number"
          filters={[
            { name: "type", label: "Type", options: [{ value: "production", label: "Production" }, { value: "goods_receipt", label: "Goods received" }] },
            { name: "result", label: "Result", options: [{ value: "pass", label: "Pass" }, { value: "fail", label: "Fail" }, { value: "conditional", label: "Conditional" }] },
          ]}
        />
        {(data ?? []).length === 0 ? (
          <EmptyState icon={<ShieldCheck />} title="No inspections yet" description="Record inspections from a production order or a goods receipt." />
        ) : (
          <Table>
            <THead>
              <tr>
                <TH>Number</TH>
                <TH>Source</TH>
                <TH>Inspected</TH>
                <TH>Inspector</TH>
                <TH align="right">Inspected</TH>
                <TH align="right">Rejected</TH>
                <TH>Result</TH>
              </tr>
            </THead>
            <TBody>
              {(data ?? []).map((c) => (
                <TR key={c.id}>
                  <TD>
                    <Link href={`/operations/quality/${c.id}`} className="font-medium hover:text-accent-ink">
                      {c.number}
                    </Link>
                  </TD>
                  <TD>
                    {c.check_type === "production" ? (
                      <>
                        {(c.production_orders as unknown as { number: string } | null)?.number} <span className="text-muted">· {(c.products as unknown as { name: string } | null)?.name}</span> {c.is_final && <Badge>Final</Badge>}
                      </>
                    ) : (
                      <>Delivery {(c.goods_receipts as unknown as { number: string } | null)?.number}</>
                    )}
                  </TD>
                  <TD className="text-muted">{formatDateTime(c.inspected_at, df, tz)}</TD>
                  <TD className="text-muted">{(c.inspector as unknown as { full_name: string } | null)?.full_name}</TD>
                  <TD align="right">{formatQty(c.quantity_inspected)}</TD>
                  <TD align="right" className={Number(c.quantity_rejected) > 0 ? "text-danger-ink" : "text-muted"}>
                    {formatQty(c.quantity_rejected)}
                  </TD>
                  <TD>
                    <QcResultBadge result={c.result} />
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
        <Pagination params={params} total={count ?? 0} base="/operations/quality" sp={sp} />
      </Card>
    </>
  );
}
