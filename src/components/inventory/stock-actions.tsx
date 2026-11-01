"use client";
import { ArrowLeftRight, PackagePlus, SlidersHorizontal } from "lucide-react";
import * as React from "react";
import { z } from "zod";
import { FormDialog } from "@/components/forms/form-dialog";
import { adjustStock, receiveStock, transferStock } from "@/app/actions/inventory";
import { idempotencyKey } from "@/lib/utils";

type Opt = { value: string; label: string }[];

/** Receive / opening balance / transfer / quick adjust for one stock item. */
export function StockActions({
  stockItemId,
  uom,
  warehouses,
  defaultWarehouse,
  can,
  showCosts,
  defaultCost,
}: {
  stockItemId: string;
  uom: string;
  warehouses: Opt;
  defaultWarehouse?: string | null;
  can: { create: boolean; adjust: boolean };
  showCosts: boolean;
  defaultCost?: number | null;
}) {
  // One idempotency key per intended movement: a retried request can't post twice,
  // and the key rotates after each success so the next movement is recorded.
  const keyRef = React.useRef(idempotencyKey());
  const once = async <T extends { ok: boolean }>(fn: (idem: string) => Promise<T>) => {
    const r = await fn(keyRef.current);
    if (r.ok) keyRef.current = idempotencyKey();
    return r;
  };
  const wh = defaultWarehouse ?? warehouses[0]?.value;
  const qtyHint = `In ${uom}`;
  return (
    <>
      {can.create && (
        <FormDialog
          triggerLabel="Receive stock"
          triggerIcon={<PackagePlus />}
          triggerVariant="primary"
          title="Receive stock"
          description="Records goods received into a warehouse. Valued into the weighted-average cost."
          schema={z.object({ warehouse_id: z.uuid("Choose a warehouse"), quantity: z.string().min(1, "Enter a quantity"), type: z.string() })}
          defaultValues={{ warehouse_id: wh, type: "goods_receipt", unit_cost: showCosts ? (defaultCost ?? "") : "0" }}
          fields={[
            { name: "type", label: "Type", type: "select", required: true, options: [{ value: "goods_receipt", label: "Goods received" }, { value: "opening_balance", label: "Opening balance (stock already on hand when starting)" }] },
            { name: "warehouse_id", label: "Warehouse", type: "select", required: true, options: warehouses },
            { name: "quantity", label: "Quantity", type: "number", required: true, hint: qtyHint },
            ...(showCosts ? [{ name: "unit_cost", label: `Unit cost per ${uom}`, type: "number" as const, required: true }] : []),
            { name: "reference", label: "Reference", placeholder: "Delivery note / invoice no." },
            { name: "notes", label: "Notes", type: "textarea" },
          ]}
          action={(v) => once((idem) => receiveStock({ ...v, stock_item_id: stockItemId, unit_cost: showCosts ? v.unit_cost : 0, idem }))}
        />
      )}
      {can.create && warehouses.length > 1 && (
        <FormDialog
          triggerLabel="Transfer"
          triggerIcon={<ArrowLeftRight />}
          title="Transfer stock"
          description="Moves available stock between warehouses. Reserved stock stays where it is."
          schema={z.object({ from_warehouse_id: z.uuid("Choose a warehouse"), to_warehouse_id: z.uuid("Choose a warehouse"), quantity: z.string().min(1, "Enter a quantity") })}
          defaultValues={{ from_warehouse_id: wh }}
          fields={[
            { name: "from_warehouse_id", label: "From", type: "select", required: true, options: warehouses },
            { name: "to_warehouse_id", label: "To", type: "select", required: true, options: warehouses },
            { name: "quantity", label: "Quantity", type: "number", required: true, hint: qtyHint },
            { name: "notes", label: "Notes", type: "textarea" },
          ]}
          action={(v) => once((idem) => transferStock({ ...v, stock_item_id: stockItemId, idem }))}
        />
      )}
      {can.adjust && (
        <FormDialog
          triggerLabel="Adjust"
          triggerIcon={<SlidersHorizontal />}
          title="Adjust stock"
          description="Use a negative quantity to remove stock (damage, wastage, count shortfall) and positive to add (found, count surplus)."
          schema={z.object({ warehouse_id: z.uuid("Choose a warehouse"), reason: z.string().min(1), quantity: z.string().min(1, "Enter a quantity") })}
          defaultValues={{ warehouse_id: wh, reason: "count_correction" }}
          fields={[
            { name: "warehouse_id", label: "Warehouse", type: "select", required: true, options: warehouses },
            { name: "reason", label: "Reason", type: "select", required: true, options: [
              { value: "count_correction", label: "Stock count correction" }, { value: "damaged", label: "Damaged" }, { value: "wastage", label: "Wastage" },
              { value: "expired", label: "Expired" }, { value: "found", label: "Found stock" }, { value: "other", label: "Other" },
            ] },
            { name: "quantity", label: "Quantity (+ add / − remove)", type: "number", required: true, hint: qtyHint },
            { name: "notes", label: "Notes", type: "textarea", hint: "Required for count corrections and other adjustments." },
          ]}
          action={(v) => once((idem) => adjustStock({ warehouse_id: v.warehouse_id, reason: v.reason, notes: v.notes, lines: [{ stock_item_id: stockItemId, quantity: v.quantity }], idem }))}
        />
      )}
    </>
  );
}
