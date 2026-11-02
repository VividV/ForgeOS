import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { OrgContext } from "@/lib/auth";
import type { ToolDef, ToolResult } from "./engine";

const S = (props: Record<string, unknown>, required: string[] = []) => ({ type: "object", properties: props, required, additionalProperties: false });
const cap = <T,>(rows: T[] | null | undefined, n = 30) => (rows ?? []).slice(0, n);

/** Read-only tools over the user's own permission-checked data, plus two proposal tools. */
export function copilotTools(ctx: OrgContext): ToolDef[] {
  const t: ToolDef[] = [
    { name: "get_overview", description: "Mission Control numbers for the last 7 days: active, late and completed orders, output, rejection, stock alerts.", parameters: S({}) },
    { name: "list_alerts", description: "Current operational alerts (late orders, shortages, over-consumption, low stock, late deliveries, customer orders needing production…).", parameters: S({}) },
    { name: "find_production_orders", description: "Search production orders by status or product name/number.", parameters: S({ status: { type: "string", enum: ["open", "late", "draft", "awaiting_approval", "materials_pending", "in_progress", "completed", "cancelled"] }, search: { type: "string" } }) },
    { name: "get_production_order", description: "Details of one production order by number (e.g. PRD-00012): steps, materials, progress.", parameters: S({ number: { type: "string" } }, ["number"]) },
    { name: "stock_levels", description: "Stock on hand, reserved and available for materials and finished goods. Optional search, or low_only for items at/below reorder level.", parameters: S({ search: { type: "string" }, low_only: { type: "boolean" } }) },
    { name: "demand_forecast", description: "Forecast product demand from recent dispatches and open customer orders, with projected shortfall and weeks of stock cover.", parameters: S({ weeks: { type: "integer", minimum: 1, maximum: 12 } }) },
    { name: "material_requirements", description: "What materials need ordering: needs of open production plus forecast, against stock and open purchase orders, with order-by dates.", parameters: S({ weeks: { type: "integer", minimum: 1, maximum: 12 } }) },
    { name: "bottlenecks", description: "Which production stages have the most work waiting or take longest (bottleneck analysis).", parameters: S({ days: { type: "integer", minimum: 7, maximum: 90 } }) },
    { name: "anomalies", description: "Statistical anomalies: reject spikes, material over-use, unusual adjustments, output drops, late suppliers.", parameters: S({}) },
    { name: "customer_orders", description: "Customer orders with status, value, amount paid and balance due.", parameters: S({ status: { type: "string", enum: ["open", "all"] } }) },
    { name: "quality_summary", description: "Defects by category and severity over recent days.", parameters: S({ days: { type: "integer", minimum: 1, maximum: 365 } }) },
    {
      name: "propose_purchase_requisition",
      description: "Prepare (NOT submit) a purchase requisition for materials. The user must confirm it in the app. Use material codes from stock_levels or material_requirements.",
      parameters: S({ lines: { type: "array", items: S({ code: { type: "string" }, quantity: { type: "number", exclusiveMinimum: 0 } }, ["code", "quantity"]), minItems: 1, maxItems: 20 }, reason: { type: "string" } }, ["lines"]),
    },
    {
      name: "propose_production_order",
      description: "Prepare (NOT create) a production order for a product. The user must confirm it in the app.",
      parameters: S({ product_code: { type: "string" }, quantity: { type: "number", exclusiveMinimum: 0 }, due_date: { type: "string", description: "YYYY-MM-DD" } }, ["product_code", "quantity"]),
    },
  ];
  if (ctx.can("costing.read")) t.push({ name: "product_cost", description: "Estimated cost per unit, selling price and gross margin for a product (by code).", parameters: S({ product_code: { type: "string" } }, ["product_code"]) });
  return t;
}

