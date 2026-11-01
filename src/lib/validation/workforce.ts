import { z } from "zod";
import { optDate, optText, optUuid, reqText, shortCode } from "./common";

export const employeeSchema = z.object({
  code: shortCode,
  full_name: reqText("the employee's name", 120),
  department_id: optUuid,
  factory_id: optUuid,
  default_shift_id: optUuid,
  job_title: optText(80),
  phone: optText(40),
  email: z.union([z.email("Enter a valid email"), z.literal("")]).nullish().transform((v) => v || null),
  employment_type: z.enum(["full_time", "part_time", "contract", "casual", "apprentice"]).default("full_time"),
  status: z.enum(["active", "on_leave", "left"]).default("active"),
  skills: z.string().max(500).nullish(),
  user_id: optUuid,
  start_date: optDate,
  hourly_rate: z.preprocess((v) => (v === "" || v == null ? null : Number(String(v).replace(/,/g, ""))), z.number().min(0, "Must be zero or more").nullable()).optional(),
  notes: optText(1000),
});
