import { FilePlus, Printer } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { InspectionDialog } from "@/components/quality/inspection-dialog";
import { Badge, PriorityBadge, ProductionStatusBadge, QcResultBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, DescriptionList } from "@/components/ui/card";
import { EmptyState, PageHeader, Progress, Stat } from "@/components/ui/misc";
import { TBody, TD, TH, THead, TR, Table } from "@/components/ui/table";
import { getSession, requirePermission } from "@/lib/auth";
import { formatDate, formatDateTime, formatMoney, formatQty, relativeTime, todayIn } from "@/lib/format";
import { lookups } from "@/lib/services/lookups";
import { inspectionTemplates } from "@/lib/services/quality";
import { CostEntryButtons, RemoveCostEntry } from "./costing";
import { CompleteDialog, DowntimeDialog, EditOrderDialog, IssueDialog, JobCardDialog, NoteForm, OperationActions, OrderActions, ReturnDialog, WastageDialog } from "./client";

const LOG_LABEL: Record<string, string> = {
  progress: "Progress", note: "Note", defect: "Defects", shortage: "Shortage", downtime: "Downtime", start: "Started", pause: "Paused",
  resume: "Resumed", complete: "Job completed", material_issue: "Material issued", material_return: "Material returned", wastage: "Wastage",
  transfer: "Moved to next step", output: "Final output", status: "Status",
};

