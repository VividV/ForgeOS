import { Download, Factory, Plus } from "lucide-react";
import Link from "next/link";
import { ListToolbar } from "@/components/data/toolbar";
import { Pagination, SortTH, likeTerm, parseList, range, type SearchParams } from "@/components/data/list";
import { PRODUCTION_STATUS, PriorityBadge, ProductionStatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState, PageHeader, Progress, TabLinks } from "@/components/ui/misc";
import { TBody, TD, TH, THead, TR, Table } from "@/components/ui/table";
import { getSession, requirePermission } from "@/lib/auth";
import { formatDate, formatQty, todayIn } from "@/lib/format";
import { lookups } from "@/lib/services/lookups";

export const metadata = { title: "Production orders" };

const VIEWS: Record<string, string[] | null> = {
  active: ["approved", "materials_pending", "ready_to_start", "in_progress", "paused", "quality_inspection"],
  planning: ["draft", "awaiting_approval"],
  done: ["completed", "cancelled"],
  all: null,
};

export default async function ProductionOrdersPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const ctx = await requirePermission("production_orders.read");
  const sp = await searchParams;
  const view = typeof sp.view === "string" && sp.view in VIEWS ? sp.view : "active";
  const params = parseList(sp, { sortable: ["number", "due_date", "created_at", "priority", "quantity_planned"], defaultSort: "created_at", defaultDir: "desc", filters: ["status", "factory", "priority"] });
  const { supabase } = await getSession();
  let q = supabase
    .from("production_orders")
    .select("id, number, status, priority, quantity_planned, quantity_completed, quantity_rejected, due_date, planned_start_date, factories(name), products!inner(name, code), product_variants(name, is_default), production_operations(sequence, quantity_completed, status)", { count: "exact" })
    .eq("organization_id", ctx.org.id);
  const statuses = VIEWS[view];
  if (params.filters.status) q = q.eq("status", params.filters.status);
  else if (statuses) q = q.in("status", statuses);
  if (params.filters.factory) q = q.eq("factory_id", params.filters.factory);
  if (params.filters.priority) q = q.eq("priority", params.filters.priority);
  if (params.q) q = q.or(`number.ilike.${likeTerm(params.q)},source_reference.ilike.${likeTerm(params.q)}`);
  const { data, count } = await q.order(params.sort, { ascending: params.dir === "asc", nullsFirst: false }).range(...range(params));
  const { factories } = await lookups(ctx.org.id, ["factories"]);
  const today = todayIn(ctx.settings.timezone);
  const base = "/operations/production-orders";

  return (
    <>
      <PageHeader
        title="Production orders"
        description="Plan, approve and track every batch from materials to finished goods."
        actions={
          <>
            {ctx.can("production_orders.export") && (
              <Button asChild>
                {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- file download, not a page */}
                <a href="/api/export/production-orders">
                  <Download /> Export CSV
                </a>
              </Button>
            )}
            {ctx.can("production_orders.create") && (
              <Button asChild variant="primary">
                <Link href={`${base}/new`}>
                  <Plus /> New order
                </Link>
              </Button>
            )}
          </>
        }
      />
      <TabLinks
        active={view}
        tabs={[
          { key: "active", label: "Active", href: `${base}?view=active` },
          { key: "planning", label: "Draft & approval", href: `${base}?view=planning` },
          { key: "done", label: "Completed & cancelled", href: `${base}?view=done` },
          { key: "all", label: "All", href: `${base}?view=all` },
        ]}
      />
      <Card>
        <ListToolbar
          placeholder="Search order number or reference"
          filters={[
            { name: "status", label: "Status", options: Object.entries(PRODUCTION_STATUS).map(([value, s]) => ({ value, label: s.label })) },
            { name: "factory", label: "Factory", options: factories },
            { name: "priority", label: "Priority", options: ["urgent", "high", "normal", "low"].map((p) => ({ value: p, label: p.charAt(0).toUpperCase() + p.slice(1) })) },
          ]}
        />
        {(data ?? []).length === 0 ? (
          <EmptyState icon={<Factory />} title="No production orders here" description={ctx.can("production_orders.create") ? "Create an order for a product with an approved BOM." : undefined} />
        ) : (
          <Table>
            <THead>
              <tr>
                <SortTH label="Order" col="number" params={params} base={base} sp={sp} />
                <TH>Product</TH>
                <TH>Factory</TH>
                <SortTH label="Qty" col="quantity_planned" params={params} base={base} sp={sp} align="right" />
                <TH className="w-40">Progress</TH>
                <SortTH label="Priority" col="priority" params={params} base={base} sp={sp} />
                <SortTH label="Due" col="due_date" params={params} base={base} sp={sp} />
                <TH>Status</TH>
              </tr>
            </THead>
            <TBody>
              {(data ?? []).map((o) => {
                const ops = ((o.production_operations as { sequence: number; quantity_completed: number; status: string }[]) ?? []).filter((x) => x.status !== "skipped").sort((a, b) => a.sequence - b.sequence);
                const done = o.status === "completed" ? Number(o.quantity_completed) : Number(ops.at(-1)?.quantity_completed ?? 0);
                const pct = (done / Number(o.quantity_planned)) * 100;
                const late = o.due_date && o.due_date < today && !["completed", "cancelled", "draft"].includes(o.status);
                const p = o.products as unknown as { name: string; code: string };
                const v = o.product_variants as unknown as { name: string; is_default: boolean } | null;
                return (
                  <TR key={o.id}>
                    <TD>
                      <Link href={`${base}/${o.id}`} className="font-medium text-ink hover:text-accent-ink">
                        {o.number}
                      </Link>
                    </TD>
                    <TD>
                      {p.name}
                      {v && !v.is_default && <span className="text-muted"> · {v.name}</span>}
                    </TD>
                    <TD className="text-muted">{(o.factories as unknown as { name: string } | null)?.name}</TD>
                    <TD align="right">{formatQty(o.quantity_planned)}</TD>
                    <TD>
                      <div className="flex items-center gap-2">
                        <Progress value={pct} tone={o.status === "completed" ? "success" : late ? "danger" : "accent"} />
                        <span className="tabular w-10 text-right text-xs text-muted">{Math.round(pct)}%</span>
                      </div>
                    </TD>
                    <TD>
                      <PriorityBadge priority={o.priority} />
                    </TD>
                    <TD className={late ? "font-medium text-danger-ink" : "text-muted"}>{formatDate(o.due_date, ctx.settings.date_format)}</TD>
                    <TD>
                      <ProductionStatusBadge status={o.status} />
                    </TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        )}
        <Pagination params={params} total={count ?? 0} base={base} sp={sp} />
      </Card>
    </>
  );
}
