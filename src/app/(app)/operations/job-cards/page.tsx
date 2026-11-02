import { ClipboardList, Printer } from "lucide-react";
import Link from "next/link";
import { ListToolbar } from "@/components/data/toolbar";
import { Pagination, parseList, range, type SearchParams } from "@/components/data/list";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState, PageHeader, Progress } from "@/components/ui/misc";
import { TBody, TD, TH, THead, TR, Table } from "@/components/ui/table";
import { getSession, requirePermission } from "@/lib/auth";
import { formatDateTime, formatQty } from "@/lib/format";
import { lookups } from "@/lib/services/lookups";

export const metadata = { title: "Job cards" };

export default async function JobCardsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const ctx = await requirePermission("job_cards.read", "job_cards.create");
  const sp = await searchParams;
  const params = parseList(sp, { sortable: ["issued_at"], defaultSort: "issued_at", defaultDir: "desc", filters: ["status", "assignee"] });
  const { supabase } = await getSession();
  let q = supabase
    .from("job_cards")
    .select("id, code, status, target_quantity, quantity_completed, quantity_rejected, assigned_team, issued_at, assignee:profiles!job_cards_assignee_profile_fk(full_name), employee:employees(full_name), production_orders(id, number, products(name)), production_operations(name)", { count: "exact" })
    .eq("organization_id", ctx.org.id);
  if (params.filters.status) q = q.eq("status", params.filters.status);
  else q = q.in("status", ["open", "in_progress", "paused"]);
  if (params.filters.assignee) q = q.eq("assigned_user_id", params.filters.assignee);
  if (params.q) q = q.ilike("code", `%${params.q.replace(/[%_]/g, "")}%`);
  const [{ data, count }, { members }] = await Promise.all([q.order("issued_at", { ascending: false }).range(...range(params)), lookups(ctx.org.id, ["members"])]);

  return (
    <>
      <PageHeader title="Job cards" description="Work assigned to people and teams. Issue new job cards from a production order's steps." />
      <Card>
        <ListToolbar
          placeholder="Search job card code"
          filters={[
            { name: "status", label: "Status", options: ["open", "in_progress", "paused", "completed", "cancelled"].map((v) => ({ value: v, label: v.replace("_", " ") })) },
            { name: "assignee", label: "Assignee", options: members },
          ]}
        />
        {(data ?? []).length === 0 ? (
          <EmptyState icon={<ClipboardList />} title="No job cards" description="Open a production order and choose Issue job card." />
        ) : (
          <Table>
            <THead>
              <tr>
                <TH>Card</TH>
                <TH>Order</TH>
                <TH>Step</TH>
                <TH>Assigned to</TH>
                <TH className="w-40">Progress</TH>
                <TH>Status</TH>
                <TH>Issued</TH>
                <TH />
              </tr>
            </THead>
            <TBody>
              {(data ?? []).map((c) => {
                const po = c.production_orders as unknown as { id: string; number: string; products: { name: string } };
                return (
                  <TR key={c.id}>
                    <TD className="font-mono text-xs">{c.code}</TD>
                    <TD>
                      <Link href={`/operations/production-orders/${po.id}`} className="font-medium hover:text-accent-ink">
                        {po.number}
                      </Link>
                      <p className="text-xs text-muted">{po.products.name}</p>
                    </TD>
                    <TD>{(c.production_operations as unknown as { name: string }).name}</TD>
                    <TD>{(c.employee as unknown as { full_name: string } | null)?.full_name || (c.assignee as unknown as { full_name: string } | null)?.full_name || c.assigned_team}</TD>
                    <TD>
                      <div className="flex items-center gap-2">
                        <Progress value={(Number(c.quantity_completed) / Number(c.target_quantity)) * 100} />
                        <span className="tabular text-xs text-muted">
                          {formatQty(c.quantity_completed)}/{formatQty(c.target_quantity)}
                        </span>
                      </div>
                    </TD>
                    <TD>
                      <Badge tone={c.status === "completed" ? "success" : c.status === "in_progress" ? "accent" : c.status === "paused" ? "warning" : "neutral"}>{c.status.replace("_", " ")}</Badge>
                    </TD>
                    <TD className="text-muted">{formatDateTime(c.issued_at, ctx.settings.date_format, ctx.settings.timezone)}</TD>
                    <TD align="right">
                      <Button asChild size="icon-sm" variant="ghost" aria-label={`Print ${c.code}`}>
                        <Link href={`/operations/job-cards/${c.id}/print`}>
                          <Printer />
                        </Link>
                      </Button>
                    </TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        )}
        <Pagination params={params} total={count ?? 0} base="/operations/job-cards" sp={sp} />
      </Card>
    </>
  );
}
