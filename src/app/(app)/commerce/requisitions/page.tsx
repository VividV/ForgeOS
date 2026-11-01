import { FilePlus, Plus, Sparkles } from "lucide-react";
import Link from "next/link";
import { ListToolbar } from "@/components/data/toolbar";
import { Pagination, parseList, range, type SearchParams } from "@/components/data/list";
import { ProcurementStatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { TBody, TD, TH, THead, TR, Table } from "@/components/ui/table";
import { getSession, requirePermission } from "@/lib/auth";
import { formatDate, relativeTime, sentenceCase } from "@/lib/format";

export const metadata = { title: "Purchase requisitions" };

export default async function RequisitionsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const ctx = await requirePermission("procurement.read", "requisitions.create");
  const sp = await searchParams;
  const params = parseList(sp, { sortable: ["created_at"], defaultSort: "created_at", defaultDir: "desc", filters: ["status"] });
  const { supabase } = await getSession();
  let q = supabase
    .from("purchase_requisitions")
    .select("id, number, status, source, needed_by, created_at, notes, requester:profiles!purchase_requisitions_requested_by_fkey(full_name), production_orders(number), purchase_requisition_items(count)", { count: "exact" })
    .eq("organization_id", ctx.org.id);
  if (params.filters.status) q = q.eq("status", params.filters.status);
  if (params.q) q = q.ilike("number", `%${params.q.replace(/[%_]/g, "")}%`);
  const { data, count } = await q.order("created_at", { ascending: false }).range(...range(params));

  return (
    <>
      <PageHeader
        title="Purchase requisitions"
        description="Requests for materials. Approved requisitions become purchase orders."
        actions={
          ctx.can("requisitions.create") && (
            <>
              <Button asChild>
                <Link href="/commerce/requisitions/new?suggest=1">
                  <Sparkles /> From shortages & reorder levels
                </Link>
              </Button>
              <Button asChild variant="primary">
                <Link href="/commerce/requisitions/new">
                  <Plus /> New requisition
                </Link>
              </Button>
            </>
          )
        }
      />
      <Card>
        <ListToolbar
          placeholder="Search number"
          filters={[{ name: "status", label: "Status", options: ["submitted", "approved", "ordered", "rejected", "cancelled"].map((v) => ({ value: v, label: sentenceCase(v === "submitted" ? "awaiting approval" : v) })) }]}
        />
        {(data ?? []).length === 0 ? (
          <EmptyState icon={<FilePlus />} title="No requisitions yet" description="Request materials when stock runs low or production is short." />
        ) : (
          <Table>
            <THead>
              <tr>
                <TH>Number</TH>
                <TH>Requested by</TH>
                <TH>Source</TH>
                <TH align="right">Lines</TH>
                <TH>Needed by</TH>
                <TH>Raised</TH>
                <TH>Status</TH>
              </tr>
            </THead>
            <TBody>
              {(data ?? []).map((r) => (
                <TR key={r.id}>
                  <TD>
                    <Link href={`/commerce/requisitions/${r.id}`} className="font-medium hover:text-accent-ink">
                      {r.number}
                    </Link>
                  </TD>
                  <TD>{(r.requester as unknown as { full_name: string } | null)?.full_name ?? "—"}</TD>
                  <TD className="text-muted">
                    {sentenceCase(r.source)}
                    {(r.production_orders as unknown as { number: string } | null) && ` · ${(r.production_orders as unknown as { number: string }).number}`}
                  </TD>
                  <TD align="right">{(r.purchase_requisition_items as unknown as { count: number }[])[0]?.count ?? 0}</TD>
                  <TD className="text-muted">{formatDate(r.needed_by, ctx.settings.date_format)}</TD>
                  <TD className="text-muted">{relativeTime(r.created_at)}</TD>
                  <TD>
                    <ProcurementStatusBadge status={r.status} />
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
        <Pagination params={params} total={count ?? 0} base="/commerce/requisitions" sp={sp} />
      </Card>
    </>
  );
}
