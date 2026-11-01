import Link from "next/link";
import { notFound } from "next/navigation";
import { AttendanceBadge, Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader, DescriptionList } from "@/components/ui/card";
import { EmptyState, PageHeader, Stat } from "@/components/ui/misc";
import { TBody, TD, TH, THead, TR, Table } from "@/components/ui/table";
import { getSession, requirePermission } from "@/lib/auth";
import { formatDate, formatMoney, formatQty, todayIn } from "@/lib/format";
import { lookups } from "@/lib/services/lookups";
import { EmployeeDialog } from "../dialog";

export default async function EmployeePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requirePermission("workforce.read", "attendance.record");
  const { supabase } = await getSession();
  const { data: e } = await supabase.from("employees").select("*, departments(name), factories(name), shifts(name, start_time, end_time), profiles:user_id(full_name, email)").eq("id", id).eq("organization_id", ctx.org.id).maybeSingle();
  if (!e) notFound();
  const today = todayIn(ctx.settings.timezone);
  const from = new Date(Date.parse(today) - 29 * 86400000).toISOString().slice(0, 10);
  const manage = ctx.can("workforce.manage");
  const costs = ctx.can("costing.read");
  const [{ data: att }, { data: pay }, { data: labour }, o] = await Promise.all([
    supabase.from("attendance_records").select("*, shifts(name)").eq("employee_id", id).gte("work_date", from).order("work_date", { ascending: false }),
    manage || costs ? supabase.from("employee_pay").select("hourly_rate").eq("employee_id", id).maybeSingle() : Promise.resolve({ data: null }),
    costs ? supabase.from("labour_cost_entries").select("id, hours, rate, amount, entry_date, production_orders(id, number)").eq("employee_id", id).order("entry_date", { ascending: false }).limit(20) : Promise.resolve({ data: [] }),
    manage ? lookups(ctx.org.id, ["departments", "shifts", "factories", "members"]) : Promise.resolve({ departments: [], shifts: [], factories: [], members: [] }),
  ]);
  const df = ctx.settings.date_format;
  const rows = att ?? [];
  const present = rows.filter((a) => ["present", "late", "half_day"].includes(a.status)).length;
  const hours = rows.reduce((s, a) => s + Number(a.hours_worked), 0);
  const ot = rows.reduce((s, a) => s + Number(a.overtime_hours), 0);
  const shift = e.shifts as unknown as { name: string; start_time: string; end_time: string } | null;
  return (
    <>
      <PageHeader
        title={e.full_name}
        meta={e.status === "active" ? <Badge tone="success">Active</Badge> : e.status === "on_leave" ? <Badge tone="warning">On leave</Badge> : <Badge>Left</Badge>}
        breadcrumb={[{ label: "Employees", href: "/workforce/employees" }, { label: e.full_name }]}
        description={[e.code, e.job_title, (e.departments as unknown as { name: string } | null)?.name].filter(Boolean).join(" · ")}
        actions={manage && <EmployeeDialog employee={{ ...e, skills: (e.skills as string[]).join(", "), hourly_rate: pay?.hourly_rate == null ? "" : String(pay.hourly_rate) }} departments={o.departments} shifts={o.shifts} factories={o.factories} members={o.members} showPay />}
      />
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Days worked (30 days)" value={String(present)} hint={`${rows.filter((a) => a.status === "absent").length} absent · ${rows.filter((a) => a.status === "late").length} late`} />
        <Stat label="Hours (30 days)" value={formatQty(hours, 1)} />
        <Stat label="Overtime (30 days)" value={formatQty(ot, 1)} />
        {(manage || costs) && <Stat label="Hourly rate" value={pay?.hourly_rate != null ? formatMoney(pay.hourly_rate, ctx.settings.currency) : "Not set"} hint={pay?.hourly_rate == null ? "Default labour rate applies" : undefined} />}
      </div>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader title="Attendance" description="Last 30 days" />
            {rows.length === 0 ? (
              <EmptyState title="No attendance recorded" />
            ) : (
              <Table>
                <THead>
                  <tr>
                    <TH>Date</TH>
                    <TH>Status</TH>
                    <TH>Shift</TH>
                    <TH>In / out</TH>
                    <TH align="right">Hours</TH>
                    <TH align="right">Overtime</TH>
                  </tr>
                </THead>
                <TBody>
                  {rows.map((a) => (
                    <TR key={a.id}>
                      <TD>{formatDate(a.work_date, df)}</TD>
                      <TD>
                        <AttendanceBadge status={a.status} />
                      </TD>
                      <TD className="text-muted">{(a.shifts as unknown as { name: string } | null)?.name ?? "—"}</TD>
                      <TD className="text-muted">{a.clock_in ? `${String(a.clock_in).slice(0, 5)} – ${String(a.clock_out ?? "").slice(0, 5)}` : "—"}</TD>
                      <TD align="right">{formatQty(a.hours_worked, 2)}</TD>
                      <TD align="right" className={Number(a.overtime_hours) > 0 ? "font-medium" : "text-muted"}>
                        {formatQty(a.overtime_hours, 2)}
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            )}
          </Card>
          {costs && (
            <Card>
              <CardHeader title="Labour on production orders" />
              {(labour ?? []).length === 0 ? (
                <EmptyState title="No labour recorded" />
              ) : (
                <Table>
                  <TBody>
                    {(labour ?? []).map((l) => {
                      const po = l.production_orders as unknown as { id: string; number: string };
                      return (
                        <TR key={l.id}>
                          <TD className="text-muted">{formatDate(l.entry_date, df)}</TD>
                          <TD>
                            <Link className="text-accent-ink hover:underline" href={`/operations/production-orders/${po.id}`}>
                              {po.number}
                            </Link>
                          </TD>
                          <TD align="right">
                            {formatQty(l.hours)} h × {formatMoney(l.rate, ctx.settings.currency)}
                          </TD>
                          <TD align="right">{formatMoney(l.amount, ctx.settings.currency)}</TD>
                        </TR>
                      );
                    })}
                  </TBody>
                </Table>
              )}
            </Card>
          )}
        </div>
        <Card>
          <CardHeader title="Details" />
          <CardBody>
            <DescriptionList
              className="sm:grid-cols-1"
              items={[
                { label: "Factory", value: (e.factories as unknown as { name: string } | null)?.name },
                { label: "Usual shift", value: shift ? `${shift.name} (${shift.start_time.slice(0, 5)}–${shift.end_time.slice(0, 5)})` : "—" },
                { label: "Employment", value: e.employment_type.replace("_", " ") },
                { label: "Start date", value: formatDate(e.start_date, df) },
                { label: "Phone", value: e.phone },
                { label: "Email", value: e.email },
                { label: "Skills", value: (e.skills as string[]).length ? (e.skills as string[]).map((s) => <Badge key={s} className="mr-1">{s}</Badge>) : "—" },
                { label: "ForgeOS login", value: (e.profiles as unknown as { full_name: string; email: string } | null)?.full_name ?? "None" },
                { label: "Notes", value: e.notes },
              ]}
            />
          </CardBody>
        </Card>
      </div>
    </>
  );
}
