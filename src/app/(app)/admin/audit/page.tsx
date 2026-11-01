import { ScrollText } from "lucide-react";
import { ListToolbar } from "@/components/data/toolbar";
import { Pagination, parseList, range, type SearchParams } from "@/components/data/list";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { TBody, TD, TH, THead, TR, Table } from "@/components/ui/table";
import { getSession, requirePermission } from "@/lib/auth";
import { formatDateTime, sentenceCase } from "@/lib/format";

export const metadata = { title: "Audit log" };

function diff(oldV: Record<string, unknown> | null, newV: Record<string, unknown> | null) {
  const keys = [...new Set([...Object.keys(oldV ?? {}), ...Object.keys(newV ?? {})])].filter((k) => !["created_at", "id", "organization_id", "created_by"].includes(k)).slice(0, 6);
  return keys.map((k) => {
    const fmt = (v: unknown) => (v === null || v === undefined ? "∅" : typeof v === "object" ? JSON.stringify(v).slice(0, 60) : String(v).slice(0, 60));
    return oldV && k in oldV ? `${k}: ${fmt(oldV[k])} → ${fmt(newV?.[k])}` : `${k}: ${fmt(newV?.[k])}`;
  });
}

export default async function AuditPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const ctx = await requirePermission("audit_logs.read");
  const sp = await searchParams;
  const params = parseList(sp, { sortable: ["created_at"], defaultSort: "created_at", defaultDir: "desc", filters: ["entity", "action"], pageSize: 50 });
  const { supabase } = await getSession();
  let q = supabase.from("audit_logs").select("*, profiles:actor_id(full_name, email)", { count: "exact" }).eq("organization_id", ctx.org.id);
  if (params.filters.entity) q = q.eq("entity_type", params.filters.entity);
  if (params.filters.action) q = q.eq("action", params.filters.action);
  const { data, count } = await q.order("created_at", { ascending: false }).range(...range(params));

  return (
    <>
      <PageHeader title="Audit log" description="An append-only record of important changes: who did what, when, and what changed. Entries can't be edited or deleted." />
      <Card>
        <ListToolbar
          search={false}
          filters={[
            {
              name: "entity",
              label: "Record",
              options: ["production_orders", "inventory_transactions", "stock_adjustments", "materials", "products", "bills_of_materials", "organization_members", "roles", "invitations", "organization_settings", "organizations", "factories", "warehouses"].map((v) => ({ value: v, label: sentenceCase(v) })),
            },
            {
              name: "action",
              label: "Action",
              options: ["create", "update", "delete", "stock_adjustment", "reverse", "role_change", "permission_change", "negative_stock_override", "complete", "record_wastage", "material_exception", "start_with_shortage", "invite", "bom_approve"].map((v) => ({ value: v, label: sentenceCase(v) })),
            },
          ]}
        />
        {(data ?? []).length === 0 ? (
          <EmptyState icon={<ScrollText />} title="No audit entries" />
        ) : (
          <Table>
            <THead>
              <tr>
                <TH>When</TH>
                <TH>Who</TH>
                <TH>Action</TH>
                <TH>Record</TH>
                <TH>Details</TH>
                <TH>Source</TH>
              </tr>
            </THead>
            <TBody>
              {(data ?? []).map((a) => {
                const p = a.profiles as unknown as { full_name: string; email: string } | null;
                return (
                  <TR key={a.id}>
                    <TD className="whitespace-nowrap text-muted">{formatDateTime(a.created_at, ctx.settings.date_format, ctx.settings.timezone)}</TD>
                    <TD className="whitespace-nowrap">{p?.full_name || p?.email || "System"}</TD>
                    <TD>
                      <Badge tone={a.action.includes("override") || a.action.includes("exception") ? "danger" : a.action === "delete" ? "warning" : "neutral"}>{sentenceCase(a.action)}</Badge>
                    </TD>
                    <TD className="text-muted">{sentenceCase(a.entity_type)}</TD>
                    <TD className="max-w-md">
                      {a.summary && <p>{a.summary}</p>}
                      {diff(a.old_values, a.new_values).map((d, i) => (
                        <p key={i} className="truncate font-mono text-[11px] text-muted">
                          {d}
                        </p>
                      ))}
                    </TD>
                    <TD className="text-xs text-muted" title={a.request_id ?? undefined}>
                      {a.source}
                    </TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        )}
        <Pagination params={params} total={count ?? 0} base="/admin/audit" sp={sp} />
      </Card>
    </>
  );
}
