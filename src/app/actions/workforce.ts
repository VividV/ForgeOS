"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { actionContext } from "@/lib/auth";
import { friendlyError, type ActionResult } from "@/lib/errors";
import { optText, optUuid, parseOrFields, reqText } from "@/lib/validation/common";
import { employeeSchema } from "@/lib/validation/workforce";

type R = ActionResult<{ id?: string; redirect?: string }>;
const fail = (e: { code?: string; message?: string }): R => ({ ok: false, error: friendlyError(e) });
const touch = () => revalidatePath("/workforce", "layout");

export async function saveEmployee(id: string | null, values: Record<string, unknown>): Promise<R> {
  const p = parseOrFields(employeeSchema, values);
  if (!p.ok) return p.error;
  const c = await actionContext("workforce.manage");
  if ("error" in c) return { ok: false, error: c.error! };
  const org = c.ctx.org.id;
  const { hourly_rate, skills, ...row } = p.data;
  const rec = { ...row, skills: (skills ?? "").split(",").map((s) => s.trim()).filter(Boolean).slice(0, 30) };
  const q = id
    ? c.supabase.from("employees").update(rec).eq("id", id).eq("organization_id", org).select("id").single()
    : c.supabase.from("employees").insert({ ...rec, organization_id: org }).select("id").single();
  const { data, error } = await q;
  if (error) {
    if (error.code === "23505") return error.message.includes("user") ? { ok: false, error: "That team member is already linked to another employee", fieldErrors: { user_id: "Already linked" } } : { ok: false, error: "An employee with this code already exists", fieldErrors: { code: "Already used" } };
    return fail(error);
  }
  const pay = await c.supabase.from("employee_pay").upsert({ employee_id: data.id, organization_id: org, hourly_rate: hourly_rate ?? null });
  if (pay.error) return fail(pay.error);
  touch();
  return { ok: true, data: { id: data.id }, message: id ? "Employee updated" : "Employee added" };
}

const deptSchema = z.object({ name: reqText("a department name", 80), factory_id: optUuid, description: optText(300) });
export async function saveDepartment(id: string | null, values: Record<string, unknown>): Promise<R> {
  const p = parseOrFields(deptSchema, values);
  if (!p.ok) return p.error;
  const c = await actionContext("workforce.manage");
  if ("error" in c) return { ok: false, error: c.error! };
  const org = c.ctx.org.id;
  const { error } = id
    ? await c.supabase.from("departments").update(p.data).eq("id", id).eq("organization_id", org)
    : await c.supabase.from("departments").insert({ ...p.data, organization_id: org });
  if (error) return error.code === "23505" ? { ok: false, error: "A department with this name already exists" } : fail(error);
  touch();
  return { ok: true, message: "Department saved" };
}

const time = z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/, "Enter a time like 08:00");
const shiftSchema = z.object({
  name: reqText("a shift name", 60),
  factory_id: optUuid,
  start_time: time,
  end_time: time,
  break_minutes: z.preprocess((v) => (v === "" || v == null ? 0 : Number(v)), z.number().int().min(0).max(600)),
});
export async function saveShift(id: string | null, values: Record<string, unknown>): Promise<R> {
  const p = parseOrFields(shiftSchema, values);
  if (!p.ok) return p.error;
  const c = await actionContext("workforce.manage");
  if ("error" in c) return { ok: false, error: c.error! };
  const org = c.ctx.org.id;
  const { error } = id
    ? await c.supabase.from("shifts").update(p.data).eq("id", id).eq("organization_id", org)
    : await c.supabase.from("shifts").insert({ ...p.data, organization_id: org });
  if (error) return error.code === "23505" ? { ok: false, error: "A shift with this name already exists" } : fail(error);
  touch();
  return { ok: true, message: "Shift saved" };
}

export async function setActive(table: "departments" | "shifts", id: string, active: boolean): Promise<R> {
  if (table !== "departments" && table !== "shifts") return { ok: false, error: "Not allowed" };
  const c = await actionContext("workforce.manage");
  if ("error" in c) return { ok: false, error: c.error! };
  const { error } = await c.supabase.from(table).update({ is_active: active }).eq("id", id).eq("organization_id", c.ctx.org.id);
  if (error) return fail(error);
  touch();
  return { ok: true, message: active ? "Activated" : "Deactivated" };
}

const attendanceSchema = z.object({
  work_date: z.iso.date("Choose a date"),
  shift_id: optUuid,
  entries: z
    .array(z.object({ employee_id: z.uuid(), status: z.union([z.enum(["present", "late", "half_day", "absent", "leave", "off"]), z.literal("")]), clock_in: z.string().max(8).optional(), clock_out: z.string().max(8).optional(), notes: optText(200) }))
    .max(2000),
});
export async function saveAttendance(values: unknown): Promise<R> {
  const p = parseOrFields(attendanceSchema, values);
  if (!p.ok) return p.error;
  const c = await actionContext("attendance.record");
  if ("error" in c) return { ok: false, error: c.error! };
  const entries = p.data.entries.filter((e) => e.status);
  if (entries.length === 0) return { ok: false, error: "Mark at least one employee" };
  const { data, error } = await c.supabase.rpc("attendance_record", { p_org: c.ctx.org.id, p: { ...p.data, entries } });
  if (error) return fail(error);
  touch();
  return { ok: true, message: `Attendance saved for ${data} employee${data === 1 ? "" : "s"}` };
}

