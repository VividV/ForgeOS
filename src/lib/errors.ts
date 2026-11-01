export type ActionResult<T = undefined> =
  | { ok: true; data?: T; message?: string }
  | { ok: false; error: string; fieldErrors?: Record<string, string> };

type DbError = { code?: string; message?: string; details?: string | null; hint?: string | null };

const PERMISSION_LABELS: Record<string, string> = {};

/** Turns a PostgREST / Postgres error into a message a factory user can act on. */
export function friendlyError(err: DbError | null | undefined): string {
  if (!err) return "Something went wrong. Please try again.";
  const msg = err.message ?? "";
  switch (err.code) {
    case "42501": {
      const m = msg.match(/missing permission: ([a-z_.]+)/);
      if (m) return `You don't have permission to do this (${PERMISSION_LABELS[m[1]] ?? m[1]}). Ask an administrator.`;
      if (/row-level security/.test(msg)) return "You don't have permission to change this record.";
      return msg || "You don't have permission to do this.";
    }
    case "P0001":
    case "P0002":
      return msg;
    case "23505":
      if (/code/.test(msg)) return "That code is already in use. Choose a different one.";
      if (/sku/.test(msg)) return "That SKU is already in use.";
      if (/one_approved/.test(msg)) return "Another BOM is already approved for this product.";
      return "A record with these details already exists.";
    case "23503":
      return "This refers to a record that doesn't exist, or the record is still in use elsewhere.";
    case "23514":
      return "Some values are outside the allowed range. Check quantities and dates.";
    case "22P02":
    case "22003":
      return "One of the values isn't valid. Check numbers and dates.";
    case "PGRST116":
      return "Record not found.";
    default:
      console.error("[db] unexpected error", { code: err.code, message: err.message, details: err.details, hint: err.hint });
      return "Something went wrong. Please try again, and contact support if it continues.";
  }
}

export function fail(error: string, fieldErrors?: Record<string, string>): ActionResult<never> {
  return { ok: false, error, fieldErrors };
}

export function zodFieldErrors(issues: { path: PropertyKey[]; message: string }[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const i of issues) {
    const key = i.path.map(String).join(".");
    if (!out[key]) out[key] = i.message;
  }
  return out;
}
