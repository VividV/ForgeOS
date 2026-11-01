import { Cog, Factory } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader } from "@/components/ui/card";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { TBody, TD, TH, THead, TR, Table } from "@/components/ui/table";
import { getSession, requirePermission } from "@/lib/auth";
import { formatMoney, formatQty } from "@/lib/format";
import { lookups } from "@/lib/services/lookups";
import { FactoryDialog, WorkCentreDialog, WorkCentreToggle } from "./dialogs";

export const metadata = { title: "Factories & work centres" };

export default async function WorkCentresPage() {
  const ctx = await requirePermission("work_centres.read");
  const { supabase } = await getSession();
  const [{ data: factories }, { data: centres }, opts] = await Promise.all([
    supabase.from("factories").select("*, warehouses:default_warehouse_id(name, code)").eq("organization_id", ctx.org.id).is("deleted_at", null).order("name"),
    supabase.from("work_centres").select("*").eq("organization_id", ctx.org.id).is("deleted_at", null).order("code"),
    lookups(ctx.org.id, ["factories"]),
  ]);
  const manage = ctx.can("work_centres.manage");
  const cur = ctx.settings.currency;

  return (
    <>
      <PageHeader
        title="Factories & work centres"
        description="Each factory has its own store and work centres. Work centres are where production steps happen."
        actions={manage && <FactoryDialog />}
      />
      {(factories ?? []).length === 0 && (
        <Card>
          <EmptyState icon={<Factory />} title="No factories yet" description="Add your first factory to start planning production." action={manage && <FactoryDialog />} />
        </Card>
      )}
      <div className="flex flex-col gap-4">
        {(factories ?? []).map((f) => {
          const list = (centres ?? []).filter((c) => c.factory_id === f.id);
          const wh = f.warehouses as unknown as { name: string; code: string } | null;
          return (
            <Card key={f.id}>
              <CardHeader
                title={
                  <span className="flex items-center gap-2">
                    {f.name} <Badge>{f.code}</Badge> {!f.is_active && <Badge tone="warning">Inactive</Badge>}
                  </span>
                }
                description={[f.address, wh && `Store: ${wh.name}`, f.capacity_per_day && `Capacity ${formatQty(f.capacity_per_day)} ${f.capacity_unit ?? "units"}/day`, f.timezone].filter(Boolean).join(" · ")}
                action={
                  manage && (
                    <>
                      <FactoryDialog factory={f} />
                      <WorkCentreDialog factories={opts.factories} defaultFactory={f.id} />
                    </>
                  )
                }
              />
              {list.length === 0 ? (
                <EmptyState icon={<Cog />} title="No work centres" description="Add the lines, tables or machines where work is done." />
              ) : (
                <Table>
                  <THead>
                    <tr>
                      <TH>Code</TH>
                      <TH>Name</TH>
                      <TH align="right">Capacity / hr</TH>
                      {ctx.can("costing.read") && <TH align="right">Hourly cost</TH>}
                      <TH>Status</TH>
                      {manage && <TH align="right">Actions</TH>}
                    </tr>
                  </THead>
                  <TBody>
                    {list.map((w) => (
                      <TR key={w.id}>
                        <TD className="font-mono text-xs">{w.code}</TD>
                        <TD>
                          {w.name}
                          {w.description && <p className="text-xs text-muted">{w.description}</p>}
                        </TD>
                        <TD align="right">{formatQty(w.capacity_units_per_hour)}</TD>
                        {ctx.can("costing.read") && <TD align="right">{formatMoney(w.hourly_cost, cur)}</TD>}
                        <TD>{w.is_active ? <Badge tone="success">Active</Badge> : <Badge>Inactive</Badge>}</TD>
                        {manage && (
                          <TD align="right">
                            <div className="flex justify-end gap-1">
                              <WorkCentreDialog factories={opts.factories} centre={w} />
                              <WorkCentreToggle id={w.id} active={w.is_active} />
                            </div>
                          </TD>
                        )}
                      </TR>
                    ))}
                  </TBody>
                </Table>
              )}
            </Card>
          );
        })}
      </div>
    </>
  );
}
