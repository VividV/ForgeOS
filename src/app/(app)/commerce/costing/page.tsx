import { Calculator } from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader } from "@/components/ui/card";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { TBody, TD, TH, THead, TR, Table } from "@/components/ui/table";
import { getSession, requirePermission } from "@/lib/auth";
import { formatDate, formatMoney, formatQty } from "@/lib/format";
import { RateButton, RateToggle, SaveEstimate } from "./client";

export const metadata = { title: "Product costing" };

const BASIS: Record<string, string> = { per_hour: "per labour hour", per_unit: "per unit", percent_material: "% of material", per_order: "per order" };
type Est = { product_id: string; material: number; labour: number; machine: number; overhead: number; total: number; selling_price: number | null; target_cost: number | null; note: string | null; bom_version: number | null };

export default async function CostingPage() {
  const ctx = await requirePermission("costing.read");
  const { supabase } = await getSession();
  const cur = ctx.settings.currency;
  const manage = ctx.can("costing.manage");
  const [{ data: rates }, { data: products }] = await Promise.all([
    supabase.from("cost_rates").select("*").eq("organization_id", ctx.org.id).order("kind").order("name"),
    supabase.from("products").select("id, name, code").eq("organization_id", ctx.org.id).is("deleted_at", null).neq("status", "discontinued").order("name").limit(60),
  ]);
  const ids = (products ?? []).map((p) => p.id);
  const [ests, { data: actuals }, { data: saved }] = await Promise.all([
    Promise.all(ids.map((id) => supabase.rpc("product_cost_estimate", { p_product: id, p_save: false }).then((r) => r.data as Est | null))),
    ids.length ? supabase.from("production_cost_snapshots").select("product_id, unit_cost, quantity_accepted, created_at, production_order_id").in("product_id", ids).order("created_at", { ascending: false }).limit(500) : Promise.resolve({ data: [] }),
    ids.length ? supabase.from("product_cost_snapshots").select("product_id, total_cost, created_at").in("product_id", ids).order("created_at", { ascending: false }).limit(500) : Promise.resolve({ data: [] }),
  ]);
  const lastActual = new Map<string, { unit_cost: number; created_at: string; production_order_id: string }>();
  for (const a of actuals ?? []) if (!lastActual.has(a.product_id)) lastActual.set(a.product_id, a);
  const lastStd = new Map<string, { total_cost: number; created_at: string }>();
  for (const s of saved ?? []) if (!lastStd.has(s.product_id)) lastStd.set(s.product_id, s);
  const estBy = new Map(ests.filter(Boolean).map((e) => [e!.product_id, e!]));
  const labourDefault = (rates ?? []).find((r) => r.kind === "labour" && r.is_default && r.is_active);

  return (
    <>
      <PageHeader title="Product costing" description="Cost rates, estimated cost per unit from the BOM and routing, and the latest actual cost from completed production." />
      <Card className="mb-4">
        <CardHeader
          title="Cost rates"
          description={labourDefault ? `Default labour rate: ${formatMoney(labourDefault.rate, cur)} per hour.` : "Set a default labour rate so estimates include labour."}
          action={manage && <RateButton />}
        />
        {(rates ?? []).length === 0 ? (
          <EmptyState icon={<Calculator />} title="No cost rates yet" description="Add a labour rate per hour and any overheads (e.g. 10% of material, or a fixed amount per unit)." />
        ) : (
          <Table>
            <THead>
              <tr>
                <TH>Name</TH>
                <TH>Type</TH>
                <TH align="right">Rate</TH>
                <TH>Applied</TH>
                <TH>Status</TH>
                <TH />
              </tr>
            </THead>
            <TBody>
              {(rates ?? []).map((r) => (
                <TR key={r.id}>
                  <TD className="font-medium">{r.name}</TD>
                  <TD>{r.kind === "labour" ? "Labour" : "Overhead"}</TD>
                  <TD align="right">{r.basis === "percent_material" ? `${formatQty(r.rate)}%` : formatMoney(r.rate, cur)}</TD>
                  <TD className="text-muted">
                    {BASIS[r.basis]}
                    {r.is_default ? (r.kind === "labour" ? " · default" : " · applied automatically") : " · manual"}
                  </TD>
                  <TD>{r.is_active ? <Badge tone="success">Active</Badge> : <Badge>Inactive</Badge>}</TD>
                  <TD align="right">
                    {manage && (
                      <div className="flex justify-end gap-1">
                        <RateButton rate={{ id: r.id, kind: r.kind, name: r.name, basis: r.basis, rate: String(r.rate), is_default: r.is_default }} />
                        <RateToggle id={r.id} active={r.is_active} />
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
        <CardHeader title="Cost per unit by product" description="Estimate uses the approved BOM at current average material cost, routing minutes at the default labour rate, work-centre hourly costs and automatic overheads." />
        {(products ?? []).length === 0 ? (
          <EmptyState title="No products yet" />
        ) : (
          <Table>
            <THead>
              <tr>
                <TH>Product</TH>
                <TH align="right">Material</TH>
                <TH align="right">Labour</TH>
                <TH align="right">Machine</TH>
                <TH align="right">Overhead</TH>
                <TH align="right">Estimated unit cost</TH>
                <TH align="right">Last actual</TH>
                <TH align="right">Selling price</TH>
                <TH align="right">Gross margin (est.)</TH>
                <TH />
              </tr>
            </THead>
            <TBody>
              {(products ?? []).map((p) => {
                const e = estBy.get(p.id);
                const a = lastActual.get(p.id);
                const s = lastStd.get(p.id);
                const price = e?.selling_price != null ? Number(e.selling_price) : null;
                const margin = price && e ? ((price - Number(e.total)) / price) * 100 : null;
                const variance = a && e && Number(e.total) > 0 ? ((Number(a.unit_cost) - Number(e.total)) / Number(e.total)) * 100 : null;
                return (
                  <TR key={p.id}>
                    <TD>
                      <Link href={`/commerce/products/${p.id}`} className="font-medium hover:text-accent-ink">
                        {p.name}
                      </Link>
                      <div className="text-xs text-muted">
                        {p.code}
                        {e?.note && <span className="text-warning-ink"> · {e.note}</span>}
                        {s && ` · standard ${formatMoney(s.total_cost, cur)} saved ${formatDate(s.created_at, ctx.settings.date_format)}`}
                      </div>
                    </TD>
                    <TD align="right">{e ? formatMoney(e.material, cur) : "—"}</TD>
                    <TD align="right">{e ? formatMoney(e.labour, cur) : "—"}</TD>
                    <TD align="right">{e ? formatMoney(e.machine, cur) : "—"}</TD>
                    <TD align="right">{e ? formatMoney(e.overhead, cur) : "—"}</TD>
                    <TD align="right" className="font-semibold">
                      {e ? formatMoney(e.total, cur) : "—"}
                    </TD>
                    <TD align="right">
                      {a ? (
                        <Link href={`/operations/production-orders/${a.production_order_id}`} className="hover:text-accent-ink">
                          {formatMoney(a.unit_cost, cur)}
                          {variance != null && (
                            <div className={`text-xs ${variance > 0.5 ? "text-danger-ink" : variance < -0.5 ? "text-success" : "text-muted"}`}>
                              {variance > 0 ? "+" : ""}
                              {variance.toFixed(1)}% vs est.
                            </div>
                          )}
                        </Link>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </TD>
                    <TD align="right">{price != null ? formatMoney(price, cur) : "—"}</TD>
                    <TD align="right" className={margin != null && margin < 0 ? "text-danger-ink" : ""}>
                      {margin != null ? `${margin.toFixed(1)}%` : "—"}
                    </TD>
                    <TD align="right">{manage && e && !e.note?.startsWith("No approved") && <SaveEstimate productId={p.id} />}</TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        )}
        <p className="border-t border-line px-4 py-3 text-xs text-muted">Gross margin = (selling price − cost per unit) ÷ selling price. It excludes selling, admin and tax costs.</p>
      </Card>
    </>
  );
}
