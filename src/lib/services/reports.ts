import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

export type ReportKey = "production" | "efficiency" | "consumption" | "valuation" | "movements" | "wastage" | "procurement" | "suppliers" | "quality" | "costing";

export const REPORTS: { key: ReportKey; title: string; description: string; perm: string[]; costs?: boolean }[] = [
  { key: "production", title: "Production report", description: "Orders completed in the period: planned vs actual output, rejects and material cost.", perm: ["production_orders.read"] },
  { key: "efficiency", title: "Production efficiency", description: "On-time completion, cycle time and yield per order completed in the period.", perm: ["production_orders.read"] },
  { key: "consumption", title: "Material consumption", description: "Materials issued, returned and wasted on production orders, by material.", perm: ["production_orders.read", "inventory.read"] },
  { key: "wastage", title: "Wastage report", description: "Recorded material wastage with reasons.", perm: ["production_orders.read"] },
  { key: "valuation", title: "Inventory valuation", description: "Current stock on hand by item at weighted average cost.", perm: ["inventory.read"], costs: true },
  { key: "movements", title: "Stock movement summary", description: "Inbound and outbound quantities per item and movement type in the period.", perm: ["inventory.read"] },
  { key: "procurement", title: "Purchase orders", description: "Purchase orders raised in the period with value, received quantity and delivery status.", perm: ["procurement.read"] },
  { key: "suppliers", title: "Supplier performance", description: "Per supplier: orders, value, on-time delivery and rejected goods for receipts in the period.", perm: ["procurement.read"] },
  { key: "quality", title: "Quality and defects", description: "Inspections in the period with pass rates, and defects by category and severity.", perm: ["quality.read"] },
  { key: "costing", title: "Production cost (estimate vs actual)", description: "Full cost of orders completed in the period: material, labour, machine and overhead, against the estimate.", perm: ["costing.read"], costs: true },
];

export type Column = { key: string; label: string; kind?: "qty" | "money" | "pct" | "date" | "text" };
export type Report = { columns: Column[]; rows: Record<string, string | number | null>[]; totals?: Record<string, number> };

