"use client";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";
import { saveTemplate } from "@/app/actions/quality";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, FormError, Input, Select, Textarea } from "@/components/ui/form";

type Check = { name: string; check_type: "pass_fail" | "measurement" | "text"; target: string; required: boolean };
export type TemplateValues = { name: string; applies_to: "production" | "goods_receipt"; stage_id: string; product_id: string; description: string; items: Check[] };

export function TemplateForm({ id, initial, stages, products }: { id: string | null; initial: TemplateValues; stages: { value: string; label: string }[]; products: { value: string; label: string }[] }) {
  const router = useRouter();
  const [v, setV] = React.useState(initial);
  const [error, setError] = React.useState<string | null>(null);
  const [pending, start] = React.useTransition();
  const setItem = (i: number, p: Partial<Check>) => setV((x) => ({ ...x, items: x.items.map((it, j) => (j === i ? { ...it, ...p } : it)) }));
  const move = (i: number, d: -1 | 1) =>
    setV((x) => {
      const items = [...x.items];
      const j = i + d;
      if (j < 0 || j >= items.length) return x;
      [items[i], items[j]] = [items[j], items[i]];
      return { ...x, items };
    });
  const submit = () =>
    start(async () => {
      setError(null);
      const r = await saveTemplate(id, v);
      if (!r.ok) return setError(r.error + (r.fieldErrors ? ` (${Object.values(r.fieldErrors).join("; ")})` : ""));
      toast.success(r.message ?? "Saved");
      router.push(r.data?.redirect ?? "/operations/quality/templates");
    });
  return (
    <div className="flex flex-col gap-4">
      <FormError message={error} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Name" htmlFor="t-name" required>
          <Input id="t-name" value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} placeholder="e.g. Final garment inspection" />
        </Field>
        <Field label="Used for" htmlFor="t-for">
          <Select id="t-for" value={v.applies_to} onChange={(e) => setV({ ...v, applies_to: e.target.value as TemplateValues["applies_to"] })}>
            <option value="production">Production inspections</option>
            <option value="goods_receipt">Incoming goods</option>
          </Select>
        </Field>
        {v.applies_to === "production" && (
          <>
            <Field label="Stage (optional)" htmlFor="t-stage">
              <Select id="t-stage" value={v.stage_id} onChange={(e) => setV({ ...v, stage_id: e.target.value })}>
                <option value="">Any stage</option>
                {stages.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Product (optional)" htmlFor="t-prod">
              <Select id="t-prod" value={v.product_id} onChange={(e) => setV({ ...v, product_id: e.target.value })}>
                <option value="">Any product</option>
                {products.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </Select>
            </Field>
          </>
        )}
      </div>
      <Field label="Description" htmlFor="t-desc">
        <Textarea id="t-desc" value={v.description} onChange={(e) => setV({ ...v, description: e.target.value })} />
      </Field>
      <fieldset className="rounded-lg border border-line">
        <legend className="ml-3 px-1 text-xs font-semibold uppercase tracking-wide text-muted">Checks</legend>
        <div className="divide-y divide-line">
          {v.items.map((it, i) => (
            <div key={i} className="grid items-center gap-2 px-3 py-2 sm:grid-cols-[minmax(0,1fr)_140px_140px_auto_auto]">
              <Input className="h-8" aria-label={`Check ${i + 1}`} placeholder="What to check" value={it.name} onChange={(e) => setItem(i, { name: e.target.value })} />
              <Select className="h-8" aria-label="Type" value={it.check_type} onChange={(e) => setItem(i, { check_type: e.target.value as Check["check_type"] })}>
                <option value="pass_fail">Pass / fail</option>
                <option value="measurement">Measurement</option>
                <option value="text">Note</option>
              </Select>
              <Input className="h-8" aria-label="Target" placeholder="Target (e.g. 72cm ±1)" value={it.target} onChange={(e) => setItem(i, { target: e.target.value })} />
              <Checkbox label="Required" checked={it.required} onChange={(e) => setItem(i, { required: e.target.checked })} />
              <div className="flex">
                <Button size="icon-sm" variant="ghost" aria-label="Move up" onClick={() => move(i, -1)} disabled={i === 0}>
                  <ArrowUp />
                </Button>
                <Button size="icon-sm" variant="ghost" aria-label="Move down" onClick={() => move(i, 1)} disabled={i === v.items.length - 1}>
                  <ArrowDown />
                </Button>
                <Button size="icon-sm" variant="ghost" aria-label="Remove check" onClick={() => setV((x) => ({ ...x, items: x.items.filter((_, j) => j !== i) }))} disabled={v.items.length === 1}>
                  <Trash2 />
                </Button>
              </div>
            </div>
          ))}
        </div>
        <div className="px-3 py-2">
          <Button size="sm" variant="ghost" onClick={() => setV((x) => ({ ...x, items: [...x.items, { name: "", check_type: "pass_fail", target: "", required: true }] }))}>
            <Plus /> Add check
          </Button>
        </div>
      </fieldset>
      <div className="flex justify-end gap-2 border-t border-line pt-4">
        <Button variant="ghost" onClick={() => router.back()}>
          Cancel
        </Button>
        <Button variant="primary" loading={pending} onClick={submit}>
          Save checklist
        </Button>
      </div>
    </div>
  );
}
