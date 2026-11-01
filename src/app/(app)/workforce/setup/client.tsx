"use client";
import { Pencil, Plus } from "lucide-react";
import { z } from "zod";
import { saveDepartment, saveShift, setActive } from "@/app/actions/workforce";
import { ActionButton } from "@/components/forms/action-button";
import { FormDialog } from "@/components/forms/form-dialog";

type Opt = { value: string; label: string };

export function DepartmentDialog({ factories, dept }: { factories: Opt[]; dept?: { id: string; name: string; factory_id: string; description: string } }) {
  return (
    <FormDialog
      triggerLabel={dept ? "" : "Add department"}
      triggerIcon={dept ? <Pencil /> : <Plus />}
      triggerVariant={dept ? "ghost" : "secondary"}
      triggerSize={dept ? "icon-sm" : "sm"}
      title={dept ? `Edit ${dept.name}` : "Add department"}
      schema={z.object({ name: z.string().trim().min(2, "Enter a name") })}
      fields={[
        { name: "name", label: "Name", required: true, placeholder: "e.g. Sewing" },
        { name: "factory_id", label: "Factory", type: "select", options: factories },
        { name: "description", label: "Description", span: 2 },
      ]}
      defaultValues={dept}
      action={(v) => saveDepartment(dept?.id ?? null, v)}
    />
  );
}

export function ShiftDialog({ factories, shift }: { factories: Opt[]; shift?: { id: string; name: string; factory_id: string; start_time: string; end_time: string; break_minutes: string } }) {
  return (
    <FormDialog
      triggerLabel={shift ? "" : "Add shift"}
      triggerIcon={shift ? <Pencil /> : <Plus />}
      triggerVariant={shift ? "ghost" : "secondary"}
      triggerSize={shift ? "icon-sm" : "sm"}
      title={shift ? `Edit ${shift.name}` : "Add shift"}
      description="Shifts can run past midnight (e.g. 22:00–06:00)."
      schema={z.object({ name: z.string().trim().min(2, "Enter a name"), start_time: z.string().min(4, "Start time"), end_time: z.string().min(4, "End time") })}
      fields={[
        { name: "name", label: "Name", required: true, placeholder: "e.g. Day" },
        { name: "factory_id", label: "Factory", type: "select", options: factories },
        { name: "start_time", label: "Starts", type: "time", required: true },
        { name: "end_time", label: "Ends", type: "time", required: true },
        { name: "break_minutes", label: "Unpaid break (minutes)", type: "number", min: "0" },
      ]}
      defaultValues={shift ?? { start_time: "08:00", end_time: "17:00", break_minutes: "60" }}
      action={(v) => saveShift(shift?.id ?? null, v)}
    />
  );
}

export function ToggleActive({ table, id, active }: { table: "departments" | "shifts"; id: string; active: boolean }) {
  return (
    <ActionButton size="sm" variant="ghost" action={() => setActive(table, id, !active)}>
      {active ? "Deactivate" : "Activate"}
    </ActionButton>
  );
}
