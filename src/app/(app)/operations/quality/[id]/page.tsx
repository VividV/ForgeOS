import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge, QcResultBadge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader, DescriptionList } from "@/components/ui/card";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { TBody, TD, TH, THead, TR, Table } from "@/components/ui/table";
import { getSession, requirePermission } from "@/lib/auth";
import { formatDate, formatDateTime, formatQty, todayIn } from "@/lib/format";
import { ActionControls } from "./controls";

const SEV = { minor: "neutral", major: "warning", critical: "danger" } as const;

export default async function QualityCheckPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requirePermission("quality.read");
  const { supabase } = await getSession();
  const { data: c } = await supabase
    .from("quality_checks")
    .select("*, production_orders(id, number), production_operations(name, sequence), goods_receipts(id, number), products(name), quality_templates(name), inspector:profiles!quality_checks_inspector_id_fkey(full_name), approver:profiles!quality_checks_approved_by_fkey(full_name)")
    .eq("id", id)
    .eq("organization_id", ctx.org.id)
    .maybeSingle();
  if (!c) notFound();
  const [{ data: items }, { data: defects }, { data: actions }] = await Promise.all([
    supabase.from("quality_check_items").select("*").eq("quality_check_id", id),
    supabase.from("quality_defects").select("*").eq("quality_check_id", id).order("created_at"),
    supabase.from("corrective_actions").select("*, assignee:profiles!corrective_actions_assigned_to_fkey(full_name), completer:profiles!corrective_actions_completed_by_fkey(full_name)").eq("quality_check_id", id).order("created_at"),
  ]);
  const df = ctx.settings.date_format;
  const tz = ctx.settings.timezone;
  const today = todayIn(tz);
  const po = c.production_orders as unknown as { id: string; number: string } | null;
  const gr = c.goods_receipts as unknown as { id: string; number: string } | null;
  const op = c.production_operations as unknown as { name: string; sequence: number } | null;
  return (
    <>
      <PageHeader
        title={c.number}
        meta={
          <>
            <QcResultBadge result={c.result} />
            {c.is_final && <Badge>Final inspection</Badge>}
          </>
        }
        breadcrumb={[{ label: "Quality control", href: "/operations/quality" }, { label: c.number }]}
        description={c.check_type === "production" ? `Production · ${po?.number ?? ""} · ${(c.products as unknown as { name: string } | null)?.name ?? ""}` : `Goods received · ${gr?.number ?? ""}`}
      />
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="flex flex-col gap-4">
          {(items ?? []).length > 0 && (
            <Card>
              <CardHeader title="Checklist" description={(c.quality_templates as unknown as { name: string } | null)?.name} />
              <Table>
                <TBody>
                  {(items ?? []).map((i) => (
                    <TR key={i.id}>
                      <TD>{i.name}</TD>
                      <TD className="text-muted">{i.value ?? ""}</TD>
                      <TD>{i.result === "pass" ? <Badge tone="success">Pass</Badge> : i.result === "fail" ? <Badge tone="danger">Fail</Badge> : <Badge>N/A</Badge>}</TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </Card>
          )}
          <Card>
            <CardHeader title="Defects" />
            {(defects ?? []).length === 0 ? (
              <EmptyState title="No defects logged" />
            ) : (
              <Table>
                <THead>
                  <tr>
                    <TH>Category</TH>
                    <TH>Severity</TH>
                    <TH align="right">Units</TH>
                    <TH>Description</TH>
                  </tr>
                </THead>
                <TBody>
                  {(defects ?? []).map((d) => (
                    <TR key={d.id}>
                      <TD className="font-medium">{d.category}</TD>
                      <TD>
                        <Badge tone={SEV[d.severity as keyof typeof SEV]}>{d.severity}</Badge>
                      </TD>
                      <TD align="right">{formatQty(d.quantity)}</TD>
                      <TD className="text-muted">{d.description ?? "—"}</TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            )}
          </Card>
          <Card>
            <CardHeader title="Corrective actions" />
            {(actions ?? []).length === 0 ? (
              <EmptyState title="No corrective actions" />
            ) : (
              <ul className="divide-y divide-line">
                {(actions ?? []).map((a) => {
                  const late = a.due_date && a.due_date < today && ["open", "in_progress"].includes(a.status);
                  const mine = a.assigned_to === ctx.user.id;
                  return (
                    <li key={a.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <p className="text-[13px] font-medium">{a.description}</p>
                        <p className="text-xs text-muted">
                          {(a.assignee as unknown as { full_name: string } | null)?.full_name ?? "Unassigned"} · Due <span className={late ? "font-medium text-danger-ink" : ""}>{formatDate(a.due_date, df)}</span>
                        </p>
                        {a.resolution && (
                          <p className="mt-1 text-xs">
                            <span className="text-muted">Resolution:</span> {a.resolution}
                            {a.completed_at && <span className="text-muted"> · {(a.completer as unknown as { full_name: string } | null)?.full_name}, {formatDateTime(a.completed_at, df, tz)}</span>}
                          </p>
                        )}
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        {a.status === "done" ? <Badge tone="success">Done</Badge> : a.status === "cancelled" ? <Badge>Cancelled</Badge> : a.status === "in_progress" ? <Badge tone="info">In progress</Badge> : <Badge tone={late ? "danger" : "warning"}>{late ? "Overdue" : "Open"}</Badge>}
                        {["open", "in_progress"].includes(a.status) && (mine || ctx.can("quality.approve")) && <ActionControls id={a.id} status={a.status} canCancel={ctx.can("quality.approve")} />}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        </div>
        <Card>
          <CardHeader title="Inspection" />
          <CardBody>
            <DescriptionList
              className="sm:grid-cols-1"
              items={[
                { label: "Source", value: po ? <Link className="text-accent-ink hover:underline" href={`/operations/production-orders/${po.id}`}>{po.number}</Link> : gr ? <Link className="text-accent-ink hover:underline" href={`/commerce/goods-received/${gr.id}`}>{gr.number}</Link> : "—" },
                ...(op ? [{ label: "Step", value: `${op.sequence}. ${op.name}` }] : []),
                { label: "Inspected", value: formatDateTime(c.inspected_at, df, tz) },
                { label: "Inspector", value: (c.inspector as unknown as { full_name: string } | null)?.full_name },
                { label: "Quantity", value: `${formatQty(c.quantity_inspected)} inspected · ${formatQty(c.quantity_passed)} passed · ${formatQty(c.quantity_rejected)} rejected` },
                ...(c.result === "conditional" ? [{ label: "Concession", value: `${c.conditional_note ?? ""}${c.approver ? ` (approved by ${(c.approver as unknown as { full_name: string }).full_name})` : ""}` }] : []),
                { label: "Notes", value: c.notes },
              ]}
            />
          </CardBody>
        </Card>
      </div>
    </>
  );
}
