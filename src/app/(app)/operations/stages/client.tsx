"use client";
import { ArrowDown, ArrowUp, Pencil, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";
import { z } from "zod";
import { ActionButton } from "@/components/forms/action-button";
import { FormDialog } from "@/components/forms/form-dialog";
import { Button } from "@/components/ui/button";
import { Checkbox, FormError, Input, Select } from "@/components/ui/form";
import { applyStageTemplate, createRouting, saveRoutingSteps, saveStage } from "@/app/actions/catalog";
import { stageSchema } from "@/lib/validation/catalog";

export function StageDialog({ stage, nextSequence }: { stage?: { id: string; name: string; sequence: number; is_quality_stage: boolean }; nextSequence?: number }) {
  return (
    <FormDialog
      triggerLabel={stage ? "" : "Add stage"}
      triggerIcon={stage ? <Pencil /> : <Plus />}
      triggerVariant={stage ? "ghost" : "primary"}
      triggerSize={stage ? "icon-sm" : "md"}
      title={stage ? `Edit ${stage.name}` : "Add stage"}
      schema={stageSchema}
      defaultValues={stage ?? { sequence: nextSequence }}
      fields={[
        { name: "name", label: "Name", required: true },
        { name: "sequence", label: "Board order", type: "number", required: true, hint: "Lower numbers appear first." },
        { name: "is_quality_stage", label: "This is a quality inspection stage", type: "checkbox" },
      ]}
      action={(v) => saveStage(stage?.id ?? null, v)}
    />
  );
}

export function TemplateButtons() {
  return (
    <div className="flex flex-wrap gap-2">
      {[
        ["generic", "General"],
        ["garment", "Garments"],
        ["food", "Food"],
        ["furniture", "Furniture"],
      ].map(([k, l]) => (
        <ActionButton
          key={k}
          size="sm"
          action={() => applyStageTemplate(k)}
          confirm={{ title: `Apply the ${l} template?`, description: "This replaces all current stages and the default routing's steps." }}
          confirmLabel="Replace stages"
        >
          {l}
        </ActionButton>
      ))}
    </div>
  );
}

export function NewRoutingDialog({ routings }: { routings: { value: string; label: string }[] }) {
  return (
    <FormDialog
      triggerLabel="New routing"
      triggerIcon={<Plus />}
      triggerSize="sm"
      title="New routing"
      description="Create a routing for a product family or a factory."
      schema={z.object({ name: z.string().trim().min(2, "Name the routing"), copy_from: z.string().optional() })}
      fields={[
        { name: "name", label: "Name", required: true },
        { name: "copy_from", label: "Copy steps from", type: "select", options: routings },
      ]}
      action={createRouting}
    />
  );
}

type Step = { stage_id: string; name: string; work_centre_id: string; standard_minutes_per_unit: string; instructions: string; requires_quality_check: boolean };

export function RoutingEditor({
  routingId,
  initial,
  stages,
  workCentres,
  editable,
}: {
  routingId: string;
  initial: Step[];
  stages: { value: string; label: string }[];
  workCentres: { value: string; label: string }[];
  editable: boolean;
}) {
  const router = useRouter();
  const [steps, setSteps] = React.useState<Step[]>(initial);
  const [pending, start] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);
  const dirty = JSON.stringify(steps) !== JSON.stringify(initial);

  const set = (i: number, patch: Partial<Step>) => setSteps((s) => s.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const move = (i: number, d: -1 | 1) =>
    setSteps((s) => {
      const n = [...s];
      const t = n[i + d];
      if (!t) return s;
      n[i + d] = n[i];
      n[i] = t;
      return n;
    });

  const save = () =>
    start(async () => {
      setError(null);
      const r = await saveRoutingSteps({
        routing_id: routingId,
        steps: steps.map((s) => ({ ...s, standard_minutes_per_unit: s.standard_minutes_per_unit || undefined })),
      });
      if (!r.ok) return setError(r.error);
      toast.success(r.message ?? "Saved");
      router.refresh();
    });

  return (
    <div className="flex flex-col gap-3">
      <FormError message={error} />
      <ol className="flex flex-col gap-2">
        {steps.map((s, i) => (
          <li key={i} className="grid grid-cols-[28px_minmax(0,1fr)] gap-2 rounded-lg border border-line p-3">
            <span className="tabular mt-2 text-center text-xs font-semibold text-muted">{i + 1}</span>
            <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_1fr_1fr_auto]">
              <Input aria-label="Step name" value={s.name} disabled={!editable} onChange={(e) => set(i, { name: e.target.value })} />
              <Select aria-label="Stage" value={s.stage_id} disabled={!editable} onChange={(e) => set(i, { stage_id: e.target.value })}>
                {stages.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </Select>
              <Select aria-label="Work centre" value={s.work_centre_id} disabled={!editable} onChange={(e) => set(i, { work_centre_id: e.target.value })}>
                <option value="">Any work centre</option>
                {workCentres.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </Select>
              {editable && (
                <div className="flex gap-1">
                  <Button size="icon-sm" variant="ghost" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Move up">
                    <ArrowUp />
                  </Button>
                  <Button size="icon-sm" variant="ghost" onClick={() => move(i, 1)} disabled={i === steps.length - 1} aria-label="Move down">
                    <ArrowDown />
                  </Button>
                  <Button size="icon-sm" variant="ghost" onClick={() => setSteps((x) => x.filter((_, j) => j !== i))} aria-label="Remove step">
                    <Trash2 />
                  </Button>
                </div>
              )}
              <Input
                aria-label="Instructions"
                placeholder="Instructions for the floor (optional)"
                className="sm:col-span-2"
                value={s.instructions}
                disabled={!editable}
                onChange={(e) => set(i, { instructions: e.target.value })}
              />
              <Input
                aria-label="Standard minutes per unit"
                placeholder="Std. minutes / unit"
                type="number"
                min="0"
                step="any"
                value={s.standard_minutes_per_unit}
                disabled={!editable}
                onChange={(e) => set(i, { standard_minutes_per_unit: e.target.value })}
              />
              <Checkbox label="Quality check" checked={s.requires_quality_check} disabled={!editable} onChange={(e) => set(i, { requires_quality_check: e.target.checked })} />
            </div>
          </li>
        ))}
      </ol>
      {editable && (
        <div className="flex items-center justify-between">
          <Button
            size="sm"
            onClick={() => setSteps((s) => [...s, { stage_id: stages[0]?.value ?? "", name: stages[0]?.label ?? "Step", work_centre_id: "", standard_minutes_per_unit: "", instructions: "", requires_quality_check: false }])}
          >
            <Plus /> Add step
          </Button>
          <Button variant="primary" onClick={save} loading={pending} disabled={!dirty}>
            Save routing
          </Button>
        </div>
      )}
    </div>
  );
}
