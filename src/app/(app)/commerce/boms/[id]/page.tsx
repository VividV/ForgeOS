import { notFound } from "next/navigation";
import { BomStatusBadge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader, DescriptionList } from "@/components/ui/card";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { TBody, TD, TH, THead, TR, Table } from "@/components/ui/table";
import { getSession, requirePermission } from "@/lib/auth";
import { formatDateTime, formatMoney, formatQty } from "@/lib/format";
import { BomActions, BomHeaderForm, BomLineAdd, BomLineRow } from "./client";

export default async function BomPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requirePermission("bom.read");
  const { supabase } = await getSession();
  const { data: b } = await supabase
    .from("bills_of_materials")
    .select("*, products(id, code, name, selling_price, units_of_measure(code)), product_variants(name)")
    .eq("id", id)
    .eq("organization_id", ctx.org.id)
    .maybeSingle();
  if (!b) notFound();
  const product = b.products as unknown as { id: string; code: string; name: string; selling_price: number | null; units_of_measure: { code: string } };
  const [{ data: lines }, { data: items }, { data: people }] = await Promise.all([
    supabase.rpc("bom_cost_estimate", { p_bom: id }),
    b.status === "draft" && ctx.can("bom.update")
      ? supabase.from("stock_item_details").select("id, code, name, kind, uom_code, product_id").eq("organization_id", ctx.org.id).eq("is_active", true).order("name")
      : Promise.resolve({ data: [] }),
    supabase.from("profiles").select("id, full_name").in("id", [b.approved_by, b.submitted_by, b.created_by].filter(Boolean) as string[]),
  ]);
  const costs = ctx.can("costing.read");
  const cur = ctx.settings.currency;
  type Line = { bom_item_id: string; line_no: number; stock_item_id: string; code: string; name: string; uom_code: string; quantity: number; wastage_pct: number; gross_quantity: number; unit_cost: number | null; line_cost: number | null; cost_per_output_unit: number | null };
  const rows = (lines ?? []) as Line[];
  const total = rows.reduce((s, r) => s + Number(r.cost_per_output_unit ?? 0), 0);
  const editable = b.status === "draft" && ctx.can("bom.update");
  const name = (uid: string | null) => (people ?? []).find((p) => p.id === uid)?.full_name || "—";
  const used = new Set(rows.map((r) => r.stock_item_id));
  const options = ((items ?? []) as { id: string; code: string; name: string; kind: string; uom_code: string; product_id: string | null }[])
    .filter((i) => !used.has(i.id) && i.product_id !== product.id)
    .map((i) => ({ value: i.id, label: `${i.name} (${i.code}) · ${i.uom_code}`, group: i.kind === "finished_good" ? "Sub-assemblies (products)" : "Materials" }));

  return (
    <>
      <PageHeader
        title={`${product.name} · BOM v${b.version}`}
        meta={<BomStatusBadge status={b.status} />}
        breadcrumb={[{ label: "Products", href: "/commerce/products" }, { label: product.code, href: `/commerce/products/${product.id}` }, { label: `BOM v${b.version}` }]}
        description={`Quantities are per ${formatQty(b.output_quantity)} ${product.units_of_measure.code} of output${(b.product_variants as unknown as { name: string } | null) ? ` · ${(b.product_variants as unknown as { name: string }).name} only` : ""}.`}
        actions={<BomActions bomId={b.id} productId={product.id} status={b.status} can={{ update: ctx.can("bom.update"), approve: ctx.can("bom.approve"), create: ctx.can("bom.create") }} lineCount={rows.length} />}
      />
      <div className="grid gap-4 xl:grid-cols-[1fr_340px]">
        <Card>
          <CardHeader title="Materials" description="Gross quantity includes the expected wastage allowance." />
          {rows.length === 0 ? (
            <EmptyState title="No materials yet" description={editable ? "Add the first material below." : "This BOM has no lines."} />
          ) : (
            <Table>
              <THead>
                <tr>
                  <TH>#</TH>
                  <TH>Material</TH>
                  <TH align="right">Qty</TH>
                  <TH align="right">Wastage</TH>
                  <TH align="right">Gross qty</TH>
                  {costs && <TH align="right">Unit cost</TH>}
                  {costs && <TH align="right">Cost / unit</TH>}
                  {editable && <TH />}
                </tr>
              </THead>
              <TBody>
                {rows.map((r) =>
                  editable ? (
                    <BomLineRow key={r.bom_item_id} bomId={b.id} line={r} costs={costs} currency={cur} />
                  ) : (
                    <TR key={r.bom_item_id}>
                      <TD className="text-muted">{r.line_no}</TD>
                      <TD>
                        {r.name} <span className="font-mono text-xs text-muted">{r.code}</span>
                      </TD>
                      <TD align="right">
                        {formatQty(r.quantity, 4)} {r.uom_code}
                      </TD>
                      <TD align="right">{formatQty(r.wastage_pct)}%</TD>
                      <TD align="right">{formatQty(r.gross_quantity, 4)}</TD>
                      {costs && <TD align="right">{formatMoney(r.unit_cost, cur)}</TD>}
                      {costs && <TD align="right">{formatMoney(r.cost_per_output_unit, cur)}</TD>}
                    </TR>
                  ),
                )}
              </TBody>
              {costs && (
                <tfoot>
                  <tr className="border-t border-line-strong">
                    <td colSpan={6} className="px-3 py-2.5 text-right text-[13px] font-medium">
                      Estimated material cost per unit
                    </td>
                    <td className="tabular px-3 py-2.5 text-right text-[13px] font-semibold">{formatMoney(total, cur)}</td>
                    {editable && <td />}
                  </tr>
                </tfoot>
              )}
            </Table>
          )}
          {editable && (
            <CardBody className="border-t border-line">
              <BomLineAdd bomId={b.id} options={options} />
            </CardBody>
          )}
        </Card>
        <div className="flex flex-col gap-4">
          {costs && (
            <Card>
              <CardHeader title="Estimate" description="From current average cost, or standard cost where no stock has been valued yet. This is an estimate, not an actual cost." />
              <CardBody>
                <DescriptionList
                  className="sm:grid-cols-1"
                  items={[
                    { label: "Material cost per unit (estimate)", value: formatMoney(total, cur) },
                    { label: "Selling price", value: formatMoney(product.selling_price, cur) },
                    {
                      label: "Material margin (estimate, before labour & overhead)",
                      value: product.selling_price ? `${formatMoney(Number(product.selling_price) - total, cur)} (${(((Number(product.selling_price) - total) / Number(product.selling_price)) * 100).toFixed(1)}%)` : "—",
                    },
                  ]}
                />
              </CardBody>
            </Card>
          )}
          <Card>
            <CardHeader title="Version" />
            <CardBody>
              {editable ? (
                <BomHeaderForm bomId={b.id} defaults={{ name: b.name ?? "", output_quantity: b.output_quantity, notes: b.notes ?? "" }} />
              ) : (
                <DescriptionList
                  className="sm:grid-cols-1"
                  items={[
                    { label: "Name", value: b.name },
                    { label: "Output quantity", value: formatQty(b.output_quantity) },
                    { label: "Effective from", value: b.effective_from },
                    { label: "Submitted by", value: b.submitted_by ? `${name(b.submitted_by)} · ${formatDateTime(b.submitted_at, ctx.settings.date_format, ctx.settings.timezone)}` : "—" },
                    { label: "Approved by", value: b.approved_by ? `${name(b.approved_by)} · ${formatDateTime(b.approved_at, ctx.settings.date_format, ctx.settings.timezone)}` : "—" },
                    { label: "Notes", value: b.notes },
                  ]}
                />
              )}
            </CardBody>
          </Card>
        </div>
      </div>
    </>
  );
}