export default async function OrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requirePermission("production_orders.read");
  const { supabase } = await getSession();
  const { data: o } = await supabase
    .from("production_orders")
    .select("*, products(id, name, code, units_of_measure(code)), product_variants(name, is_default), factories(name), material_wh:warehouses!production_orders_organization_id_material_warehouse_id_fkey(name), output_wh:warehouses!production_orders_organization_id_output_warehouse_id_fkey(name), manager:profiles!production_orders_manager_profile_fk(full_name)")
    .eq("id", id)
    .eq("organization_id", ctx.org.id)
    .maybeSingle();
  if (!o) notFound();

  const [{ data: mats }, { data: ops }, { data: cards }, { data: logs }, { data: outputs }, { data: avail }, opts] = await Promise.all([
    supabase.from("production_material_reconciliation").select("*").eq("production_order_id", id).order("line_no"),
    supabase.from("production_operations").select("*, production_stages(name), work_centres(name)").eq("production_order_id", id).order("sequence"),
    supabase.from("job_cards").select("*, assignee:profiles!job_cards_assignee_profile_fk(full_name)").eq("production_order_id", id).order("issued_at"),
    supabase.from("production_logs").select("*, profiles:created_by(full_name), production_operations(name)").eq("production_order_id", id).order("occurred_at", { ascending: false }).limit(60),
    supabase.from("production_outputs").select("*").eq("production_order_id", id),
    supabase.from("inventory_balances").select("stock_item_id, available").eq("warehouse_id", o.material_warehouse_id),
    lookups(ctx.org.id, ["members", "workCentres"]),
  ]);
  const qRead = ctx.can("quality.read");
  const costs = ctx.can("costing.read");
  const [{ data: checks }, { data: qTotals }, templates, { data: costData }] = await Promise.all([
    qRead
      ? supabase.from("quality_checks").select("id, number, is_final, result, quantity_inspected, quantity_passed, quantity_rejected, inspected_at, production_operations(name)").eq("production_order_id", id).order("inspected_at", { ascending: false })
      : Promise.resolve({ data: [] as never[] }),
    supabase.from("production_inspection_totals").select("inspections, passed, rejected").eq("production_order_id", id).maybeSingle(),
    ctx.can("quality.create") ? inspectionTemplates(ctx.org.id, "production", (o.products as unknown as { id: string }).id) : Promise.resolve([]),
    costs ? supabase.rpc("production_cost_summary", { p_order: id }) : Promise.resolve({ data: null }),
  ]);
  const product = o.products as unknown as { id: string; name: string; code: string; units_of_measure: { code: string } };
  const variant = o.product_variants as unknown as { name: string; is_default: boolean } | null;
  const uom = product.units_of_measure.code;
  const cur = ctx.settings.currency;
  const df = ctx.settings.date_format;
  const tz = ctx.settings.timezone;
  type Mat = { id: string; line_no: number; stock_item_id: string; code: string; name: string; uom_code: string; quantity_per_unit: number; wastage_pct: number; quantity_required: number; quantity_reserved: number; quantity_issued: number; quantity_returned: number; quantity_wasted: number; quantity_consumed: number; standard_for_actual_output: number; usage_variance: number; estimated_unit_cost: number; actual_cost: number; estimated_cost: number };
  const materials = (mats ?? []) as Mat[];
  const availBy = new Map((avail ?? []).map((a) => [a.stock_item_id, Number(a.available)]));
  type Op = { id: string; sequence: number; name: string; status: string; quantity_completed: number; quantity_rejected: number; instructions: string | null; requires_quality_check: boolean; production_stages: { name: string }; work_centres: { name: string } | null; started_at: string | null; completed_at: string | null };
  const operations = (ops ?? []) as unknown as Op[];
  const active = operations.filter((x) => x.status !== "skipped");
  const lastGood = o.status === "completed" ? Number(o.quantity_completed) : Number(active.at(-1)?.quantity_completed ?? 0);
  const pct = (lastGood / Number(o.quantity_planned)) * 100;
  const today = todayIn(tz);
  const late = o.due_date && o.due_date < today && !["completed", "cancelled", "draft"].includes(o.status);
  const current = active.find((x) => x.status !== "completed");
  const isOpen = !["completed", "cancelled"].includes(o.status);
  const executing = ["ready_to_start", "in_progress", "paused", "quality_inspection", "materials_pending"].includes(o.status);
  const can = {
    update: ctx.can("production_orders.update"),
    approve: ctx.can("production_orders.approve"),
    manage: ctx.can("production_orders.manage"),
    cancel: ctx.can("production_orders.delete"),
    jobs: ctx.can("job_cards.create"),
  };
  const issuedTotal = materials.reduce((s, m) => s + Number(m.actual_cost), 0);
  const estimatedTotal = materials.reduce((s, m) => s + Number(m.estimated_cost), 0);
  const output = (outputs ?? [])[0];
  const maxByMaterial = materials.length
    ? Math.min(...materials.map((m) => (Number(m.quantity_issued) - Number(m.quantity_returned)) / Number(m.quantity_per_unit)))
    : 0;
  const matOpts = materials.map((m) => ({ id: m.id, name: m.name, uom: m.uom_code, reserved: Number(m.quantity_reserved), issued: Number(m.quantity_issued), returned: Number(m.quantity_returned), wasted: Number(m.quantity_wasted), required: Number(m.quantity_required), available: availBy.get(m.stock_item_id) ?? 0 }));
  const opOpts = operations.map((x) => ({ value: x.id, label: `${x.sequence}. ${x.name}` }));
  const inspection = qTotals && Number(qTotals.inspections) > 0 ? { passed: Number(qTotals.passed), rejected: Number(qTotals.rejected) } : null;
  type Cost = { material: number; labour: number; labour_hours: number; machine: number; overhead: number; allocated_overhead?: number; other: number; total: number; unit_cost: number | null };
  type CostSummary = {
    final: boolean; selling_price: number | null; labour_rate: number | null; quantity_accepted: number;
    estimate: Cost; actual: Cost;
    labour_entries: { id: string; type: string; hours: number; rate: number; amount: number; worker: string | null; operation: string | null; work_centre: string | null; date: string; notes: string | null }[];
    overhead_entries: { id: string; category: string; description: string; amount: number; allocated: boolean }[];
  };
  const cs = costData as CostSummary | null;
  const hasShortage = materials.some((m) => Number(m.quantity_required) - Number(m.quantity_reserved) - Number(m.quantity_issued) > 0.0001);
  const canCostEdit = ctx.can("costing.manage") && isOpen && !["draft", "awaiting_approval"].includes(o.status);

  return (
    <>
      <PageHeader
        title={o.number}
        meta={
          <>
            <ProductionStatusBadge status={o.status} />
            <PriorityBadge priority={o.priority} />
            {late && <Badge tone="danger">Overdue</Badge>}
          </>
        }
        breadcrumb={[{ label: "Production orders", href: "/operations/production-orders" }, { label: o.number }]}
        description={`${product.name}${variant && !variant.is_default ? ` · ${variant.name}` : ""} · ${formatQty(o.quantity_planned)} ${uom} · ${(o.factories as unknown as { name: string }).name}`}
        actions={
          <>
            <OrderActions id={o.id} status={o.status} can={can} />
            {isOpen && can.manage && (o.status === "in_progress" || o.status === "quality_inspection") && (
              <CompleteDialog id={o.id} planned={Number(o.quantity_planned)} lastStepGood={lastGood} lastStepRejected={active.reduce((s, x) => s + Number(x.quantity_rejected), 0)} maxByMaterial={maxByMaterial} canException={can.approve} uom={uom} inspection={inspection} requireFinal={ctx.settings.require_final_inspection} />
            )}
          </>
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Stat label="Planned" value={`${formatQty(o.quantity_planned)} ${uom}`} />
        <Stat label={o.status === "completed" ? "Accepted output" : "Through last step"} value={formatQty(lastGood)} tone={o.status === "completed" ? "success" : undefined} />
        <Stat label="Rejected" value={formatQty(o.status === "completed" ? o.quantity_rejected : active.reduce((s, x) => s + Number(x.quantity_rejected), 0))} />
        <Stat label="Due" value={formatDate(o.due_date, df)} tone={late ? "danger" : undefined} hint={o.planned_start_date ? `Start ${formatDate(o.planned_start_date, df)}` : undefined} />
        <div className="col-span-2 rounded-lg border border-line bg-surface p-4 shadow-card lg:col-span-1">
          <p className="text-xs font-medium text-muted">Completion</p>
          <p className="tabular mt-1.5 text-2xl font-semibold">{Math.round(pct)}%</p>
          <Progress value={pct} className="mt-2" tone={o.status === "completed" ? "success" : late ? "danger" : "accent"} />
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader
              title="Materials"
              description={`From BOM v${o.bom_version} (snapshot taken ${formatDate(o.created_at, df, tz)}). Taken from ${(o.material_wh as unknown as { name: string }).name}.`}
              action={
                isOpen && (executing || hasShortage) && (
                  <>
                    {hasShortage && ctx.can("requisitions.create") && !["draft", "awaiting_approval"].includes(o.status) && (
                      <Button asChild size="sm">
                        <Link href={`/commerce/requisitions/new?order=${o.id}`}>
                          <FilePlus /> Request materials
                        </Link>
                      </Button>
                    )}
                    {executing && can.manage && <IssueDialog id={o.id} materials={matOpts} operations={opOpts} />}
                    {executing && can.manage && <ReturnDialog id={o.id} materials={matOpts} />}
                    {executing && can.update && <WastageDialog id={o.id} materials={matOpts} operations={opOpts} />}
                  </>
                )
              }
            />
            <Table>
              <THead>
                <tr>
                  <TH>Material</TH>
                  <TH align="right">Required</TH>
                  <TH align="right">Reserved</TH>
                  <TH align="right">Issued</TH>
                  <TH align="right">Returned</TH>
                  <TH align="right">Wasted</TH>
                  {isOpen ? <TH align="right">Available in store</TH> : <TH align="right">Variance vs standard</TH>}
                  {costs && <TH align="right">Actual cost</TH>}
                </tr>
              </THead>
              <TBody>
                {materials.map((m) => {
                  const short = Number(m.quantity_required) - Number(m.quantity_reserved) - Number(m.quantity_issued);
                  return (
                    <TR key={m.id}>
                      <TD>
                        {m.name} <span className="font-mono text-xs text-muted">{m.code}</span>
                        <p className="text-xs text-muted">
                          {formatQty(m.quantity_per_unit, 4)} {m.uom_code}/unit{Number(m.wastage_pct) > 0 ? ` + ${formatQty(m.wastage_pct)}% wastage` : ""}
                        </p>
                      </TD>
                      <TD align="right">{formatQty(m.quantity_required, 4)}</TD>
                      <TD align="right">
                        {formatQty(m.quantity_reserved, 4)}
                        {isOpen && short > 0.0001 && o.status !== "draft" && o.status !== "awaiting_approval" && <p className="text-xs text-warning-ink">short {formatQty(short, 2)}</p>}
                      </TD>
                      <TD align="right">{formatQty(m.quantity_issued, 4)}</TD>
                      <TD align="right">{formatQty(m.quantity_returned, 4)}</TD>
                      <TD align="right">{formatQty(m.quantity_wasted, 4)}</TD>
                      {isOpen ? (
                        <TD align="right" className="text-muted">
                          {formatQty(availBy.get(m.stock_item_id) ?? 0, 2)}
                        </TD>
                      ) : (
                        <TD align="right" className={Number(m.usage_variance) > 0.0001 ? "text-danger-ink" : Number(m.usage_variance) < -0.0001 ? "text-success" : ""}>
                          {Number(m.usage_variance) > 0 ? "+" : ""}
                          {formatQty(m.usage_variance, 2)}
                        </TD>
                      )}
                      {costs && <TD align="right">{formatMoney(m.actual_cost, cur)}</TD>}
                    </TR>
                  );
                })}
              </TBody>
              {costs && (
                <tfoot>
                  <tr className="border-t border-line-strong text-[13px]">
                    <td className="px-3 py-2.5 text-muted" colSpan={7}>
                      Estimated material cost {formatMoney(estimatedTotal, cur)} · actual issued (net of returns)
                    </td>
                    <td className="tabular px-3 py-2.5 text-right font-semibold">{formatMoney(issuedTotal, cur)}</td>
                  </tr>
                </tfoot>
              )}
            </Table>
          </Card>

          <Card>
            <CardHeader
              title="Production steps"
              description={current ? `Current step: ${current.name}` : o.status === "completed" ? "All steps complete" : undefined}
              action={isOpen && can.jobs && !["draft", "awaiting_approval"].includes(o.status) && <JobCardDialog orderId={o.id} operations={opOpts} members={opts.members} defaultTarget={Number(o.quantity_planned)} defaultOp={current?.id} />}
            />
            {operations.length === 0 ? (
              <EmptyState title="No steps" />
            ) : (
              <ol className="divide-y divide-line">
                {operations.map((x) => {
                  const opCards = (cards ?? []).filter((c) => c.operation_id === x.id);
                  const opPct = (Number(x.quantity_completed) / Number(o.quantity_planned)) * 100;
                  return (
                    <li key={x.id} className={`px-4 py-3 ${x.id === current?.id ? "bg-accent-soft/30" : ""}`}>
                      <div className="flex flex-wrap items-center gap-3">
                        <span className={`flex size-6 items-center justify-center rounded-full text-[11px] font-semibold ${x.status === "completed" ? "bg-success text-white" : x.status === "in_progress" ? "bg-accent text-white" : "bg-subtle text-muted"}`}>
                          {x.sequence}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium">
                            {x.name}
                            {x.requires_quality_check && <Badge tone="success" className="ml-2">QC</Badge>}
                            {x.status === "skipped" && <Badge className="ml-2">Skipped</Badge>}
                          </p>
                          <p className="text-xs text-muted">
                            {x.production_stages.name}
                            {x.work_centres ? ` · ${x.work_centres.name}` : ""}
                            {x.started_at ? ` · started ${relativeTime(x.started_at)}` : ""}
                          </p>
                        </div>
                        <div className="w-40">
                          <div className="flex justify-between text-xs">
                            <span className="tabular">
                              {formatQty(x.quantity_completed)} / {formatQty(o.quantity_planned)}
                            </span>
                            {Number(x.quantity_rejected) > 0 && <span className="text-danger-ink">{formatQty(x.quantity_rejected)} rej.</span>}
                          </div>
                          <Progress value={opPct} className="mt-1" tone={x.status === "completed" ? "success" : "accent"} />
                        </div>
                        {can.update && isOpen && <OperationActions orderId={o.id} op={{ id: x.id, name: x.name, status: x.status }} orderStatus={o.status} canSkip={can.approve} />}
                      </div>
                      {x.instructions && <p className="mt-2 pl-9 text-xs text-ink-soft">{x.instructions}</p>}
                      {opCards.length > 0 && (
                        <ul className="mt-2 flex flex-wrap gap-2 pl-9">
                          {opCards.map((c) => (
                            <li key={c.id}>
                              <Link href={`/operations/job-cards/${c.id}/print`} className="inline-flex items-center gap-1.5 rounded border border-line px-2 py-1 text-xs hover:border-line-strong">
                                <span className="font-mono">{c.code}</span>
                                <span className="text-muted">{(c.assignee as unknown as { full_name: string } | null)?.full_name || c.assigned_team}</span>
                                <span className="tabular">
                                  {formatQty(c.quantity_completed)}/{formatQty(c.target_quantity)}
                                </span>
                                <Badge tone={c.status === "completed" ? "success" : c.status === "in_progress" ? "accent" : "neutral"}>{c.status.replace("_", " ")}</Badge>
                              </Link>
                            </li>
                          ))}
                        </ul>
                      )}
                    </li>
                  );
                })}
              </ol>
            )}
          </Card>

          {qRead && (
            <Card role="region" aria-label="Quality">
              <CardHeader
                title="Quality"
                description={
                  inspection
                    ? `Final inspection: ${formatQty(inspection.passed)} passed, ${formatQty(inspection.rejected)} rejected. Completion is limited to units that passed.`
                    : ctx.settings.require_final_inspection
                      ? "A final inspection is required before output can be stocked."
                      : "No final inspection yet."
                }
                action={
                  isOpen && executing && ctx.can("quality.create") && (
                    <InspectionDialog checkType="production" productionOrderId={o.id} operations={opOpts} defaultFinal maxQty={Math.max(lastGood - (inspection ? inspection.passed + inspection.rejected : 0), 0) || undefined} templates={templates} members={opts.members} canApprove={ctx.can("quality.approve")} />
                  )
                }
              />
              {(checks ?? []).length === 0 ? (
                <EmptyState title="No inspections recorded" />
              ) : (
                <Table>
                  <TBody>
                    {(checks ?? []).map((c: { id: string; number: string; is_final: boolean; result: string; quantity_inspected: number; quantity_passed: number; quantity_rejected: number; inspected_at: string; production_operations: unknown }) => (
                      <TR key={c.id}>
                        <TD>
                          <Link href={`/operations/quality/${c.id}`} className="font-medium text-accent-ink hover:underline">
                            {c.number}
                          </Link>{" "}
                          {c.is_final && <Badge>Final</Badge>}
                        </TD>
                        <TD className="text-muted">{(c.production_operations as { name: string } | null)?.name ?? "Whole order"}</TD>
                        <TD className="text-muted">{formatDateTime(c.inspected_at, df, tz)}</TD>
                        <TD align="right">
                          {formatQty(c.quantity_passed)} passed · {formatQty(c.quantity_rejected)} rejected
                        </TD>
                        <TD>
                          <QcResultBadge result={c.result} />
                        </TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
              )}
            </Card>
          )}

          {cs && (
            <Card role="region" aria-label="Costing">
              <CardHeader
                title="Costing"
                description={cs.final ? "Final cost, frozen when the order was completed." : "Estimate from the BOM, routing and default rates, against costs recorded so far."}
                action={canCostEdit && <CostEntryButtons orderId={o.id} operations={opOpts} workCentres={opts.workCentres} members={opts.members} labourRate={cs.labour_rate} />}
              />
              <Table>
                <THead>
                  <tr>
                    <TH>Cost</TH>
                    <TH align="right">Estimate</TH>
                    <TH align="right">Actual</TH>
                    <TH align="right">Variance</TH>
                  </tr>
                </THead>
                <TBody>
                  {(
                    [
                      ["Material", "material"],
                      ["Labour", "labour"],
                      ["Machine", "machine"],
                      ["Overhead", "overhead"],
                      ["Other direct", "other"],
                    ] as const
                  ).map(([label, k]) => {
                    const v = Number(cs.actual[k]) - Number(cs.estimate[k]);
                    return (
                      <TR key={k}>
                        <TD>
                          {label}
                          {k === "labour" && <span className="text-xs text-muted"> · {formatQty(cs.actual.labour_hours)} h actual / {formatQty(cs.estimate.labour_hours)} h est.</span>}
                          {k === "overhead" && Number(cs.actual.allocated_overhead) > 0 && <span className="text-xs text-muted"> · incl. {formatMoney(cs.actual.allocated_overhead, cur)} allocated</span>}
                        </TD>
                        <TD align="right">{formatMoney(cs.estimate[k], cur)}</TD>
                        <TD align="right">{formatMoney(cs.actual[k], cur)}</TD>
                        <TD align="right" className={v > 0.005 ? "text-danger-ink" : v < -0.005 ? "text-success" : "text-muted"}>
                          {v > 0 ? "+" : ""}
                          {formatMoney(v, cur)}
                        </TD>
                      </TR>
                    );
                  })}
                </TBody>
                <tfoot className="text-[13px]">
                  <tr className="border-t border-line-strong font-semibold">
                    <td className="px-3 py-2">Total</td>
                    <td className="tabular px-3 py-2 text-right">{formatMoney(cs.estimate.total, cur)}</td>
                    <td className="tabular px-3 py-2 text-right">{formatMoney(cs.actual.total, cur)}</td>
                    <td className="tabular px-3 py-2 text-right">{formatMoney(Number(cs.actual.total) - Number(cs.estimate.total), cur)}</td>
                  </tr>
                  <tr>
                    <td className="px-3 py-1 text-muted">Cost per unit</td>
                    <td className="tabular px-3 py-1 text-right">{formatMoney(cs.estimate.unit_cost, cur)}</td>
                    <td className="tabular px-3 py-1 text-right">{cs.actual.unit_cost != null ? formatMoney(cs.actual.unit_cost, cur) : "—"}</td>
                    <td className="px-3 py-1 text-right text-xs text-muted">{cs.actual.unit_cost != null ? (cs.final ? "per accepted unit" : "per unit through last step") : ""}</td>
                  </tr>
                  {cs.selling_price != null && Number(cs.selling_price) > 0 && cs.actual.unit_cost != null && (
                    <tr>
                      <td className="px-3 py-1 text-muted">Gross margin at {formatMoney(cs.selling_price, cur)}</td>
                      <td className="tabular px-3 py-1 text-right">{(((Number(cs.selling_price) - Number(cs.estimate.unit_cost)) / Number(cs.selling_price)) * 100).toFixed(1)}%</td>
                      <td className="tabular px-3 py-1 text-right">{(((Number(cs.selling_price) - Number(cs.actual.unit_cost)) / Number(cs.selling_price)) * 100).toFixed(1)}%</td>
                      <td />
                    </tr>
                  )}
                </tfoot>
              </Table>
              {(cs.labour_entries.length > 0 || cs.overhead_entries.length > 0) && (
                <div className="border-t border-line">
                  <p className="px-4 pt-3 text-xs font-semibold uppercase tracking-wide text-muted">Recorded entries</p>
                  <ul className="divide-y divide-line">
                    {cs.labour_entries.map((e) => (
                      <li key={e.id} className="flex items-center gap-3 px-4 py-2 text-[13px]">
                        <span className="w-16 shrink-0 text-xs text-muted">{e.type === "machine" ? "Machine" : "Labour"}</span>
                        <span className="min-w-0 flex-1 truncate">
                          {e.type === "machine" ? e.work_centre : e.worker || "—"}
                          {e.operation && <span className="text-muted"> · {e.operation}</span>}
                          <span className="text-muted"> · {formatDate(e.date, df)}</span>
                        </span>
                        <span className="tabular text-muted">
                          {formatQty(e.hours)} h × {formatMoney(e.rate, cur)}
                        </span>
                        <span className="tabular w-28 text-right">{formatMoney(e.amount, cur)}</span>
                        {canCostEdit ? <RemoveCostEntry orderId={o.id} entryId={e.id} kind="labour" /> : <span className="w-7" />}
                      </li>
                    ))}
                    {cs.overhead_entries.map((e) => (
                      <li key={e.id} className="flex items-center gap-3 px-4 py-2 text-[13px]">
                        <span className="w-16 shrink-0 text-xs capitalize text-muted">{e.category}</span>
                        <span className="min-w-0 flex-1 truncate">
                          {e.description}
                          {e.allocated && <Badge className="ml-2">Allocated</Badge>}
                        </span>
                        <span className="tabular w-28 text-right">{formatMoney(e.amount, cur)}</span>
                        {canCostEdit && !e.allocated ? <RemoveCostEntry orderId={o.id} entryId={e.id} kind="overhead" /> : <span className="w-7" />}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </Card>
          )}

          <Card>
            <CardHeader title="Activity" action={isOpen && can.update && <DowntimeDialog orderId={o.id} operations={opOpts} />} />
            {isOpen && can.update && (
              <CardBody className="border-b border-line">
                <NoteForm orderId={o.id} />
              </CardBody>
            )}
            {(logs ?? []).length === 0 ? (
              <EmptyState title="No activity yet" />
            ) : (
              <ul className="divide-y divide-line">
                {(logs ?? []).map((l) => (
                  <li key={l.id} className="flex gap-3 px-4 py-2.5 text-[13px]">
                    <span className="w-28 shrink-0 text-xs text-muted" title={formatDateTime(l.occurred_at, df, tz)}>
                      {relativeTime(l.occurred_at)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <span className="font-medium">{LOG_LABEL[l.log_type] ?? l.log_type}</span>
                      {(l.production_operations as unknown as { name: string } | null) && <span className="text-muted"> · {(l.production_operations as unknown as { name: string }).name}</span>}
                      {l.log_type === "progress" || l.log_type === "defect" || l.log_type === "output" ? (
                        <span className="tabular">
                          {" "}
                          · {formatQty(l.quantity_good ?? 0)} good{Number(l.quantity_rejected) > 0 ? `, ${formatQty(l.quantity_rejected)} rejected` : ""}
                        </span>
                      ) : l.quantity_good ? (
                        <span className="tabular"> · {formatQty(l.quantity_good, 4)}</span>
                      ) : l.quantity_rejected ? (
                        <span className="tabular"> · {formatQty(l.quantity_rejected, 4)}</span>
                      ) : null}
                      {l.message && <p className="text-ink-soft">{l.message}</p>}
                    </div>
                    <span className="shrink-0 text-xs text-muted">{(l.profiles as unknown as { full_name: string } | null)?.full_name}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader title="Details" action={isOpen && can.update && <EditOrderDialog id={o.id} defaults={{ priority: o.priority, planned_start_date: o.planned_start_date ?? "", due_date: o.due_date ?? "", manager_id: o.manager_id ?? "", notes: o.notes ?? "" }} members={opts.members} />} />
            <CardBody>
              <DescriptionList
                className="sm:grid-cols-1"
                items={[
                  { label: "Product", value: <Link href={`/commerce/products/${product.id}`} className="text-accent-ink hover:underline">{product.name} ({product.code})</Link> },
                  { label: "BOM", value: o.bom_id ? <Link href={`/commerce/boms/${o.bom_id}`} className="text-accent-ink hover:underline">Version {o.bom_version}</Link> : "—" },
                  { label: "Manager", value: (o.manager as unknown as { full_name: string } | null)?.full_name },
                  { label: "Source", value: `${o.source.replace("_", " ")}${o.source_reference ? ` · ${o.source_reference}` : ""}` },
                  { label: "Finished goods to", value: (o.output_wh as unknown as { name: string }).name },
                  { label: "Started", value: formatDateTime(o.actual_start_at, df, tz) },
                  { label: "Finished", value: formatDateTime(o.actual_end_at, df, tz) },
                  ...(o.cancel_reason ? [{ label: "Cancel reason", value: o.cancel_reason }] : []),
                  { label: "Notes", value: o.notes },
                ]}
              />
            </CardBody>
          </Card>
          {output && (
            <Card>
              <CardHeader title="Output" description="Only accepted units entered finished-goods stock." />
              <CardBody>
                <DescriptionList
                  className="sm:grid-cols-1"
                  items={[
                    { label: "Accepted (stocked)", value: `${formatQty(output.quantity_good)} ${uom}` },
                    { label: "Rejected (not stocked)", value: `${formatQty(output.quantity_rejected)} ${uom}` },
                    ...(costs
                      ? [
                          { label: "Actual material cost", value: formatMoney(output.material_cost, cur) },
                          { label: "Full cost per accepted unit", value: formatMoney(output.unit_cost, cur) },
                        ]
                      : []),
                  ]}
                />
                {costs && <p className="mt-3 text-xs text-muted">Finished goods are valued at full actual cost: material, labour, machine time and overhead, divided by accepted units.</p>}
              </CardBody>
            </Card>
          )}
          {(cards ?? []).length > 0 && (
            <Card>
              <CardHeader title="Job cards" />
              <ul className="divide-y divide-line">
                {(cards ?? []).map((c) => (
                  <li key={c.id} className="flex items-center gap-2 px-4 py-2 text-[13px]">
                    <span className="font-mono text-xs">{c.code}</span>
                    <span className="flex-1 truncate">{(c.assignee as unknown as { full_name: string } | null)?.full_name || c.assigned_team}</span>
                    <Button asChild size="icon-sm" variant="ghost" aria-label={`Print ${c.code}`}>
                      <Link href={`/operations/job-cards/${c.id}/print`}>
                        <Printer />
                      </Link>
                    </Button>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
