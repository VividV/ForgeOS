import { Truck } from "lucide-react";
import { ListToolbar } from "@/components/data/toolbar";
import { Pagination, likeTerm, parseList, range, type SearchParams } from "@/components/data/list";
import { Card } from "@/components/ui/card";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { TBody, TD, TH, THead, TR, Table } from "@/components/ui/table";
import { getSession, requirePermission } from "@/lib/auth";
import { SupplierDialog } from "./dialog";

export const metadata = { title: "Suppliers" };

export default async function SuppliersPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const ctx = await requirePermission("suppliers.read");
  const sp = await searchParams;
  const params = parseList(sp, { sortable: ["name"], defaultSort: "name" });
  const { supabase } = await getSession();
  let q = supabase.from("suppliers").select("*, materials:materials!materials_preferred_supplier_id_fkey(count)", { count: "exact" }).eq("organization_id", ctx.org.id).is("deleted_at", null);
  if (params.q) q = q.or(`name.ilike.${likeTerm(params.q)},code.ilike.${likeTerm(params.q)},contact_name.ilike.${likeTerm(params.q)}`);
  const { data, count } = await q.order("name").range(...range(params));
  const manage = ctx.can("suppliers.manage");
  return (
    <>
      <PageHeader title="Suppliers" description="Who you buy materials from. Set a preferred supplier on each material to see it on reorder alerts." actions={manage && <SupplierDialog />} />
      <Card>
        <ListToolbar placeholder="Search supplier" />
        {(data ?? []).length === 0 ? (
          <EmptyState icon={<Truck />} title="No suppliers yet" description={manage ? "Add the suppliers you buy materials from." : undefined} />
        ) : (
          <Table>
            <THead>
              <tr>
                <TH>Code</TH>
                <TH>Supplier</TH>
                <TH>Contact</TH>
                <TH>Payment terms</TH>
                <TH align="right">Lead time</TH>
                <TH align="right">Materials</TH>
                {manage && <TH />}
              </tr>
            </THead>
            <TBody>
              {(data ?? []).map((s) => (
                <TR key={s.id}>
                  <TD className="font-mono text-xs">{s.code}</TD>
                  <TD className="font-medium">{s.name}</TD>
                  <TD className="text-muted">{[s.contact_name, s.phone, s.email].filter(Boolean).join(" · ") || "—"}</TD>
                  <TD className="text-muted">{s.payment_terms ?? "—"}</TD>
                  <TD align="right">{s.lead_time_days != null ? `${s.lead_time_days} days` : "—"}</TD>
                  <TD align="right">{(s.materials as unknown as { count: number }[])[0]?.count ?? 0}</TD>
                  {manage && (
                    <TD align="right">
                      <SupplierDialog supplier={s} />
                    </TD>
                  )}
                </TR>
              ))}
            </TBody>
          </Table>
        )}
        <Pagination params={params} total={count ?? 0} base="/commerce/suppliers" sp={sp} />
      </Card>
    </>
  );
}
