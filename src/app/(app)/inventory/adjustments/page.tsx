import { Plus, SlidersHorizontal } from "lucide-react";
import Link from "next/link";
import { Pagination, parseList, range, type SearchParams } from "@/components/data/list";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { TBody, TD, TH, THead, TR, Table } from "@/components/ui/table";
import { getSession, requirePermission } from "@/lib/auth";
import { formatDateTime, formatMoney, formatQty, sentenceCase } from "@/lib/format";

export const metadata = { title: "Stock adjustments" };

export default async function AdjustmentsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const ctx = await requirePermission("inventory.read");
  const sp = await searchParams;
  const params = parseList(sp, { sortable: ["created_at"], defaultSort: "created_at", defaultDir: "desc" });
  const { supabase } = await getSession();
  const { data, count } = await supabase
    .from("stock_adjustments")
    .select("id, number, reason, notes, created_at, warehouses(name), profiles:created_by(full_name)", { count: "exact" })
    .eq("organization_id", ctx.org.id)
    .order("created_at", { ascending: false })
    .range(...range(params));
  const ids = (data ?? []).map((a) => a.id);
  const { data: lines } = ids.length
    ? await supabase.from("inventory_transactions").select("reference_id, quantity, total_cost").eq("reference_type", "stock_adjustment").in("reference_id", ids)
    : { data: [] };
  const agg = new Map<string, { n: number; value: number; net: number }>();
  for (const l of lines ?? []) {
    const a = agg.get(l.reference_id!) ?? { n: 0, value: 0, net: 0 };
    a.n++;
    a.value += Number(l.total_cost);
    a.net += Number(l.quantity);
    agg.set(l.reference_id!, a);
  }
  const costs = ctx.can("costing.read");

  return (
    <>
      <PageHeader
        title="Stock adjustments"
        description="Count corrections, damage, wastage and found stock. Every adjustment needs a reason and is audited."
        actions={
          ctx.can("inventory.adjust") && (
            <Button asChild variant="primary">
              <Link href="/inventory/adjustments/new">
                <Plus /> New adjustment
              </Link>
            </Button>
          )
        }
      />
      <Card>
        {(data ?? []).length === 0 ? (
          <EmptyState icon={<SlidersHorizontal />} title="No adjustments yet" />
        ) : (
          <Table>
            <THead>
              <tr>
                <TH>Number</TH>
                <TH>Date</TH>
                <TH>Warehouse</TH>
                <TH>Reason</TH>
                <TH align="right">Lines</TH>
                {costs && <TH align="right">Value impact</TH>}
                <TH>Notes</TH>
                <TH>By</TH>
              </tr>
            </THead>
            <TBody>
              {(data ?? []).map((a) => {
                const g = agg.get(a.id);
                return (
                  <TR key={a.id}>
                    <TD className="font-mono text-xs">
                      {a.number}
                    </TD>
                    <TD className="text-muted">{formatDateTime(a.created_at, ctx.settings.date_format, ctx.settings.timezone)}</TD>
                    <TD>{(a.warehouses as unknown as { name: string }).name}</TD>
                    <TD>
                      <Badge tone={a.reason === "damaged" || a.reason === "wastage" || a.reason === "expired" ? "danger" : "warning"}>{sentenceCase(a.reason)}</Badge>
                    </TD>
                    <TD align="right">{formatQty(g?.n ?? 0)}</TD>
                    {costs && <TD align="right" className={(g?.value ?? 0) < 0 ? "text-danger-ink" : ""}>{formatMoney(g?.value ?? 0, ctx.settings.currency)}</TD>}
                    <TD className="max-w-64 truncate text-muted">{a.notes ?? "—"}</TD>
                    <TD className="text-muted">{(a.profiles as unknown as { full_name: string } | null)?.full_name}</TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        )}
        <Pagination params={params} total={count ?? 0} base="/inventory/adjustments" sp={sp} />
      </Card>
    </>
  );
}
