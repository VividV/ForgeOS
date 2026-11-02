"use client";
import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";
import { saveStockCount } from "@/app/actions/ops";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/form";
import { formatQty } from "@/lib/format";

type Line = { line_id: string; code: string; name: string; uom_code: string; kind: string; expected: number | null; counted: number | null; note: string | null };

export function CountSheet({ countId, lines, editable }: { countId: string; lines: Line[]; editable: boolean }) {
  const router = useRouter();
  const [vals, setVals] = React.useState<Record<string, { counted: string; note: string }>>(Object.fromEntries(lines.map((l) => [l.line_id, { counted: l.counted == null ? "" : String(Number(l.counted)), note: l.note ?? "" }])));
  const [filter, setFilter] = React.useState("");
  const [pending, start] = React.useTransition();
  const dirty = lines.some((l) => (l.counted == null ? "" : String(Number(l.counted))) !== vals[l.line_id].counted || (l.note ?? "") !== vals[l.line_id].note);
  const shown = lines.filter((l) => !filter || `${l.name} ${l.code}`.toLowerCase().includes(filter.toLowerCase()));
  const done = Object.values(vals).filter((v) => v.counted !== "").length;
  const save = () =>
    start(async () => {
      const r = await saveStockCount(countId, lines.map((l) => ({ line_id: l.line_id, ...vals[l.line_id] })));
      if (!r.ok) return void toast.error(r.error);
      toast.success(r.message ?? "Saved");
      router.refresh();
    });
  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3">
        <Input className="h-8 max-w-xs" placeholder="Find an item" value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Find an item" />
        <span className="text-xs text-muted">
          {done} of {lines.length} counted
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-[13px]">
          <thead className="bg-subtle/60 text-left text-[11.5px] uppercase tracking-wide text-muted">
            <tr>
              <th className="px-4 py-2 font-medium">Item</th>
              <th className="px-3 py-2 text-right font-medium">System</th>
              <th className="px-3 py-2 font-medium">Counted</th>
              <th className="px-3 py-2 text-right font-medium">Difference</th>
              <th className="px-3 py-2 font-medium">Note</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {shown.map((l) => {
              const v = vals[l.line_id];
              const diff = l.expected != null && v.counted !== "" ? Number(v.counted) - Number(l.expected) : null;
              return (
                <tr key={l.line_id}>
                  <td className="px-4 py-2">
                    {l.name} <span className="font-mono text-xs text-muted">{l.code}</span>
                  </td>
                  <td className="tabular px-3 py-2 text-right text-muted">{l.expected == null ? "Hidden" : `${formatQty(l.expected, 4)} ${l.uom_code}`}</td>
                  <td className="px-3 py-2">
                    <Input className="h-8 w-28 text-right" type="number" min="0" step="any" inputMode="decimal" disabled={!editable} aria-label={`Counted ${l.name}`} value={v.counted} onChange={(e) => setVals((x) => ({ ...x, [l.line_id]: { ...x[l.line_id], counted: e.target.value } }))} />
                  </td>
                  <td className={`tabular px-3 py-2 text-right ${diff == null ? "text-muted" : diff < 0 ? "text-danger-ink" : diff > 0 ? "text-success" : ""}`}>{diff == null ? "—" : `${diff > 0 ? "+" : ""}${formatQty(diff, 4)}`}</td>
                  <td className="px-3 py-2">
                    <Input className="h-8 min-w-40" disabled={!editable} aria-label={`Note ${l.name}`} value={v.note} onChange={(e) => setVals((x) => ({ ...x, [l.line_id]: { ...x[l.line_id], note: e.target.value } }))} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {editable && (
        <div className="flex items-center justify-end gap-3 border-t border-line px-4 py-3">
          {dirty && <span className="text-xs text-warning-ink">Unsaved counts</span>}
          <Button variant="primary" loading={pending} onClick={save}>
            Save counts
          </Button>
        </div>
      )}
    </div>
  );
}
