"use client";
import { Pencil, Plus } from "lucide-react";
import { ActionButton } from "@/components/forms/action-button";
import { FormDialog } from "@/components/forms/form-dialog";
import { createFactory, saveWorkCentre, setWorkCentreActive, updateFactory } from "@/app/actions/catalog";
import { factorySchema, workCentreSchema } from "@/lib/validation/catalog";
import { TIMEZONES } from "@/lib/validation/onboarding";

type FactoryRow = { id: string; name: string; address: string | null; capacity_per_day: number | null; capacity_unit: string | null; timezone: string; is_active: boolean };

export function FactoryDialog({ factory }: { factory?: FactoryRow }) {
  return (
    <FormDialog
      triggerLabel={factory ? "Edit" : "Add factory"}
      triggerIcon={factory ? <Pencil /> : <Plus />}
      triggerVariant={factory ? "ghost" : "primary"}
      triggerSize={factory ? "sm" : "md"}
      title={factory ? `Edit ${factory.name}` : "Add factory"}
      description={factory ? undefined : "A store is created for the factory automatically."}
      schema={factorySchema}
      defaultValues={factory ?? { timezone: "Africa/Lagos", is_active: true }}
      fields={[
        { name: "name", label: "Name", required: true },
        { name: "address", label: "Address" },
        { name: "capacity_per_day", label: "Capacity per day", type: "number" },
        { name: "capacity_unit", label: "Capacity unit", placeholder: "pieces" },
        { name: "timezone", label: "Time zone", type: "select", required: true, options: TIMEZONES.map((t) => ({ value: t, label: t })) },
        ...(factory ? [{ name: "is_active", label: "Active", type: "checkbox" as const }] : []),
      ]}
      action={(v) => (factory ? updateFactory(factory.id, v) : createFactory(v))}
    />
  );
}

type Centre = { id: string; factory_id: string; name: string; code: string; description: string | null; capacity_units_per_hour: number | null; hourly_cost: number | null };

export function WorkCentreDialog({ factories, defaultFactory, centre }: { factories: { value: string; label: string }[]; defaultFactory?: string; centre?: Centre }) {
  return (
    <FormDialog
      triggerLabel={centre ? "Edit" : "Add work centre"}
      triggerIcon={centre ? <Pencil /> : <Plus />}
      triggerVariant={centre ? "ghost" : "secondary"}
      triggerSize="sm"
      title={centre ? `Edit ${centre.name}` : "Add work centre"}
      schema={workCentreSchema}
      defaultValues={centre ?? { factory_id: defaultFactory }}
      fields={[
        { name: "factory_id", label: "Factory", type: "select", required: true, options: factories },
        { name: "code", label: "Code", required: true, uppercase: true, placeholder: "SEW-1" },
        { name: "name", label: "Name", required: true, placeholder: "Sewing line 1" },
        { name: "description", label: "Description" },
        { name: "capacity_units_per_hour", label: "Capacity (units per hour)", type: "number" },
        { name: "hourly_cost", label: "Hourly operating cost", type: "number", hint: "Used for costing later. Optional." },
      ]}
      action={(v) => saveWorkCentre(centre?.id ?? null, v)}
    />
  );
}

export function WorkCentreToggle({ id, active }: { id: string; active: boolean }) {
  return (
    <ActionButton
      size="sm"
      variant="ghost"
      action={() => setWorkCentreActive(id, !active)}
      confirm={active ? { title: "Deactivate work centre?", description: "It will no longer be available for new routings. Existing orders are not affected." } : undefined}
      confirmLabel="Deactivate"
    >
      {active ? "Deactivate" : "Activate"}
    </ActionButton>
  );
}
