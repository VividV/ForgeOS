import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge, BomStatusBadge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader, DescriptionList } from "@/components/ui/card";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { TBody, TD, TH, THead, TR, Table } from "@/components/ui/table";
import { getSession, requirePermission } from "@/lib/auth";
import { formatDate, formatMoney, formatQty } from "@/lib/format";
import { lookups } from "@/lib/services/lookups";
import { ProductForm } from "../product-form";
import { ArchiveProduct, NewBomButton, VariantDialog, VariantToggle } from "./client";

export default async function ProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requirePermission("products.read");
  const { supabase } = await getSession();
  const { data: p } = await supabase
    .from("products")
    .select("*, product_categories(name), units_of_measure(code, name)")
    .eq("id", id)
    .eq("organization_id", ctx.org.id)
    .is("deleted_at", null)
    .maybeSingle();
  if (!p) notFound();

  const [{ data: variants }, { data: boms }, { data: stock }, { uoms }] = await Promise.all([
    supabase.from("product_variants").select("*").eq("product_id", id).order("is_default", { ascending: false }).order("name"),
    ctx.can("bom.read")
      ? supabase.from("bills_of_materials").select("id, version, name, status, variant_id, approved_at, created_at, bom_items(count)").eq("product_id", id).order("version", { ascending: false })
      : Promise.resolve({ data: [] }),
    ctx.can("inventory.read") ? supabase.from("stock_levels").select("product_variant_id, on_hand, available, stock_value").eq("product_id", id) : Promise.resolve({ data: [] }),
    lookups(ctx.org.id, ["uoms"]),
  ]);
  const stockBy = new Map((stock ?? []).map((s: { product_variant_id: string; on_hand: number; available: number; stock_value: number }) => [s.product_variant_id, s]));
  const cur = ctx.settings.currency;
  const canEdit = ctx.can("products.update");
  const category = (p.product_categories as unknown as { name: string } | null)?.name;
  const unit = p.units_of_measure as unknown as { code: string } | null;
  const variantName = new Map((variants ?? []).map((v) => [v.id, v.name]));

  return (
    <>
      <PageHeader
        title={p.name}
        meta={<Badge tone={p.status === "active" ? "success" : "neutral"}>{p.status}</Badge>}
        breadcrumb={[{ label: "Products", href: "/commerce/products" }, { label: p.code }]}
        actions={ctx.can("products.delete") && <ArchiveProduct id={p.id} />}
      />
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_420px]">
        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader title="Bills of materials" description="Only one version is approved at a time. Production orders keep a snapshot of the version they used." action={ctx.can("bom.create") && <NewBomButton productId={p.id} approvedId={(boms ?? []).find((b) => b.status === "approved")?.id ?? null} />} />
            {(boms ?? []).length === 0 ? (
              <EmptyState title="No BOM yet" description="Define the materials needed to make one unit of this product." />
            ) : (
              <Table>
                <THead>
                  <tr>
                    <TH>Version</TH>
                    <TH>Applies to</TH>
                    <TH align="right">Lines</TH>
                    <TH>Status</TH>
                    <TH>Approved</TH>
                  </tr>
                </THead>
                <TBody>
                  {(boms ?? []).map((b) => (
                    <TR key={b.id}>
                      <TD>
                        <Link href={`/commerce/boms/${b.id}`} className="font-medium hover:text-accent-ink">
                          v{b.version} {b.name && b.name !== `Version ${b.version}` ? `· ${b.name}` : ""}
                        </Link>
                      </TD>
                      <TD className="text-muted">{b.variant_id ? variantName.get(b.variant_id) : "All variants"}</TD>
                      <TD align="right">{(b.bom_items as unknown as { count: number }[])[0]?.count ?? 0}</TD>
                      <TD>
                        <BomStatusBadge status={b.status} />
                      </TD>
                      <TD className="text-muted">{formatDate(b.approved_at, ctx.settings.date_format, ctx.settings.timezone)}</TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            )}
          </Card>

          <Card>
            <CardHeader title="Variants" description="Sizes, colours and other versions of this product." action={canEdit && <VariantDialog productId={p.id} />} />
            <Table>
              <THead>
                <tr>
                  <TH>Variant</TH>
                  <TH>SKU</TH>
                  <TH>Size</TH>
                  <TH>Colour</TH>
                  <TH align="right">Price</TH>
                  {ctx.can("inventory.read") && <TH align="right">In stock</TH>}
                  <TH>Status</TH>
                  {canEdit && <TH />}
                </tr>
              </THead>
              <TBody>
                {(variants ?? []).map((v) => (
                  <TR key={v.id}>
                    <TD>
                      {v.name} {v.is_default && <Badge className="ml-1">Default</Badge>}
                    </TD>
                    <TD className="text-muted">{v.sku ?? "—"}</TD>
                    <TD>{v.size ?? "—"}</TD>
                    <TD>{v.colour ?? "—"}</TD>
                    <TD align="right">{formatMoney(v.selling_price ?? p.selling_price, cur)}</TD>
                    {ctx.can("inventory.read") && <TD align="right">{formatQty(stockBy.get(v.id)?.on_hand ?? 0)}</TD>}
                    <TD>{v.is_active ? <Badge tone="success">Active</Badge> : <Badge>Inactive</Badge>}</TD>
                    {canEdit && (
                      <TD align="right">
                        <div className="flex justify-end gap-1">
                          <VariantDialog productId={p.id} variant={v} />
                          {!v.is_default && <VariantToggle productId={p.id} variantId={v.id} active={v.is_active} />}
                        </div>
                      </TD>
                    )}
                  </TR>
                ))}
              </TBody>
            </Table>
          </Card>
        </div>

        <Card>
          <CardHeader title="Details" />
          <CardBody>
            {canEdit ? (
              <ProductForm
                uoms={uoms}
                showCosts={ctx.can("costing.read")}
                product={{ ...p, category: category ?? "", target_cost: ctx.can("costing.read") ? p.target_cost : undefined }}
              />
            ) : (
              <DescriptionList
                items={[
                  { label: "Code", value: p.code },
                  { label: "SKU", value: p.sku },
                  { label: "Category", value: category },
                  { label: "Unit", value: unit?.code },
                  { label: "Standard time", value: p.standard_minutes_per_unit ? `${formatQty(p.standard_minutes_per_unit)} min/unit` : "—" },
                  { label: "Selling price", value: formatMoney(p.selling_price, cur) },
                  { label: "Description", value: p.description },
                ]}
              />
            )}
          </CardBody>
        </Card>
      </div>
    </>
  );
}
