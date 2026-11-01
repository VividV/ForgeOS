import { Network } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader } from "@/components/ui/card";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { TBody, TD, TH, THead, TR, Table } from "@/components/ui/table";
import { getSession, requirePermission } from "@/lib/auth";
import { formatQty } from "@/lib/format";
import { lookups } from "@/lib/services/lookups";
import { DepartmentDialog, ShiftDialog, ToggleActive } from "./client";

export const metadata = { title: "Departments & shifts" };

const hours = (s: string, e: string, b: number) => {
  const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
  let d = toMin(e) - toMin(s);
  if (d <= 0) d += 1440;
  return Math.max(d - b, 0) / 60;
};

export default async function WorkforceSetupPage() {
  const ctx = await requirePermission("workforce.read");
  const { supabase } = await getSession();
  const manage = ctx.can("workforce.manage");
  const [{ data: depts }, { data: shifts }, { data: emps }, o] = await Promise.all([
    supabase.from("departments").select("*, factories(name)").eq("organization_id", ctx.org.id).order("is_active", { ascending: false }).order("name"),
    supabase.from("shifts").select("*, factories(name)").eq("organization_id", ctx.org.id).order("is_active", { ascending: false }).order("start_time"),
    supabase.from("employees").select("department_id").eq("organization_id", ctx.org.id).neq("status", "left"),
    lookups(ctx.org.id, ["factories"]),
  ]);
  const headcount = new Map<string, number>();
  for (const e of emps ?? []) if (e.department_id) headcount.set(e.department_id, (headcount.get(e.department_id) ?? 0) + 1);
  return (
    <>
      <PageHeader title="Departments & shifts" description="Group staff by department and define the shifts used for attendance and overtime." />
      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader title="Departments" action={manage && <DepartmentDialog factories={o.factories} />} />
          {(depts ?? []).length === 0 ? (
            <EmptyState icon={<Network />} title="No departments yet" description="e.g. Cutting, Sewing, Dyeing, Finishing, Packing" />
          ) : (
            <Table>
              <THead>
                <tr>
                  <TH>Department</TH>
                  <TH>Factory</TH>
                  <TH align="right">Staff</TH>
                  <TH />
                </tr>
              </THead>
              <TBody>
                {(depts ?? []).map((d) => (
                  <TR key={d.id}>
                    <TD className="font-medium">
                      {d.name} {!d.is_active && <Badge>Inactive</Badge>}
                    </TD>
                    <TD className="text-muted">{(d.factories as unknown as { name: string } | null)?.name ?? "All"}</TD>
                    <TD align="right">{headcount.get(d.id) ?? 0}</TD>
                    <TD align="right">
                      {manage && (
                        <div className="flex justify-end gap-1">
                          <DepartmentDialog factories={o.factories} dept={{ id: d.id, name: d.name, factory_id: d.factory_id ?? "", description: d.description ?? "" }} />
                          <ToggleActive table="departments" id={d.id} active={d.is_active} />
                        </div>
                      )}
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </Card>
        <Card>
          <CardHeader title="Shifts" action={manage && <ShiftDialog factories={o.factories} />} />
          {(shifts ?? []).length === 0 ? (
            <EmptyState title="No shifts yet" description="e.g. Day 08:00–17:00 with a 60-minute break. Hours beyond the shift count as overtime." />
          ) : (
            <Table>
              <THead>
                <tr>
                  <TH>Shift</TH>
                  <TH>Time</TH>
                  <TH align="right">Paid hours</TH>
                  <TH />
                </tr>
              </THead>
              <TBody>
                {(shifts ?? []).map((s) => (
                  <TR key={s.id}>
                    <TD className="font-medium">
                      {s.name} {!s.is_active && <Badge>Inactive</Badge>}
                      {(s.factories as unknown as { name: string } | null) && <div className="text-xs text-muted">{(s.factories as unknown as { name: string }).name}</div>}
                    </TD>
                    <TD className="text-muted">
                      {String(s.start_time).slice(0, 5)}–{String(s.end_time).slice(0, 5)} · {s.break_minutes} min break
                    </TD>
                    <TD align="right">{formatQty(hours(String(s.start_time), String(s.end_time), s.break_minutes), 2)}</TD>
                    <TD align="right">
                      {manage && (
                        <div className="flex justify-end gap-1">
                          <ShiftDialog factories={o.factories} shift={{ id: s.id, name: s.name, factory_id: s.factory_id ?? "", start_time: String(s.start_time).slice(0, 5), end_time: String(s.end_time).slice(0, 5), break_minutes: String(s.break_minutes) }} />
                          <ToggleActive table="shifts" id={s.id} active={s.is_active} />
                        </div>
                      )}
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </Card>
      </div>
    </>
  );
}
