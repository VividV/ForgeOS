import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

export type ReportKey = "production" | "efficiency" | "consumption" | "valuation" | "movements" | "wastage";

export const REPORTS: { key: ReportKey; title: string; description: string; perm: string[]; costs?: boolean }[] = [
  { key: "production", title: "Production report", description: "Orders completed in the period: planned vs actual output, rejects and material cost.", perm: ["production_orders.read"] },
  { key: "efficiency", title: "Production efficiency", description: "On-time completion, cycle time and yield per order completed in the period.", perm: ["production_orders.read"] },
  { key: "consumption", title: "Material consumption", description: "Materials issued, returned and wasted on production orders, by material.", perm: ["production_orders.read", "inventory.read"] },
  { key: "wastage", title: "Wastage report", description: "Recorded material wastage with reasons.", perm: ["production_orders.read"] },
  { key: "valuation", title: "Inventory valuation", description: "Current stock on hand by item at weighted average cost.", perm: ["inventory.read"], costs: true },
  { key: "movements", title: "Stock movement summary", description: "Inbound and outbound quantities per item and movement type in the period.", perm: ["inventory.read"] },
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
          { key: "vs_plan_pct", label: "Actual vs plan", kind: "pct" }, { key: "material_cost", label: "Material cost (actual)", kind: "money" }, { key: "unit_cost", label: "Cost / accepted unit", kind: "money" },
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
      .select("stock_item_id, txn_type, quantity, total_cost, production_order_id, production_orders!inner(factory_id), stock_item_details:stock_item_id(name, code, uom_code)")
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
      .select("quantity, reason, created_at, production_orders!inner(number, factory_id), stock_item_details:stock_item_id(name, uom_code), production_operations(name), profiles:created_by(full_name)")
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

  // movements summary
  const { data, error } = await sb
    .from("inventory_transactions")
    .select("stock_item_id, txn_type, quantity, total_cost, stock_item_details:stock_item_id(name, code, uom_code)")
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
