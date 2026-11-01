import { Download } from "lucide-react";
import Link from "next/link";
import type { SearchParams } from "@/components/data/list";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/form";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { TBody, TD, TH, THead, TR, Table } from "@/components/ui/table";
import { getSession, requirePermission } from "@/lib/auth";
import { formatDate, formatMoney, formatPct, formatQty, todayIn } from "@/lib/format";
import { REPORTS, buildReport, type ReportKey } from "@/lib/services/reports";
import { lookups } from "@/lib/services/lookups";
import { cn } from "@/lib/utils";
import { PrintReport } from "./print";

export const metadata = { title: "Operational reports" };
const s = (v: SearchParams[string]) => (Array.isArray(v) ? v[0] : v) ?? "";
const isDate = (d: string) => /^\d{4}-\d{2}-\d{2}$/.test(d);

export default async function ReportsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const ctx = await requirePermission("reports.read");
  const sp = await searchParams;
  const available = REPORTS.filter((r) => r.perm.some((p) => ctx.can(p)) && (!r.costs || ctx.can("costing.read")));
  const key = (available.find((r) => r.key === s(sp.report))?.key ?? available[0]?.key) as ReportKey | undefined;
  const today = todayIn(ctx.settings.timezone);
  const preset = s(sp.preset);
  let from = isDate(s(sp.from)) ? s(sp.from) : new Date(Date.now() - 6 * 86400000).toISOString().slice(0, 10);
  let to = isDate(s(sp.to)) ? s(sp.to) : today;
  if (preset === "today") from = to = today;
  if (preset === "week") {
    from = new Date(Date.now() - 6 * 86400000).toISOString().slice(0, 10);
    to = today;
  }
  if (preset === "month") {
    from = `${today.slice(0, 7)}-01`;
    to = today;
  }
  const factory = s(sp.factory) || null;
  const { supabase } = await getSession();
  const costs = ctx.can("costing.read");
  const [report, { factories }] = await Promise.all([
    key ? buildReport(supabase, ctx.org.id, key, { from, to, factory, costs }) : Promise.resolve(null),
    lookups(ctx.org.id, ["factories"]),
  ]);
  const meta = REPORTS.find((r) => r.key === key);
  const cur = ctx.settings.currency;
  const fmt = (v: unknown, kind?: string) =>
    v === null || v === undefined ? "—" : kind === "money" ? formatMoney(v as number, cur) : kind === "qty" ? formatQty(v as number) : kind === "pct" ? formatPct(v as number) : kind === "date" ? formatDate(String(v), ctx.settings.date_format) : String(v);
  const qs = new URLSearchParams({ report: key ?? "", from, to, ...(factory ? { factory } : {}) }).toString();

  return (
    <>
      <PageHeader
        title="Operational reports"
        description="Every report is computed from your records at the moment you open it."
        actions={
          key &&
          report && (
            <>
              <PrintReport />
              {ctx.can("reports.export") && (
                <Button asChild variant="primary">
                  {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- file download, not a page */}
                  <a href={`/api/export/report?${qs}`}>
                    <Download /> Export CSV
                  </a>
                </Button>
              )}
            </>
          )
        }
      />
      <div className="grid gap-4 lg:grid-cols-[240px_minmax(0,1fr)]">
        <Card className="no-print h-fit">
          <ul className="p-1.5">
            {available.map((r) => (
              <li key={r.key}>
                <Link href={`/intelligence/reports?report=${r.key}&from=${from}&to=${to}${factory ? `&factory=${factory}` : ""}`} className={cn("block rounded-md px-2.5 py-2 text-[13px]", r.key === key ? "bg-accent-soft font-medium text-accent-ink" : "hover:bg-subtle")}>
                  {r.title}
                </Link>
              </li>
            ))}
          </ul>
        </Card>
        <Card>
          {!meta || !report ? (
            <EmptyState title="No reports available for your role" />
          ) : (
            <>
              <CardHeader title={meta.title} description={`${meta.description} ${meta.key === "valuation" ? "As of now." : `${formatDate(from, ctx.settings.date_format)} – ${formatDate(to, ctx.settings.date_format)}.`}`} />
              {meta.key !== "valuation" && (
                <form className="no-print flex flex-wrap items-end gap-2 border-b border-line p-3">
                  <input type="hidden" name="report" value={key} />
                  <label className="text-xs text-muted">
                    From
                    <Input type="date" name="from" defaultValue={from} className="mt-1 h-8 w-40" />
                  </label>
                  <label className="text-xs text-muted">
                    To
                    <Input type="date" name="to" defaultValue={to} className="mt-1 h-8 w-40" />
                  </label>
                  <label className="text-xs text-muted">
                    Factory
                    <Select name="factory" defaultValue={factory ?? ""} className="mt-1 h-8 w-44">
                      <option value="">All factories</option>
                      {factories.map((f) => (
                        <option key={f.value} value={f.value}>
                          {f.label}
                        </option>
                      ))}
                    </Select>
                  </label>
                  <Button type="submit" size="sm">
                    Apply
                  </Button>
                  <div className="ml-auto flex gap-1 text-xs">
                    {[
                      ["today", "Daily"],
                      ["week", "Weekly"],
                      ["month", "Monthly"],
                    ].map(([p, l]) => (
                      <Link key={p} href={`/intelligence/reports?report=${key}&preset=${p}${factory ? `&factory=${factory}` : ""}`} className="rounded border border-line px-2 py-1 hover:bg-subtle">
                        {l}
                      </Link>
                    ))}
                  </div>
                </form>
              )}
              {report.rows.length === 0 ? (
                <EmptyState title="No records in this period" />
              ) : (
                <Table>
                  <THead>
                    <tr>
                      {report.columns.map((c) => (
                        <TH key={c.key} align={c.kind && c.kind !== "text" && c.kind !== "date" ? "right" : undefined}>
                          {c.label}
                        </TH>
                      ))}
                    </tr>
                  </THead>
                  <TBody>
                    {report.rows.slice(0, 500).map((r, i) => (
                      <TR key={i}>
                        {report.columns.map((c) => (
                          <TD key={c.key} align={c.kind && c.kind !== "text" && c.kind !== "date" ? "right" : undefined}>
                            {fmt(r[c.key], c.kind)}
                          </TD>
                        ))}
                      </TR>
                    ))}
                  </TBody>
                  {report.totals && (
                    <tfoot>
                      <tr className="border-t border-line-strong font-medium">
                        {report.columns.map((c, i) => (
                          <td key={c.key} className={cn("px-3 py-2.5 text-[13px]", c.kind && c.kind !== "text" && c.kind !== "date" && "tabular text-right")}>
                            {i === 0 ? "Total" : c.key in report.totals! ? fmt(report.totals![c.key], c.kind) : ""}
                          </td>
                        ))}
                      </tr>
                    </tfoot>
                  )}
                </Table>
              )}
              {report.rows.length > 500 && <p className="border-t border-line px-3 py-2 text-xs text-muted">Showing the first 500 of {report.rows.length} rows. Export CSV for the full report.</p>}
            </>
          )}
        </Card>
      </div>
    </>
  );
}
