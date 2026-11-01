import Link from "next/link";
import { Badge, type Tone } from "@/components/ui/badge";
import { TBody, TD, TH, THead, TR, Table } from "@/components/ui/table";
import { formatDateTime, formatMoney, formatQty } from "@/lib/format";
import { ReverseButton } from "./reverse-button";

export const TXN_LABEL: Record<string, { label: string; tone: Tone }> = {
  opening_balance: { label: "Opening balance", tone: "info" },
  goods_receipt: { label: "Goods received", tone: "success" },
  production_issue: { label: "Issued to production", tone: "accent" },
  production_return: { label: "Returned from production", tone: "info" },
  finished_goods_receipt: { label: "Finished goods", tone: "success" },
  transfer_out: { label: "Transfer out", tone: "neutral" },
  transfer_in: { label: "Transfer in", tone: "neutral" },
  adjustment: { label: "Adjustment", tone: "warning" },
  damaged: { label: "Damaged", tone: "danger" },
  wastage: { label: "Wastage", tone: "danger" },
  stock_count_correction: { label: "Count correction", tone: "warning" },
  reversal: { label: "Reversal", tone: "neutral" },
  sales_dispatch: { label: "Dispatched to customer", tone: "accent" },
};

export type MovementRow = {
  id: string;
  occurred_at: string;
  txn_type: string;
  quantity: number;
  unit_cost: number;
  total_cost: number;
  balance_after: number;
  reason: string | null;
  notes: string | null;
  production_order_id: string | null;
  reversal_of_id: string | null;
  negative_override: boolean;
  warehouses?: { code: string; name: string } | null;
  stock_item_details?: { name: string; code: string; uom_code: string; material_id: string | null; product_id: string | null } | null;
  profiles?: { full_name: string } | null;
  production_orders?: { number: string } | null;
};

export function MovementsTable({
  rows,
  showItem,
  costs,
  currency,
  dateFormat,
  tz,
  canReverse,
  reversed,
}: {
  rows: MovementRow[];
  showItem?: boolean;
  costs: boolean;
  currency: string;
  dateFormat: string;
  tz: string;
  canReverse?: boolean;
  reversed?: Set<string>;
}) {
  return (
    <Table>
      <THead>
        <tr>
          <TH>When</TH>
          {showItem && <TH>Item</TH>}
          <TH>Movement</TH>
          <TH>Warehouse</TH>
          <TH align="right">Qty</TH>
          <TH align="right">Balance after</TH>
          {costs && <TH align="right">Unit cost</TH>}
          {costs && <TH align="right">Value</TH>}
          <TH>Reference</TH>
          <TH>By</TH>
          {canReverse && <TH />}
        </tr>
      </THead>
      <TBody>
        {rows.map((t) => {
          const l = TXN_LABEL[t.txn_type] ?? { label: t.txn_type, tone: "neutral" as Tone };
          const item = t.stock_item_details;
          const isReversed = reversed?.has(t.id);
          const reversible = canReverse && !t.production_order_id && t.txn_type !== "reversal" && t.txn_type !== "transfer_in" && !isReversed;
          return (
            <TR key={t.id} className={isReversed ? "opacity-60" : undefined}>
              <TD className="whitespace-nowrap text-muted">{formatDateTime(t.occurred_at, dateFormat, tz)}</TD>
              {showItem && (
                <TD>
                  {item?.material_id ? (
                    <Link href={`/inventory/materials/${item.material_id}`} className="hover:text-accent-ink">
                      {item.name}
                    </Link>
                  ) : item?.product_id ? (
                    <Link href={`/commerce/products/${item.product_id}`} className="hover:text-accent-ink">
                      {item.name}
                    </Link>
                  ) : (
                    item?.name
                  )}
                </TD>
              )}
              <TD>
                <Badge tone={l.tone}>{l.label}</Badge>
                {t.negative_override && <Badge tone="danger" className="ml-1">Negative override</Badge>}
                {isReversed && <Badge className="ml-1">Reversed</Badge>}
              </TD>
              <TD className="text-muted">{t.warehouses?.code}</TD>
              <TD align="right" className={Number(t.quantity) < 0 ? "text-danger-ink" : "text-success"}>
                {Number(t.quantity) > 0 ? "+" : ""}
                {formatQty(t.quantity, 4)} {showItem && <span className="text-xs text-muted">{item?.uom_code}</span>}
              </TD>
              <TD align="right">{formatQty(t.balance_after, 4)}</TD>
              {costs && <TD align="right">{formatMoney(t.unit_cost, currency)}</TD>}
              {costs && <TD align="right">{formatMoney(t.total_cost, currency)}</TD>}
              <TD className="max-w-56 truncate text-muted" title={[t.reason, t.notes].filter(Boolean).join(" · ")}>
                {t.production_order_id && t.production_orders ? (
                  <Link href={`/operations/production-orders/${t.production_order_id}`} className="text-accent-ink hover:underline">
                    {t.production_orders.number}
                  </Link>
                ) : (
                  [t.reason, t.notes].filter(Boolean).join(" · ") || "—"
                )}
              </TD>
              <TD className="whitespace-nowrap text-muted">{t.profiles?.full_name || "—"}</TD>
              {canReverse && <TD align="right">{reversible && <ReverseButton id={t.id} />}</TD>}
            </TR>
          );
        })}
      </TBody>
    </Table>
  );
}

export const MOVEMENT_SELECT =
  "id, occurred_at, txn_type, quantity, unit_cost, total_cost, balance_after, reason, notes, production_order_id, reversal_of_id, negative_override, warehouses(code, name), stock_item_details(name, code, uom_code, material_id, product_id), profiles:created_by(full_name), production_orders(number)";
