"use client";
import { Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, FormError, Input, Select, Textarea } from "@/components/ui/form";
import { adjustStock } from "@/app/actions/inventory";
import { formatQty } from "@/lib/format";
import { idempotencyKey } from "@/lib/utils";

type Line = { item: string; mode: "delta" | "count"; value: string; cost: string };

export function AdjustmentForm({
  warehouses,
  items,
  balances,
  canOverride,
  showCosts,
}: {
  warehouses: { value: string; label: string }[];
  items: { value: string; label: string; uom: string }[];
  balances: { item: string; wh: string; on_hand: number; available: number }[];
  canOverride: boolean;
  showCosts: boolean;
}) {
  const router = useRouter();
  const [wh, setWh] = React.useState(warehouses[0]?.value ?? "");
  const [reason, setReason] = React.useState("count_correction");
  const [notes, setNotes] = React.useState("");
  const [override, setOverride] = React.useState(false);
  const [lines, setLines] = React.useState<Line[]>([{ item: "", mode: "count", value: "", cost: "" }]);
  const [error, setError] = React.useState<string | null>(null);
  const [pending, start] = React.useTransition();
  const idem = React.useRef(idempotencyKey());
  const bal = (item: string) => balances.find((b) => b.item === item && b.wh === wh);
  const delta = (l: Line) => {
    const v = Number(l.value);
    if (!l.item || l.value === "" || !Number.isFinite(v)) return 0;
    return l.mode === "count" ? v - (bal(l.item)?.on_hand ?? 0) : v;
  };
  const removalOnly = ["damaged", "wastage", "expired"].includes(reason);

  const submit = () =>
    start(async () => {
      setError(null);
      const payload = lines.filter((l) => l.item && delta(l) !== 0).map((l) => ({ stock_item_id: l.item, quantity: +delta(l).toFixed(4), unit_cost: l.cost || undefined }));
      if (!payload.length) return setError("No changes to post. Enter a counted quantity that differs from the system, or a quantity to add/remove.");
      const r = await adjustStock({ warehouse_id: wh, reason, notes, allow_negative: override, lines: payload, idem: idem.current });
      if (!r.ok) return setError(r.error + (r.fieldErrors ? ` (${Object.values(r.fieldErrors).join("; ")})` : ""));
      toast.success(r.message ?? "Posted");
      router.push("/inventory/adjustments");
    });

  return (
    <div className="flex flex-col gap-4">
      <FormError message={error} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Warehouse" htmlFor="adj-wh" required>
          <Select id="adj-wh" value={wh} onChange={(e) => setWh(e.target.value)}>
            {warehouses.map((w) => (
              <option key={w.value} value={w.value}>
                {w.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Reason" htmlFor="adj-reason" required>
          <Select
            id="adj-reason"
            value={reason}
            onChange={(e) => {
              setReason(e.target.value);
              if (["damaged", "wastage", "expired"].includes(e.target.value)) setLines((ls) => ls.map((l) => ({ ...l, mode: "delta" })));
            }}
          >
            <option value="count_correction">Stock count correction</option>
            <option value="damaged">Damaged</option>
            <option value="wastage">Wastage</option>
            <option value="expired">Expired</option>
            <option value="found">Found stock</option>
            <option value="other">Other</option>
          </Select>
        </Field>
      </div>
      <div className="overflow-x-auto rounded-lg border border-line">
        <table className="w-full text-[13px]">
          <thead className="bg-subtle/60 text-left text-[11.5px] uppercase tracking-wide text-muted">
            <tr>
              <th className="px-3 py-2 font-medium">Item</th>
              <th className="px-3 py-2 text-right font-medium">System on hand</th>
              <th className="px-3 py-2 font-medium">Entry</th>
              <th className="px-3 py-2 text-right font-medium">Change</th>
              {showCosts && <th className="px-3 py-2 font-medium">Unit cost (additions)</th>}
              <th />
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {lines.map((l, i) => {
              const it = items.find((x) => x.value === l.item);
              const d = delta(l);
              const b = bal(l.item);
              return (
                <tr key={i}>
                  <td className="px-3 py-2">
                    <Select value={l.item} onChange={(e) => setLines((ls) => ls.map((x, j) => (j === i ? { ...x, item: e.target.value } : x)))} aria-label="Item" className="h-8 min-w-56">
                      <option value="">Choose…</option>
                      {items.map((x) => (
                        <option key={x.value} value={x.value}>
                          {x.label}
                        </option>
                      ))}
                    </Select>
                  </td>
                  <td className="tabular px-3 py-2 text-right">{l.item ? `${formatQty(b?.on_hand ?? 0, 4)} ${it?.uom}` : "—"}</td>
                  <td className="px-3 py-2">
                    <div className="flex gap-1">
                      {!removalOnly && (
                        <Select value={l.mode} onChange={(e) => setLines((ls) => ls.map((x, j) => (j === i ? { ...x, mode: e.target.value as Line["mode"] } : x)))} className="h-8 w-28" aria-label="Entry mode">
                          <option value="count">Counted</option>
                          <option value="delta">+/− qty</option>
                        </Select>
                      )}
                      <Input className="h-8 w-28 text-right" type="number" step="any" value={l.value} onChange={(e) => setLines((ls) => ls.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))} placeholder={removalOnly ? "-5" : l.mode === "count" ? "counted" : "+/−"} aria-label="Quantity" />
                    </div>
                  </td>
                  <td className={`tabular px-3 py-2 text-right font-medium ${d < 0 ? "text-danger-ink" : d > 0 ? "text-success" : "text-muted"}`}>
                    {d > 0 ? "+" : ""}
                    {formatQty(d, 4)}
                  </td>
                  {showCosts && (
                    <td className="px-3 py-2">
                      <Input className="h-8 w-28 text-right" type="number" step="any" min="0" value={l.cost} disabled={d <= 0} onChange={(e) => setLines((ls) => ls.map((x, j) => (j === i ? { ...x, cost: e.target.value } : x)))} placeholder="avg" aria-label="Unit cost" />
                    </td>
                  )}
                  <td className="px-2">
                    <Button size="icon-sm" variant="ghost" onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))} disabled={lines.length === 1} aria-label="Remove line">
                      <Trash2 />
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div>
        <Button size="sm" onClick={() => setLines((ls) => [...ls, { item: "", mode: removalOnly ? "delta" : "count", value: "", cost: "" }])}>
          <Plus /> Add line
        </Button>
      </div>
      <Field label="Notes" htmlFor="adj-notes" required={reason === "count_correction" || reason === "other" || override} hint="Explain what happened. Required for count corrections, other adjustments and negative-stock overrides.">
        <Textarea id="adj-notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Field>
      {canOverride && <Checkbox label="Allow stock to go negative (authorised exception — audited)" checked={override} onChange={(e) => setOverride(e.target.checked)} />}
      <div className="flex justify-end gap-2 border-t border-line pt-4">
        <Button variant="ghost" onClick={() => router.back()}>
          Cancel
        </Button>
        <Button variant="primary" onClick={submit} loading={pending}>
          Post adjustment
        </Button>
      </div>
    </div>
  );
}
