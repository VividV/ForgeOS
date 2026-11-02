import { notFound } from "next/navigation";
import { Attachments } from "@/components/files/attachments";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader } from "@/components/ui/card";
import { PageHeader, Stat } from "@/components/ui/misc";
import { TBody, TD, TH, THead, TR, Table } from "@/components/ui/table";
import { getSession, requirePermission } from "@/lib/auth";
import { formatDateTime, formatMoney, formatQty } from "@/lib/format";
import { COUNT_STATUS } from "@/lib/labels";
import { CountActions } from "./actions";
import { CountSheet } from "./sheet";

type Line = { line_id: string; stock_item_id: string; code: string; name: string; uom_code: string; kind: string; expected: number | null; counted: number | null; note: string | null; adjustment: number | null; unit_cost: number | null };

export default async function CountPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requirePermission("inventory.read");
  const { supabase } = await getSession();
  const { data: c } = await supabase.from("stock_counts").select("*, warehouses(name), approver:profiles!stock_counts_approved_by_fkey(full_name)").eq("id", id).eq("organization_id", ctx.org.id).maybeSingle();
  if (!c) notFound();
  const { data } = await supabase.rpc("stock_count_sheet", { p_count: id });
  const lines = (data ?? []) as Line[];
  const st = COUNT_STATUS[c.status as keyof typeof COUNT_STATUS];
  const counted = lines.filter((l) => l.counted != null);
  const withDiff = counted.filter((l) => l.expected != null && Number(l.counted) !== Number(l.expected));
  const value = withDiff.reduce((s, l) => s + (Number(l.counted) - Number(l.expected)) * Number(l.unit_cost ?? 0), 0);
  const costs = ctx.can("costing.read");
  const df = ctx.settings.date_format;
  const tz = ctx.settings.timezone;
  return (
    <>
      <PageHeader
        title={c.number}
        meta={
          <>
            <Badge tone={st[1]}>{st[0]}</Badge>
            {c.blind && <Badge>Blind</Badge>}
          </>
        }
        breadcrumb={[{ label: "Stock counts", href: "/inventory/counts" }, { label: c.number }]}
        description={`${(c.warehouses as unknown as { name: string }).name} · started ${formatDateTime(c.started_at, df, tz)}${c.approved_at ? ` · approved ${formatDateTime(c.approved_at, df, tz)} by ${(c.approver as unknown as { full_name: string } | null)?.full_name ?? ""}` : ""}`}
        actions={<CountActions id={c.id} status={c.status} can={{ adjust: ctx.can("inventory.adjust"), approve: ctx.can("inventory.approve") }} />}
      />
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Items on the sheet" value={String(lines.length)} />
        <Stat label="Counted" value={String(counted.length)} />
        <Stat label="Items with a difference" value={lines.some((l) => l.expected == null) ? "Hidden" : String(withDiff.length)} tone={withDiff.length ? "warning" : undefined} />
        {costs && <Stat label="Value of differences" value={formatMoney(value, ctx.settings.currency)} tone={value < 0 ? "danger" : undefined} hint="At average cost" />}
      </div>
      {c.decision_note && <p className="mb-4 rounded-md bg-subtle px-3 py-2 text-[13px]">Note: {c.decision_note}</p>}
      <Card className="mb-4">
        <CardHeader title={c.status === "approved" ? "Result" : "Count sheet"} description={c.status === "in_progress" ? "Enter what you physically count. Leave an item blank if you didn't count it." : undefined} />
        {c.status === "approved" ? (
          <Table>
            <THead>
              <tr>
                <TH>Item</TH>
                <TH align="right">System at start</TH>
                <TH align="right">Counted</TH>
                <TH align="right">Adjusted by</TH>
                <TH>Note</TH>
              </tr>
            </THead>
            <TBody>
              {counted.map((l) => (
                <TR key={l.line_id}>
                  <TD>
                    {l.name} <span className="font-mono text-xs text-muted">{l.code}</span>
                  </TD>
                  <TD align="right">{formatQty(l.expected, 4)}</TD>
                  <TD align="right">
                    {formatQty(l.counted, 4)} {l.uom_code}
                  </TD>
                  <TD align="right" className={Number(l.adjustment) < 0 ? "text-danger-ink" : Number(l.adjustment) > 0 ? "text-success" : "text-muted"}>
                    {Number(l.adjustment) > 0 ? "+" : ""}
                    {formatQty(l.adjustment, 4)}
                  </TD>
                  <TD className="text-muted">{l.note ?? ""}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        ) : (
          <CountSheet countId={c.id} lines={lines} editable={c.status === "in_progress" && ctx.can("inventory.adjust")} />
        )}
      </Card>
      <Attachments entityType="stock_count" entityId={c.id} canUpload={ctx.can("inventory.adjust") && c.status !== "cancelled"} userId={ctx.user.id} title="Signed count sheets & photos" />
    </>
  );
}
