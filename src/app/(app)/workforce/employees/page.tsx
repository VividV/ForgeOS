import { IdCard } from "lucide-react";
import Link from "next/link";
import { ListToolbar } from "@/components/data/toolbar";
import { Pagination, likeTerm, parseList, range, type SearchParams } from "@/components/data/list";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { TBody, TD, TH, THead, TR, Table } from "@/components/ui/table";
import { getSession, requirePermission } from "@/lib/auth";
import { lookups } from "@/lib/services/lookups";
import { EmployeeDialog } from "./dialog";

export const metadata = { title: "Employees" };

const TYPE: Record<string, string> = { full_time: "Full time", part_time: "Part time", contract: "Contract", casual: "Casual", apprentice: "Apprentice" };

export default async function EmployeesPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const ctx = await requirePermission("workforce.read", "attendance.record");
  const sp = await searchParams;
  const params = parseList(sp, { sortable: ["full_name"], defaultSort: "full_name", filters: ["department", "status"] });
  const { supabase } = await getSession();
  let q = supabase.from("employees").select("id, code, full_name, job_title, employment_type, status, skills, phone, user_id, departments(name), shifts(name)", { count: "exact" }).eq("organization_id", ctx.org.id);
  if (params.filters.department) q = q.eq("department_id", params.filters.department);
  q = params.filters.status ? q.eq("status", params.filters.status) : q.neq("status", "left");
  if (params.q) q = q.or(`full_name.ilike.${likeTerm(params.q)},code.ilike.${likeTerm(params.q)},job_title.ilike.${likeTerm(params.q)}`);
  const manage = ctx.can("workforce.manage");
  const [{ data, count }, o] = await Promise.all([
    q.order("full_name").range(...range(params)),
    lookups(ctx.org.id, manage ? ["departments", "shifts", "factories", "members"] : ["departments"]),
  ]);
  return (
    <>
      <PageHeader
        title="Employees"
        description="Everyone who works in your factories, including staff without a ForgeOS login."
        actions={manage && <EmployeeDialog departments={o.departments} shifts={o.shifts} factories={o.factories} members={o.members} showPay />}
      />
      <Card>
        <ListToolbar
          placeholder="Search name, staff number or job title"
          filters={[
            { name: "department", label: "Department", options: o.departments },
            { name: "status", label: "Status", options: [{ value: "active", label: "Active" }, { value: "on_leave", label: "On leave" }, { value: "left", label: "Left" }] },
          ]}
        />
        {(data ?? []).length === 0 ? (
          <EmptyState icon={<IdCard />} title="No employees yet" description={manage ? "Add your machinists, cutters, finishers and other staff." : undefined} />
        ) : (
          <Table>
            <THead>
              <tr>
                <TH>Name</TH>
                <TH>Job</TH>
                <TH>Department</TH>
                <TH>Shift</TH>
                <TH>Skills</TH>
                <TH>Status</TH>
              </tr>
            </THead>
            <TBody>
              {(data ?? []).map((e) => (
                <TR key={e.id}>
                  <TD>
                    <Link href={`/workforce/employees/${e.id}`} className="font-medium hover:text-accent-ink">
                      {e.full_name}
                    </Link>{" "}
                    <span className="font-mono text-xs text-muted">{e.code}</span>
                    {e.user_id && <Badge className="ml-2">Has login</Badge>}
                  </TD>
                  <TD className="text-muted">
                    {e.job_title ?? "—"} <span className="text-xs">· {TYPE[e.employment_type]}</span>
                  </TD>
                  <TD className="text-muted">{(e.departments as unknown as { name: string } | null)?.name ?? "—"}</TD>
                  <TD className="text-muted">{(e.shifts as unknown as { name: string } | null)?.name ?? "—"}</TD>
                  <TD className="max-w-56 truncate text-xs text-muted">{(e.skills as string[]).join(", ") || "—"}</TD>
                  <TD>{e.status === "active" ? <Badge tone="success">Active</Badge> : e.status === "on_leave" ? <Badge tone="warning">On leave</Badge> : <Badge>Left</Badge>}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
        <Pagination params={params} total={count ?? 0} base="/workforce/employees" sp={sp} />
      </Card>
    </>
  );
}
