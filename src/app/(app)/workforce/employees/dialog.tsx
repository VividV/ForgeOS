"use client";
import { Pencil, Plus } from "lucide-react";
import { saveEmployee } from "@/app/actions/workforce";
import { FormDialog } from "@/components/forms/form-dialog";
import type { FieldDef } from "@/components/forms/schema-form";
import { employeeSchema } from "@/lib/validation/workforce";

type Opt = { value: string; label: string };

export function EmployeeDialog({
  employee,
  departments,
  shifts,
  factories,
  members,
  showPay,
}: {
  employee?: Record<string, unknown> & { id: string; full_name: string };
  departments: Opt[];
  shifts: Opt[];
  factories: Opt[];
  members: Opt[];
  showPay: boolean;
}) {
  const fields: FieldDef[] = [
    { name: "full_name", label: "Full name", required: true },
    { name: "code", label: "Staff number", required: true, uppercase: true, placeholder: "EMP-001" },
    { name: "job_title", label: "Job title", placeholder: "e.g. Machinist, Pattern cutter" },
    { name: "department_id", label: "Department", type: "select", options: departments },
    { name: "factory_id", label: "Factory", type: "select", options: factories },
    { name: "default_shift_id", label: "Usual shift", type: "select", options: shifts },
    {
      name: "employment_type",
      label: "Employment",
      type: "select",
      options: [
        { value: "full_time", label: "Full time" },
        { value: "part_time", label: "Part time" },
        { value: "contract", label: "Contract" },
        { value: "casual", label: "Casual" },
        { value: "apprentice", label: "Apprentice" },
      ],
    },
    { name: "status", label: "Status", type: "select", options: [{ value: "active", label: "Active" }, { value: "on_leave", label: "On leave" }, { value: "left", label: "Left" }] },
    { name: "phone", label: "Phone", type: "tel" },
    { name: "email", label: "Email", type: "email" },
    { name: "start_date", label: "Start date", type: "date" },
    { name: "skills", label: "Skills", placeholder: "sewing, pattern cutting, dyeing", hint: "Separate with commas" },
    ...(showPay ? [{ name: "hourly_rate", label: "Hourly rate", type: "number" as const, min: "0", step: "any", hint: "Used for labour costing. Only managers and cost viewers can see it." }] : []),
    { name: "user_id", label: "ForgeOS login (optional)", type: "select", options: members, hint: "Link if this person also signs in" },
    { name: "notes", label: "Notes", type: "textarea", span: 2 },
  ];
  return (
    <FormDialog
      wide
      triggerLabel={employee ? "Edit" : "Add employee"}
      triggerIcon={employee ? <Pencil /> : <Plus />}
      triggerVariant={employee ? "secondary" : "primary"}
      title={employee ? `Edit ${employee.full_name}` : "Add employee"}
      description={employee ? undefined : "Employees don't need a ForgeOS login. Supervisors can record their attendance and labour."}
      schema={employeeSchema}
      defaultValues={employee ?? { employment_type: "full_time", status: "active" }}
      fields={fields}
      action={(v) => saveEmployee(employee?.id ?? null, v)}
    />
  );
}