/** Builds a report from live records through the caller's RLS-scoped client. */
export async function buildReport(
  sb: SupabaseClient,
  org: string,
  key: ReportKey,
  opts: { from: string; to: string; factory?: string | null; costs: boolean },
): Promise<Report> {
  const toExcl = new Date(new Date(`${opts.to}T00:00:00Z`).getTime() + 86400000).toISOString();
  const fromIso = `${opts.from}T00:00:00Z`;
  const money = (c: Column[]) => (opts.costs ? c : c.filter((x) => x.kind !== "money"));

  if (key === "production" || key === "efficiency") {
    let q = sb
      .from("production_orders")
      .select("number, status, quantity_planned, quantity_completed, quantity_rejected, due_date, actual_start_at, actual_end_at, created_at, products(name, code), factories(name), production_outputs(material_cost, unit_cost)")
      .eq("organization_id", org)
      .eq("status", "completed")
      .gte("actual_end_at", fromIso)
      .lt("actual_end_at", toExcl)
      .order("actual_end_at");
    if (opts.factory) q = q.eq("factory_id", opts.factory);
    const { data, error } = await q.limit(5000);
    if (error) throw error;
    const rows = (data ?? []).map((o) => {
      const out = ((o.production_outputs as { material_cost: number; unit_cost: number }[]) ?? [])[0];
      const total = Number(o.quantity_completed) + Number(o.quantity_rejected);
      const cycleDays = o.actual_start_at && o.actual_end_at ? (new Date(o.actual_end_at).getTime() - new Date(o.actual_start_at).getTime()) / 86400000 : null;
      const end = o.actual_end_at?.slice(0, 10) ?? null;
      return {
        number: o.number,
        product: (o.products as unknown as { name: string }).name,
        factory: (o.factories as unknown as { name: string } | null)?.name ?? "",
        completed: end,
        due: o.due_date,
        planned: Number(o.quantity_planned),
        accepted: Number(o.quantity_completed),
        rejected: Number(o.quantity_rejected),
        yield_pct: total ? (Number(o.quantity_completed) / total) * 100 : null,
        vs_plan_pct: (Number(o.quantity_completed) / Number(o.quantity_planned)) * 100,
        on_time: o.due_date && end ? (end <= o.due_date ? "Yes" : "No") : "—",
        cycle_days: cycleDays !== null ? Math.round(cycleDays * 10) / 10 : null,
        material_cost: out ? Number(out.material_cost) : null,
        unit_cost: out ? Number(out.unit_cost) : null,
      };
    });
    const sum = (k: string) => rows.reduce((s, r) => s + Number((r as Record<string, unknown>)[k] ?? 0), 0);
    if (key === "production") {
      return {
        columns: money([
          { key: "number", label: "Order" }, { key: "product", label: "Product" }, { key: "factory", label: "Factory" }, { key: "completed", label: "Completed", kind: "date" },
          { key: "planned", label: "Planned", kind: "qty" }, { key: "accepted", label: "Accepted", kind: "qty" }, { key: "rejected", label: "Rejected", kind: "qty" },
          { key: "vs_plan_pct", label: "Actual vs plan", kind: "pct" }, { key: "material_cost", label: "Material cost (actual)", kind: "money" }, { key: "unit_cost", label: "Full cost / accepted unit", kind: "money" },
        ]),
        rows,
        totals: { planned: sum("planned"), accepted: sum("accepted"), rejected: sum("rejected"), material_cost: sum("material_cost") },
      };
    }
    return {
      columns: [
        { key: "number", label: "Order" }, { key: "product", label: "Product" }, { key: "due", label: "Due", kind: "date" }, { key: "completed", label: "Completed", kind: "date" },
        { key: "on_time", label: "On time" }, { key: "cycle_days", label: "Cycle time (days)", kind: "qty" }, { key: "yield_pct", label: "Yield", kind: "pct" }, { key: "vs_plan_pct", label: "Output vs plan", kind: "pct" },
      ],
      rows,
    };
  }

  if (key === "consumption") {
    let q = sb
      .from("inventory_transactions")
      .select("stock_item_id, txn_type, quantity, total_cost, production_order_id, production_orders!inner(factory_id), stock_item_details(name, code, uom_code)")
      .eq("organization_id", org)
      .in("txn_type", ["production_issue", "production_return"])
      .gte("occurred_at", fromIso)
      .lt("occurred_at", toExcl);
    if (opts.factory) q = q.eq("production_orders.factory_id", opts.factory);
    const [{ data, error }, { data: scrap }] = await Promise.all([
      q.limit(20000),
      sb.from("production_scrap").select("stock_item_id, quantity").eq("organization_id", org).gte("created_at", fromIso).lt("created_at", toExcl).limit(20000),
    ]);
    if (error) throw error;
    const by = new Map<string, Record<string, string | number | null>>();
    for (const t of data ?? []) {
      const d = t.stock_item_details as unknown as { name: string; code: string; uom_code: string };
      const r = by.get(t.stock_item_id) ?? { code: d.code, material: d.name, uom: d.uom_code, issued: 0, returned: 0, wasted: 0, net: 0, value: 0, orders: 0 };
      if (t.txn_type === "production_issue") r.issued = Number(r.issued) - Number(t.quantity);
      else r.returned = Number(r.returned) + Number(t.quantity);
      r.net = Number(r.issued) - Number(r.returned);
      r.value = Number(r.value) - Number(t.total_cost);
      by.set(t.stock_item_id, r);
    }
    for (const s of scrap ?? []) {
      const r = by.get(s.stock_item_id ?? "");
      if (r) r.wasted = Number(r.wasted) + Number(s.quantity);
    }
    const rows = [...by.values()].sort((a, b) => Number(b.value) - Number(a.value));
    return {
      columns: money([
        { key: "code", label: "Code" }, { key: "material", label: "Material" }, { key: "uom", label: "Unit" }, { key: "issued", label: "Issued", kind: "qty" },
        { key: "returned", label: "Returned", kind: "qty" }, { key: "net", label: "Net consumed", kind: "qty" }, { key: "wasted", label: "Of which wasted", kind: "qty" }, { key: "value", label: "Net value", kind: "money" },
      ]),
      rows,
      totals: { value: rows.reduce((s, r) => s + Number(r.value), 0) },
    };
  }

  if (key === "wastage") {
    let q = sb
      .from("production_scrap")
      .select("quantity, reason, created_at, production_orders!inner(number, factory_id), stock_item_details(name, uom_code), production_operations(name), profiles:created_by(full_name)")
      .eq("organization_id", org)
      .gte("created_at", fromIso)
      .lt("created_at", toExcl)
      .order("created_at");
    if (opts.factory) q = q.eq("production_orders.factory_id", opts.factory);
    const { data, error } = await q.limit(5000);
    if (error) throw error;
    return {
      columns: [
        { key: "date", label: "Date", kind: "date" }, { key: "order", label: "Order" }, { key: "material", label: "Material" }, { key: "quantity", label: "Quantity", kind: "qty" },
        { key: "uom", label: "Unit" }, { key: "step", label: "Step" }, { key: "reason", label: "Reason" }, { key: "by", label: "Recorded by" },
      ],
      rows: (data ?? []).map((s) => ({
        date: s.created_at.slice(0, 10),
        order: (s.production_orders as unknown as { number: string }).number,
        material: (s.stock_item_details as unknown as { name: string } | null)?.name ?? "",
        quantity: Number(s.quantity),
        uom: (s.stock_item_details as unknown as { uom_code: string } | null)?.uom_code ?? "",
        step: (s.production_operations as unknown as { name: string } | null)?.name ?? "",
        reason: s.reason,
        by: (s.profiles as unknown as { full_name: string } | null)?.full_name ?? "",
      })),
    };
  }

  if (key === "valuation") {
    const { data, error } = await sb.from("stock_levels").select("code, name, kind, uom_code, on_hand, reserved, available, average_cost, stock_value").eq("organization_id", org).neq("on_hand", 0).order("stock_value", { ascending: false }).limit(10000);
    if (error) throw error;
    const rows = (data ?? []).map((r) => ({ ...r, kind: String(r.kind).replace("_", " "), on_hand: Number(r.on_hand), reserved: Number(r.reserved), available: Number(r.available), average_cost: Number(r.average_cost), stock_value: Number(r.stock_value) }));
    return {
      columns: money([
        { key: "code", label: "Code" }, { key: "name", label: "Item" }, { key: "kind", label: "Type" }, { key: "uom_code", label: "Unit" }, { key: "on_hand", label: "On hand", kind: "qty" },
        { key: "reserved", label: "Reserved", kind: "qty" }, { key: "available", label: "Available", kind: "qty" }, { key: "average_cost", label: "Avg cost", kind: "money" }, { key: "stock_value", label: "Value", kind: "money" },
      ]),
      rows,
      totals: { stock_value: rows.reduce((s, r) => s + r.stock_value, 0) },
    };
  }

  if (key === "procurement") {
    const { data, error } = await sb
      .from("purchase_orders")
      .select("number, status, order_date, expected_date, subtotal, discount_total, tax_total, shipping_cost, total, suppliers(name), purchase_order_items(quantity, quantity_received, quantity_rejected)")
      .eq("organization_id", org)
      .gte("order_date", opts.from)
      .lte("order_date", opts.to)
      .order("order_date")
      .limit(5000);
    if (error) throw error;
    const today = new Date().toISOString().slice(0, 10);
    const rows = (data ?? []).map((p) => {
      const items = (p.purchase_order_items as { quantity: number; quantity_received: number; quantity_rejected: number }[]) ?? [];
      const ordered = items.reduce((a, i) => a + Number(i.quantity), 0);
      const accepted = items.reduce((a, i) => a + Number(i.quantity_received) - Number(i.quantity_rejected), 0);
      return {
        number: p.number,
        supplier: (p.suppliers as unknown as { name: string }).name,
        ordered_on: p.order_date,
        expected: p.expected_date,
        status: String(p.status).replace(/_/g, " "),
        received_pct: ordered ? (accepted / ordered) * 100 : null,
        rejected: items.reduce((a, i) => a + Number(i.quantity_rejected), 0),
        overdue: p.expected_date && p.expected_date < today && ["approved", "sent", "partially_received"].includes(p.status) ? "Yes" : "",
        subtotal: Number(p.subtotal) - Number(p.discount_total),
        tax: Number(p.tax_total),
        total: Number(p.total),
      };
    });
    return {
      columns: ([
        { key: "number", label: "PO" }, { key: "supplier", label: "Supplier" }, { key: "ordered_on", label: "Ordered", kind: "date" }, { key: "expected", label: "Expected", kind: "date" },
        { key: "status", label: "Status" }, { key: "received_pct", label: "Received", kind: "pct" }, { key: "rejected", label: "Rejected qty", kind: "qty" }, { key: "overdue", label: "Overdue" },
        { key: "subtotal", label: "Net of discount", kind: "money" }, { key: "tax", label: "Tax", kind: "money" }, { key: "total", label: "Total", kind: "money" },
      ]),
      rows,
      totals: { subtotal: rows.reduce((a, r) => a + r.subtotal, 0), tax: rows.reduce((a, r) => a + r.tax, 0), total: rows.reduce((a, r) => a + r.total, 0) },
    };
  }

  if (key === "suppliers") {
    const { data, error } = await sb
      .from("goods_receipts")
      .select("received_at, purchase_orders!inner(id, expected_date, total, supplier_id, suppliers(name)), goods_receipt_items(quantity_received, quantity_rejected)")
      .eq("organization_id", org)
      .gte("received_at", fromIso)
      .lt("received_at", toExcl)
      .limit(10000);
    if (error) throw error;
    const by = new Map<string, { supplier: string; pos: Set<string>; deliveries: number; on_time: number; received: number; rejected: number; value: number }>();
    for (const g of data ?? []) {
      const po = g.purchase_orders as unknown as { id: string; expected_date: string | null; total: number; supplier_id: string; suppliers: { name: string } };
      const r = by.get(po.supplier_id) ?? { supplier: po.suppliers.name, pos: new Set<string>(), deliveries: 0, on_time: 0, received: 0, rejected: 0, value: 0 };
      if (!r.pos.has(po.id)) {
        r.pos.add(po.id);
        r.value += Number(po.total);
      }
      r.deliveries += 1;
      if (!po.expected_date || g.received_at.slice(0, 10) <= po.expected_date) r.on_time += 1;
      for (const i of (g.goods_receipt_items as { quantity_received: number; quantity_rejected: number }[]) ?? []) {
        r.received += Number(i.quantity_received);
        r.rejected += Number(i.quantity_rejected);
      }
      by.set(po.supplier_id, r);
    }
    const rows = [...by.values()]
      .map((r) => ({ supplier: r.supplier, orders: r.pos.size, deliveries: r.deliveries, on_time_pct: r.deliveries ? (r.on_time / r.deliveries) * 100 : null, received: r.received, rejected: r.rejected, reject_pct: r.received ? (r.rejected / r.received) * 100 : null, value: r.value }))
      .sort((a, b) => b.value - a.value);
    return {
      columns: ([
        { key: "supplier", label: "Supplier" }, { key: "orders", label: "POs delivered against", kind: "qty" }, { key: "deliveries", label: "Deliveries", kind: "qty" }, { key: "on_time_pct", label: "On time", kind: "pct" },
        { key: "received", label: "Qty received", kind: "qty" }, { key: "rejected", label: "Qty rejected", kind: "qty" }, { key: "reject_pct", label: "Reject rate", kind: "pct" }, { key: "value", label: "PO value", kind: "money" },
      ]),
      rows,
    };
  }

  if (key === "quality") {
    const { data, error } = await sb
      .from("quality_checks")
      .select("number, check_type, is_final, result, quantity_inspected, quantity_passed, quantity_rejected, inspected_at, production_orders(number, factory_id), goods_receipts(number), products(name), quality_defects(category, severity, quantity)")
      .eq("organization_id", org)
      .gte("inspected_at", fromIso)
      .lt("inspected_at", toExcl)
      .order("inspected_at")
      .limit(10000);
    if (error) throw error;
    const rows = (data ?? [])
      .filter((c) => !opts.factory || (c.production_orders as unknown as { factory_id: string } | null)?.factory_id === opts.factory)
      .map((c) => {
        const defects = (c.quality_defects as { category: string; severity: string; quantity: number }[]) ?? [];
        return {
          date: c.inspected_at.slice(0, 10),
          number: c.number,
          source: c.check_type === "production" ? `${(c.production_orders as unknown as { number: string } | null)?.number ?? ""}${c.is_final ? " (final)" : ""}` : `GRN ${(c.goods_receipts as unknown as { number: string } | null)?.number ?? ""}`,
          product: (c.products as unknown as { name: string } | null)?.name ?? "",
          result: c.result,
          inspected: Number(c.quantity_inspected),
          passed: Number(c.quantity_passed),
          rejected: Number(c.quantity_rejected),
          pass_pct: Number(c.quantity_inspected) ? (Number(c.quantity_passed) / Number(c.quantity_inspected)) * 100 : null,
          defects: defects.map((d) => `${d.category} (${d.severity}) ×${Number(d.quantity)}`).join("; "),
        };
      });
    const sum = (k: "inspected" | "passed" | "rejected") => rows.reduce((a, r) => a + r[k], 0);
    return {
      columns: [
        { key: "date", label: "Date", kind: "date" }, { key: "number", label: "QC" }, { key: "source", label: "Source" }, { key: "product", label: "Product" }, { key: "result", label: "Result" },
        { key: "inspected", label: "Inspected", kind: "qty" }, { key: "passed", label: "Passed", kind: "qty" }, { key: "rejected", label: "Rejected", kind: "qty" }, { key: "pass_pct", label: "Pass rate", kind: "pct" }, { key: "defects", label: "Defects" },
      ],
      rows,
      totals: { inspected: sum("inspected"), passed: sum("passed"), rejected: sum("rejected") },
    };
  }

  if (key === "costing") {
    let q = sb
      .from("production_cost_snapshots")
      .select("quantity_planned, quantity_accepted, material_cost, labour_cost, machine_cost, overhead_cost, other_cost, total_cost, unit_cost, estimated_total, estimated_unit_cost, selling_price, created_at, production_orders!inner(number, factory_id), products(name)")
      .eq("organization_id", org)
      .gte("created_at", fromIso)
      .lt("created_at", toExcl)
      .order("created_at");
    if (opts.factory) q = q.eq("production_orders.factory_id", opts.factory);
    const { data, error } = await q.limit(5000);
    if (error) throw error;
    const rows = (data ?? []).map((c) => ({
      completed: c.created_at.slice(0, 10),
      order: (c.production_orders as unknown as { number: string }).number,
      product: (c.products as unknown as { name: string }).name,
      accepted: Number(c.quantity_accepted),
      material: Number(c.material_cost),
      labour: Number(c.labour_cost),
      machine: Number(c.machine_cost),
      overhead: Number(c.overhead_cost) + Number(c.other_cost),
      total: Number(c.total_cost),
      estimated_total: Number(c.estimated_total),
      variance: Number(c.total_cost) - Number(c.estimated_total),
      unit_cost: Number(c.unit_cost),
      estimated_unit: Number(c.estimated_unit_cost),
      margin_pct: c.selling_price && Number(c.selling_price) > 0 ? ((Number(c.selling_price) - Number(c.unit_cost)) / Number(c.selling_price)) * 100 : null,
    }));
    const sum = (k: keyof (typeof rows)[number]) => rows.reduce((a, r) => a + Number(r[k] ?? 0), 0);
    return {
      columns: money([
        { key: "completed", label: "Completed", kind: "date" }, { key: "order", label: "Order" }, { key: "product", label: "Product" }, { key: "accepted", label: "Accepted", kind: "qty" },
        { key: "material", label: "Material", kind: "money" }, { key: "labour", label: "Labour", kind: "money" }, { key: "machine", label: "Machine", kind: "money" }, { key: "overhead", label: "Overhead & other", kind: "money" },
        { key: "total", label: "Actual total", kind: "money" }, { key: "estimated_total", label: "Estimated total", kind: "money" }, { key: "variance", label: "Variance", kind: "money" },
        { key: "unit_cost", label: "Actual / unit", kind: "money" }, { key: "estimated_unit", label: "Estimate / unit", kind: "money" }, { key: "margin_pct", label: "Gross margin", kind: "pct" },
      ]),
      rows,
      totals: { accepted: sum("accepted"), material: sum("material"), labour: sum("labour"), machine: sum("machine"), overhead: sum("overhead"), total: sum("total"), estimated_total: sum("estimated_total"), variance: sum("variance") },
    };
  }

  // movements summary
  const { data, error } = await sb
    .from("inventory_transactions")
    .select("stock_item_id, txn_type, quantity, total_cost, stock_item_details(name, code, uom_code)")
    .eq("organization_id", org)
    .gte("occurred_at", fromIso)
    .lt("occurred_at", toExcl)
    .limit(50000);
  if (error) throw error;
  const by = new Map<string, Record<string, string | number>>();
  for (const t of data ?? []) {
    const d = t.stock_item_details as unknown as { name: string; code: string; uom_code: string };
    const k = `${t.stock_item_id}:${t.txn_type}`;
    const r = by.get(k) ?? { code: d.code, item: d.name, uom: d.uom_code, type: t.txn_type.replace(/_/g, " "), movements: 0, quantity: 0, value: 0 };
    r.movements = Number(r.movements) + 1;
    r.quantity = Number(r.quantity) + Number(t.quantity);
    r.value = Number(r.value) + Number(t.total_cost);
    by.set(k, r);
  }
  return {
    columns: money([
      { key: "code", label: "Code" }, { key: "item", label: "Item" }, { key: "type", label: "Movement" }, { key: "movements", label: "Count", kind: "qty" },
      { key: "quantity", label: "Net quantity", kind: "qty" }, { key: "uom", label: "Unit" }, { key: "value", label: "Net value", kind: "money" },
    ]),
    rows: [...by.values()].sort((a, b) => String(a.item).localeCompare(String(b.item))),
  };
}

export { toCsv } from "@/lib/csv-export";
