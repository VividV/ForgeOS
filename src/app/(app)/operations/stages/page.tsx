import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/misc";
import { TBody, TD, TH, THead, TR, Table } from "@/components/ui/table";
import { getSession, requirePermission } from "@/lib/auth";
import { lookups } from "@/lib/services/lookups";
import { NewRoutingDialog, RoutingEditor, StageDialog, TemplateButtons } from "./client";

export const metadata = { title: "Production stages" };

export default async function StagesPage({ searchParams }: { searchParams: Promise<{ routing?: string }> }) {
  const ctx = await requirePermission("routing.read");
  const sp = await searchParams;
  const { supabase } = await getSession();
  const [{ data: stages }, { data: routings }, { count: orders }, opts] = await Promise.all([
    supabase.from("production_stages").select("*").eq("organization_id", ctx.org.id).order("sequence"),
    supabase.from("routing_templates").select("*, routing_steps(*)").eq("organization_id", ctx.org.id).order("is_default", { ascending: false }).order("name"),
    supabase.from("production_orders").select("id", { count: "exact", head: true }).eq("organization_id", ctx.org.id),
    lookups(ctx.org.id, ["stages", "workCentres"]),
  ]);
  const manage = ctx.can("routing.manage");
  const selected = (routings ?? []).find((r) => r.id === sp.routing) ?? (routings ?? [])[0];

  return (
    <>
      <PageHeader
        title="Production stages & routings"
        description="Stages are the columns on your production board. A routing is the ordered list of steps a production order follows. Each order keeps a copy of the routing it was created with."
        actions={manage && <StageDialog nextSequence={((stages ?? []).at(-1)?.sequence ?? 0) + 10} />}
      />
      <div className="grid gap-4 lg:grid-cols-[380px_minmax(0,1fr)]">
        <Card>
          <CardHeader title="Stages" description="Shared by all factories" />
          <Table>
            <THead>
              <tr>
                <TH>#</TH>
                <TH>Stage</TH>
                <TH>Type</TH>
                {manage && <TH />}
              </tr>
            </THead>
            <TBody>
              {(stages ?? []).map((s) => (
                <TR key={s.id}>
                  <TD className="tabular text-muted">{s.sequence}</TD>
                  <TD>{s.name}</TD>
                  <TD>{s.is_quality_stage ? <Badge tone="success">Quality check</Badge> : <span className="text-muted">Production</span>}</TD>
                  {manage && (
                    <TD align="right">
                      <StageDialog stage={s} />
                    </TD>
                  )}
                </TR>
              ))}
            </TBody>
          </Table>
          {manage && (orders ?? 0) === 0 && (
            <CardBody className="border-t border-line">
              <p className="mb-2 text-xs text-muted">Start from an industry template (only before your first production order):</p>
              <TemplateButtons />
            </CardBody>
          )}
        </Card>
        <Card>
          <CardHeader
            title="Routings"
            description="New production orders use the product's routing, then the factory's, then the default."
            action={manage && <NewRoutingDialog routings={(routings ?? []).map((r) => ({ value: r.id, label: r.name }))} />}
          />
          <div className="flex flex-wrap gap-1 border-b border-line px-4 py-2">
            {(routings ?? []).map((r) => (
              <a
                key={r.id}
                href={`/operations/stages?routing=${r.id}`}
                className={`rounded-md px-2.5 py-1 text-[13px] ${r.id === selected?.id ? "bg-accent-soft font-medium text-accent-ink" : "text-muted hover:bg-subtle"}`}
              >
                {r.name}
                {r.is_default && " (default)"}
              </a>
            ))}
          </div>
          {selected && (
            <CardBody>
              <RoutingEditor
                key={selected.id}
                routingId={selected.id}
                editable={manage}
                stages={opts.stages}
                workCentres={opts.workCentres}
                initial={((selected.routing_steps as { sequence: number; stage_id: string; name: string; work_centre_id: string | null; standard_minutes_per_unit: number | null; instructions: string | null; requires_quality_check: boolean }[]) ?? [])
                  .sort((a, b) => a.sequence - b.sequence)
                  .map((s) => ({
                    stage_id: s.stage_id,
                    name: s.name,
                    work_centre_id: s.work_centre_id ?? "",
                    standard_minutes_per_unit: s.standard_minutes_per_unit?.toString() ?? "",
                    instructions: s.instructions ?? "",
                    requires_quality_check: s.requires_quality_check,
                  }))}
              />
            </CardBody>
          )}
        </Card>
      </div>
    </>
  );
}