export function copilotExecutor(ctx: OrgContext, sb: SupabaseClient) {
  const org = ctx.org.id;
  return async (name: string, a: Record<string, unknown>): Promise<ToolResult> => {
    switch (name) {
      case "get_overview": {
        const from = new Date(Date.now() - 6 * 86400000).toISOString().slice(0, 10);
        const { data } = await sb.rpc("dashboard_summary", { p_org: org, p_factory: null, p_from: from, p_to: null });
        return { data };
      }
      case "list_alerts": {
        const { data } = await sb.rpc("operational_alerts", { p_org: org, p_factory: null });
        return { data: cap(data as unknown[], 40) };
      }
      case "find_production_orders": {
        let q = sb.from("production_orders").select("number, status, priority, quantity_planned, quantity_completed, quantity_rejected, due_date, products(name, code)").eq("organization_id", org);
        const st = String(a.status ?? "open");
        const today = new Date().toISOString().slice(0, 10);
        if (st === "open") q = q.not("status", "in", "(completed,cancelled)");
        else if (st === "late") q = q.lt("due_date", today).not("status", "in", "(completed,cancelled,draft)");
        else q = q.eq("status", st);
        if (a.search) q = q.or(`number.ilike.%${String(a.search).replace(/[%,()]/g, "")}%`);
        const { data } = await q.order("due_date", { ascending: true, nullsFirst: false }).limit(30);
        return { data };
      }
      case "get_production_order": {
        const { data: o } = await sb.from("production_orders").select("id, number, status, priority, quantity_planned, quantity_completed, quantity_rejected, due_date, planned_start_date, notes, products(name, code)").eq("organization_id", org).ilike("number", String(a.number ?? "")).maybeSingle();
        if (!o) return { data: { error: "Not found or not visible to you" } };
        const [{ data: ops }, { data: mats }] = await Promise.all([
          sb.from("production_operations").select("sequence, name, status, quantity_completed, quantity_rejected").eq("production_order_id", o.id).order("sequence"),
          sb.from("production_material_reconciliation").select("name, uom_code, quantity_required, quantity_reserved, quantity_issued, quantity_consumed").eq("production_order_id", o.id),
        ]);
        return { data: { ...o, id: undefined, steps: ops, materials: mats } };
      }
      case "stock_levels": {
        let q = sb.from("stock_levels").select("code, name, kind, uom_code, on_hand, reserved, available, reorder_level, stock_status").eq("organization_id", org).eq("is_active", true);
        if (a.low_only) q = q.in("stock_status", ["low", "out_of_stock"]);
        if (a.search) q = q.or(`name.ilike.%${String(a.search).replace(/[%,()]/g, "")}%,code.ilike.%${String(a.search).replace(/[%,()]/g, "")}%`);
        const { data } = await q.order("name").limit(40);
        return { data };
      }
      case "demand_forecast": {
        const { data } = await sb.rpc("demand_forecast", { p_org: org, p_weeks: Number(a.weeks ?? 4) });
        return { data: cap(data as unknown[]) };
      }
      case "material_requirements": {
        const { data } = await sb.rpc("material_requirements", { p_org: org, p_weeks: Number(a.weeks ?? 4) });
        return { data: cap(data as unknown[]) };
      }
      case "bottlenecks": {
        const { data } = await sb.rpc("bottleneck_analysis", { p_org: org, p_days: Number(a.days ?? 30) });
        return { data };
      }
      case "anomalies": {
        const { data } = await sb.rpc("detect_anomalies", { p_org: org });
        return { data };
      }
      case "customer_orders": {
        let q = sb.from("sales_orders").select("number, status, order_date, requested_date, total, amount_paid, amount_credited, customers(name)").eq("organization_id", org);
        if ((a.status ?? "open") === "open") q = q.in("status", ["confirmed", "partially_dispatched"]);
        const { data } = await q.order("order_date", { ascending: false }).limit(30);
        return { data: (data ?? []).map((o) => ({ ...o, balance_due: Number(o.total) - Number(o.amount_paid) - Number(o.amount_credited) })) };
      }
      case "quality_summary": {
        const days = Number(a.days ?? 30);
        const to = new Date().toISOString().slice(0, 10);
        const from = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
        const { data } = await sb.rpc("defect_summary", { p_org: org, p_from: from, p_to: to });
        return { data };
      }
      case "product_cost": {
        if (!ctx.can("costing.read")) return { data: { error: "You don't have access to costs" } };
        const { data: p } = await sb.from("products").select("id, name, code").eq("organization_id", org).ilike("code", String(a.product_code ?? "")).maybeSingle();
        if (!p) return { data: { error: "Product not found" } };
        const { data } = await sb.rpc("product_cost_estimate", { p_product: p.id, p_save: false });
        return { data };
      }
      case "propose_purchase_requisition": {
        const lines = (Array.isArray(a.lines) ? a.lines : []) as { code: string; quantity: number }[];
        const codes = lines.map((l) => String(l.code));
        const { data: items } = await sb.from("stock_item_details").select("id, code, name, uom_code").eq("organization_id", org).not("material_id", "is", null).in("code", codes);
        const resolved = lines.map((l) => ({ ...l, item: (items ?? []).find((i) => i.code.toLowerCase() === String(l.code).toLowerCase()) })).filter((l) => l.item && Number(l.quantity) > 0);
        if (resolved.length === 0) return { data: { error: "None of those material codes were found" } };
        return {
          data: { prepared: true, note: "Shown to the user for confirmation; nothing has been submitted yet.", lines: resolved.map((l) => ({ code: l.item!.code, quantity: l.quantity })) },
          proposal: {
            kind: "requisition",
            title: "Purchase requisition",
            summary: resolved.map((l) => `${l.item!.name}: ${l.quantity} ${l.item!.uom_code}`),
            payload: { source: "ai", notes: String(a.reason ?? "Suggested by the AI copilot").slice(0, 900), lines: resolved.map((l) => ({ stock_item_id: l.item!.id, quantity: Number(l.quantity) })) },
          },
        };
      }
      case "propose_production_order": {
        const { data: p } = await sb.from("products").select("id, name, code").eq("organization_id", org).ilike("code", String(a.product_code ?? "")).maybeSingle();
        if (!p) return { data: { error: "Product not found" } };
        const { data: f } = await sb.from("factories").select("id, name").eq("organization_id", org).is("deleted_at", null).order("created_at").limit(1).maybeSingle();
        if (!f) return { data: { error: "No factory set up" } };
        const due = typeof a.due_date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(a.due_date) ? a.due_date : "";
        return {
          data: { prepared: true, note: "Shown to the user for confirmation; nothing has been created yet." },
          proposal: {
            kind: "production_order",
            title: "Production order",
            summary: [`${p.name} (${p.code})`, `Quantity: ${a.quantity}`, `Factory: ${f.name}`, due ? `Due: ${due}` : "No due date"],
            payload: { product_id: p.id, factory_id: f.id, quantity: Number(a.quantity), priority: "normal", due_date: due, source: "manual", submit: true },
          },
        };
      }
    }
    return { data: { error: "Unknown tool" } };
  };
}
