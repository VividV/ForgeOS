import { z } from "zod";

const toNum = (v: unknown) => (v === "" || v === null || v === undefined ? undefined : typeof v === "string" ? Number(v.replace(/,/g, "")) : v);

/** Required number from a form field (strings with thousands separators are accepted). */
export const num = (msg = "Enter a number") => z.preprocess(toNum, z.number({ error: msg }).refine(Number.isFinite, msg));
export const positive = (msg = "Must be greater than zero") => z.preprocess(toNum, z.number({ error: msg }).positive(msg));
export const nonNegative = (msg = "Must be zero or more") => z.preprocess(toNum, z.number({ error: msg }).min(0, msg));
export const optNonNegative = z.preprocess(toNum, z.number().min(0, "Must be zero or more").optional());
export const optPositive = z.preprocess(toNum, z.number().positive("Must be greater than zero").optional());
export const pct = z.preprocess((v) => toNum(v) ?? 0, z.number().min(0, "0–99.9").max(99.9, "0–99.9"));

export const code = (label = "Code") =>
  z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9][A-Z0-9_./-]{0,31}$/, `${label}: letters, numbers, - _ . / only`);
export const shortCode = z.string().trim().toUpperCase().regex(/^[A-Z0-9][A-Z0-9_-]{0,19}$/, "Letters, numbers, - and _ only (max 20)");

export const optText = (max = 500) =>
  z
    .string()
    .trim()
    .max(max, `At most ${max} characters`)
    .nullish()
    .transform((v) => (v ? v : null));
export const reqText = (label: string, max = 160) => z.string().trim().min(1, `Enter ${label}`).max(max);
export const uuid = (msg = "Choose an option") => z.uuid(msg);
export const optUuid = z.union([z.uuid(), z.literal(""), z.null()]).optional().transform((v) => (v ? v : null));
export const optDate = z.union([z.iso.date("Enter a valid date"), z.literal("")]).nullish().transform((v) => (v ? v : null));
export const bool = z.preprocess((v) => v === true || v === "true" || v === "on", z.boolean());

export type ParseResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: { ok: false; error: string; fieldErrors: Record<string, string> } };

export function parseOrFields<T>(schema: z.ZodType<T>, values: unknown): ParseResult<T> {
  const r = schema.safeParse(values);
  if (r.success) return { ok: true, data: r.data };
  const fieldErrors: Record<string, string> = {};
  for (const i of r.error.issues) {
    const k = i.path.map(String).join(".");
    if (!fieldErrors[k]) fieldErrors[k] = i.message;
  }
  return { ok: false, error: { ok: false, error: "Check the highlighted fields", fieldErrors } };
}
