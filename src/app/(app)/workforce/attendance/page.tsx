import { ChevronLeft, ChevronRight, Clock } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { EmptyState, PageHeader, Stat } from "@/components/ui/misc";
import { TBody, TD, TH, THead, TR, Table } from "@/components/ui/table";
import { getSession, requirePermission } from "@/lib/auth";
import { formatDate, formatQty, todayIn } from "@/lib/format";
import { AttendanceRegister } from "./register";

export const metadata = { title: "Attendance" };

const shiftDay = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);

export default async function AttendancePage({ searchParams }: { searchParams: Promise<{ date?: string; department?: string }> }) {
  const ctx = await requirePermission("workforce.read", "attendance.record");
  const sp = await searchParams;
  const today = todayIn(ctx.settings.timezone);
  const date = sp.date && /^\d{4}-\d{2}-\d{2}$/.test(sp.date) && sp.date <= today ? sp.date : today;
  const monthStart = `${date.slice(0, 8)}01`;
  const { supabase } = await getSession();
  let eq = supabase.from("employees").select("id, code, full_name, department_id, departments(name)").eq("organization_id", ctx.org.id).eq("status", "active");
  if (sp.department) eq = eq.eq("department_id", sp.department);
  const [{ data: emps }, { data: recs }, { data: summary }, { data: depts }] = await Promise.all([
    eq.order("full_name"),
    supabase.from("attendance_records").select("employee_id, status, clock_in, clock_out, notes, hours_worked, overtime_hours").eq("organization_id", ctx.org.id).eq("work_date", date),
    supabase.rpc("attendance_summary", { p_org: ctx.org.id, p_from: monthStart, p_to: date }),
    supabase.from("departments").select("id, name").eq("organization_id", ctx.org.id).eq("is_active", true).order("name"),
  ]);
  const byEmp = new Map((recs ?? []).map((r) => [r.employee_id, r]));
  const rows = (emps ?? []).map((e) => {
    const r = byEmp.get(e.id);
    return {
      employee_id: e.id,
      name: e.full_name,
      code: e.code,
      department: (e.departments as unknown as { name: string } | null)?.name ?? null,
      status: r?.status ?? "",
      clock_in: r?.clock_in ? String(r.clock_in).slice(0, 5) : "",
      clock_out: r?.clock_out ? String(r.clock_out).slice(0, 5) : "",
      notes: r?.notes ?? "",
    };
  });
  const present = (recs ?? []).filter((r) => ["present", "late", "half_day"].includes(r.status)).length;
  const sum = (summary ?? []) as { employee_id: string; code: string; full_name: string; department: string | null; days_recorded: number; present: number; late: number; half_days: number; absent: number; leave: number; hours: number; overtime: number }[];
  const qs = (d: string) => `/workforce/attendance?date=${d}${sp.department ? `&department=${sp.department}` : ""}`;
  return (
    <>
      <PageHeader
        title="Attendance"
        description="Daily register for everyone on the floor. Hours beyond the shift are counted as overtime."
        actions={
          <div className="flex items-center gap-1">
            <Button asChild variant="ghost" size="icon-sm" aria-label="Previous day">
              <Link href={qs(shiftDay(date, -1))}>
                <ChevronLeft />
              </Link>
            </Button>
            <form className="flex items-center gap-2" action="/workforce/attendance">
              <input type="date" name="date" defaultValue={date} max={today} aria-label="Date" className="h-9 rounded-md border border-line-strong bg-surface px-2 text-sm" />
              {sp.department && <input type="hidden" name="department" value={sp.department} />}
              <Button type="submit" size="sm">
                Go
              </Button>
            </form>
            <Button asChild variant="ghost" size="icon-sm" aria-label="Next day" className={date >= today ? "pointer-events-none opacity-40" : ""}>
              <Link href={qs(shiftDay(date, 1))}>
                <ChevronRight />
              </Link>
            </Button>
          </div>
        }
      />
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label={`At work · ${formatDate(date, ctx.settings.date_format)}`} value={`${present} / ${rows.length}`} />
        <Stat label="Absent" value={String((recs ?? []).filter((r) => r.status === "absent").length)} />
        <Stat label="Hours recorded" value={formatQty((recs ?? []).reduce((s, r) => s + Number(r.hours_worked), 0), 1)} />
        <Stat label="Overtime" value={formatQty((recs ?? []).reduce((s, r) => s + Number(r.overtime_hours), 0), 1)} />
      </div>
      <Card className="mb-4">
        <CardHeader
          title={`Register · ${formatDate(date, ctx.settings.date_format)}`}
          action={
            (depts ?? []).length > 0 && (
              <div className="flex flex-wrap gap-1 text-xs">
                <Link href={`/workforce/attendance?date=${date}`} className={`rounded px-2 py-1 ${!sp.department ? "bg-subtle font-medium" : "text-muted hover:text-ink"}`}>
                  All
                </Link>
                {(depts ?? []).map((d) => (
                  <Link key={d.id} href={`/workforce/attendance?date=${date}&department=${d.id}`} className={`rounded px-2 py-1 ${sp.department === d.id ? "bg-subtle font-medium" : "text-muted hover:text-ink"}`}>
                    {d.name}
                  </Link>
                ))}
              </div>
            )
          }
        />
        {rows.length === 0 ? (
          <EmptyState icon={<Clock />} title="No active employees" description="Add employees under Workforce → Employees." />
        ) : (
          <AttendanceRegister date={date} rows={rows} editable={ctx.can("attendance.record")} />
        )}
      </Card>
      <Card>
        <CardHeader title="This month" description={`${formatDate(monthStart, ctx.settings.date_format)} to ${formatDate(date, ctx.settings.date_format)}`} />
        {sum.length === 0 ? (
          <EmptyState title="No attendance yet this month" />
        ) : (
          <Table>
            <THead>
              <tr>
                <TH>Employee</TH>
                <TH align="right">Present</TH>
                <TH align="right">Late</TH>
                <TH align="right">Half days</TH>
                <TH align="right">Absent</TH>
                <TH align="right">Leave</TH>
                <TH align="right">Hours</TH>
                <TH align="right">Overtime</TH>
              </tr>
            </THead>
            <TBody>
              {sum.map((s) => (
                <TR key={s.employee_id}>
                  <TD>
                    <Link className="hover:text-accent-ink" href={`/workforce/employees/${s.employee_id}`}>
                      {s.full_name}
                    </Link>{" "}
                    <span className="text-xs text-muted">{s.department}</span>
                  </TD>
                  <TD align="right">{Number(s.present)}</TD>
                  <TD align="right" className={Number(s.late) > 0 ? "text-warning-ink" : "text-muted"}>
                    {Number(s.late)}
                  </TD>
                  <TD align="right">{Number(s.half_days)}</TD>
                  <TD align="right" className={Number(s.absent) > 0 ? "text-danger-ink" : "text-muted"}>
                    {Number(s.absent)}
                  </TD>
                  <TD align="right">{Number(s.leave)}</TD>
                  <TD align="right">{formatQty(s.hours, 1)}</TD>
                  <TD align="right">{formatQty(s.overtime, 1)}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>
    </>
  );
}
