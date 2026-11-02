import { ClipboardCheck } from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { TBody, TD, TH, THead, TR, Table } from "@/components/ui/table";
import { getSession, requirePermission } from "@/lib/auth";
import { formatDateTime } from "@/lib/format";
import { COUNT_STATUS } from "@/lib/labels";
import { lookups } from "@/lib/services/lookups";
import { StartCount } from "./client";

export const metadata = { title: "Stock counts" };

export default async function CountsPage() {
  const ctx = await requirePermission("inventory.read");
  const { supabase } = await getSession();
  const [{ data }, { warehouses }] = await Promise.all([
    supabase.from("stock_counts").select("id, number, status, scope, blind, started_at, approved_at, warehouses(name), creator:profiles!stock_counts_created_by_fkey(full_name)").eq("organization_id", ctx.org.id).order("started_at", { ascending: false }).limit(100),
    lookups(ctx.org.id, ["warehouses"]),
  ]);
  return (
    <>
      <PageHeader title="Stock counts" description="Count sheets for physical stock-takes. When a count is approved, stock on hand is set to what was counted and the differences are recorded." actions={ctx.can("inventory.adjust") && <StartCount warehouses={warehouses} />} />
      <Card>
        {(data ?? []).length === 0 ? (
          <EmptyState icon={<ClipboardCheck />} title="No stock counts yet" description="Count each warehouse regularly (monthly is common) to keep the system accurate." />
        ) : (
          <Table>
            <THead>
              <tr>
                <TH>Count</TH>
                <TH>Warehouse</TH>
                <TH>Scope</TH>
                <TH>Started</TH>
                <TH>By</TH>
                <TH>Status</TH>
              </tr>
            </THead>
            <TBody>
              {(data ?? []).map((c) => {
                const st = COUNT_STATUS[c.status as keyof typeof COUNT_STATUS];
                return (
                  <TR key={c.id}>
                    <TD>
                      <Link className="font-medium hover:text-accent-ink" href={`/inventory/counts/${c.id}`}>
                        {c.number}
                      </Link>{" "}
                      {c.blind && <Badge>Blind</Badge>}
                    </TD>
                    <TD>{(c.warehouses as unknown as { name: string }).name}</TD>
                    <TD className="text-muted">{c.scope === "all" ? "Everything" : c.scope === "materials" ? "Materials" : "Finished goods"}</TD>
                    <TD className="text-muted">{formatDateTime(c.started_at, ctx.settings.date_format, ctx.settings.timezone)}</TD>
                    <TD className="text-muted">{(c.creator as unknown as { full_name: string } | null)?.full_name}</TD>
                    <TD>
                      <Badge tone={st[1]}>{st[0]}</Badge>
                    </TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        )}
      </Card>
    </>
  );
}
