import { NextResponse, type NextRequest } from "next/server";
import { getOrgContext, getSession } from "@/lib/auth";
import { REPORTS, buildReport, toCsv, type Column, type ReportKey } from "@/lib/services/reports";

const isDate = (d: string | null) => !!d && /^\d{4}-\d{2}-\d{2}$/.test(d);

/**
 * CSV exports. Uses the signed-in user's session, so RLS limits rows to their
 * organisation, and each export checks its own permission.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ kind: string }> }) {
  const { kind } = await params;
  const ctx = await getOrgContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  const { supabase } = await getSession();
  const sp = req.nextUrl.searchParams;
  const costs = ctx.can("costing.read");
  const deny = () => NextResponse.json({ error: "You don't have permission to export this." }, { status: 403 });
  let columns: Column[] = [];
  let rows: Record<string, unknown>[] = [];
  let name = kind;

  if (kind === "report") {
    const key = sp.get("report") as ReportKey;
    const meta = REPORTS.find((r) => r.key === key);
    if (!meta || !ctx.can("reports.export") || !meta.perm.some((p) => ctx.can(p)) || (meta.costs && !costs)) return deny();
    const to = isDate(sp.get("to")) ? sp.get("to")! : new Date().toISOString().slice(0, 10);
    const from = isDate(sp.get("from")) ? sp.get("from")! : to;
    const r = await buildReport(supabase, ctx.org.id, key, { from, to, factory: sp.get("factory"), costs });
    columns = r.columns;
    rows = r.rows;
    name = `${key}-${from}-to-${to}`;
  } else if (kind === "materials") {
    if (!ctx.can("materials.export")) return deny();
    const { data } = await supabase.from("stock_levels").select("code, name, sku, kind, uom_code, on_hand, reserved, available, reorder_level, min_stock, max_stock, average_cost, stock_value, stock_status").eq("organization_id", ctx.org.id).not("material_id", "is", null).order("code").limit(20000);
    rows = data ?? [];
    columns = [
      { key: "code", label: "code" }, { key: "name", label: "name" }, { key: "sku", label: "sku" }, { key: "kind", label: "type" }, { key: "uom_code", label: "unit" },
      { key: "on_hand", label: "on_hand" }, { key: "reserved", label: "reserved" }, { key: "available", label: "available" }, { key: "reorder_level", label: "reorder_level" },
      { key: "min_stock", label: "min_stock" }, { key: "max_stock", label: "max_stock" }, ...(costs ? [{ key: "average_cost", label: "average_cost" }, { key: "stock_value", label: "stock_value" }] : []), { key: "stock_status", label: "status" },
    ];
  } else if (kind === "movements") {
    if (!ctx.can("inventory.export")) return deny();
    let q = supabase
      .from("inventory_transactions")
      .select("occurred_at, txn_type, quantity, unit_cost, total_cost, balance_after, reason, notes, warehouses(code), stock_item_details(code, name, uom_code), production_orders(number)")
      .eq("organization_id", ctx.org.id)
      .order("occurred_at", { ascending: false })
      .limit(50000);
    if (sp.get("type")) q = q.eq("txn_type", sp.get("type")!);
    if (sp.get("warehouse")) q = q.eq("warehouse_id", sp.get("warehouse")!);
    const { data } = await q;
    rows = (data ?? []).map((t) => {
      const d = t.stock_item_details as unknown as { code: string; name: string; uom_code: string };
      return { ...t, warehouse: (t.warehouses as unknown as { code: string }).code, item_code: d.code, item: d.name, unit: d.uom_code, order: (t.production_orders as unknown as { number: string } | null)?.number ?? "" };
    });
    columns = [
      { key: "occurred_at", label: "occurred_at" }, { key: "item_code", label: "item_code" }, { key: "item", label: "item" }, { key: "txn_type", label: "type" }, { key: "warehouse", label: "warehouse" },
      { key: "quantity", label: "quantity" }, { key: "unit", label: "unit" }, { key: "balance_after", label: "balance_after" }, ...(costs ? [{ key: "unit_cost", label: "unit_cost" }, { key: "total_cost", label: "total_cost" }] : []),
      { key: "order", label: "production_order" }, { key: "reason", label: "reason" }, { key: "notes", label: "notes" },
    ];
  } else if (kind === "production-orders") {
    if (!ctx.can("production_orders.export")) return deny();
    const { data } = await supabase
      .from("production_orders")
      .select("number, status, priority, quantity_planned, quantity_completed, quantity_rejected, planned_start_date, due_date, actual_start_at, actual_end_at, source, source_reference, products(code, name), factories(name)")
      .eq("organization_id", ctx.org.id)
      .order("created_at", { ascending: false })
      .limit(20000);
    rows = (data ?? []).map((o) => ({ ...o, product_code: (o.products as unknown as { code: string }).code, product: (o.products as unknown as { name: string }).name, factory: (o.factories as unknown as { name: string }).name }));
    columns = ["number", "status", "priority", "product_code", "product", "factory", "quantity_planned", "quantity_completed", "quantity_rejected", "planned_start_date", "due_date", "actual_start_at", "actual_end_at", "source", "source_reference"].map((k) => ({ key: k, label: k }));
  } else {
    return NextResponse.json({ error: "Unknown export" }, { status: 404 });
  }

  return new NextResponse(toCsv(columns, rows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="forgeos-${name}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
