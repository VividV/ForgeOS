// Consistent number, currency and date formatting. Pure functions so they work in
// server and client components alike.

const LOCALES: Record<string, string> = { NGN: "en-NG", USD: "en-US", GBP: "en-GB", EUR: "en-IE" };

export function formatMoney(value: number | string | null | undefined, currency = "NGN", opts: { compact?: boolean; decimals?: number } = {}) {
  if (value === null || value === undefined || value === "") return "—";
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  return new Intl.NumberFormat(LOCALES[currency] ?? "en-US", {
    style: "currency",
    currency,
    notation: opts.compact ? "compact" : "standard",
    minimumFractionDigits: opts.compact ? 0 : (opts.decimals ?? 2),
    maximumFractionDigits: opts.compact ? 1 : (opts.decimals ?? 2),
  }).format(n);
}

export function formatQty(value: number | string | null | undefined, decimals = 2) {
  if (value === null || value === undefined || value === "") return "—";
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: decimals, minimumFractionDigits: 0 }).format(n);
}

export function formatPct(value: number | null | undefined, decimals = 1) {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return `${value.toFixed(decimals)}%`;
}

const DATE_PATTERNS: Record<string, Intl.DateTimeFormatOptions & { order: string }> = {
  "dd/MM/yyyy": { order: "dmy" },
  "MM/dd/yyyy": { order: "mdy" },
  "yyyy-MM-dd": { order: "ymd" },
};

function parts(d: Date, timeZone: string) {
  const p = new Intl.DateTimeFormat("en-GB", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(d);
  const get = (t: string) => p.find((x) => x.type === t)?.value ?? "";
  return { d: get("day"), m: get("month"), y: get("year") };
}

export function formatDate(value: string | Date | null | undefined, fmt = "dd/MM/yyyy", timeZone = "Africa/Lagos") {
  if (!value) return "—";
  // Plain dates (yyyy-mm-dd) are calendar dates: never shift them by time zone.
  const isPlain = typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
  const d = isPlain ? new Date(`${value}T12:00:00Z`) : new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  const { d: dd, m, y } = parts(d, isPlain ? "UTC" : timeZone);
  const order = DATE_PATTERNS[fmt]?.order ?? "dmy";
  if (order === "mdy") return `${m}/${dd}/${y}`;
  if (order === "ymd") return `${y}-${m}-${dd}`;
  return `${dd}/${m}/${y}`;
}

export function formatDateTime(value: string | Date | null | undefined, fmt = "dd/MM/yyyy", timeZone = "Africa/Lagos") {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  const time = new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", minute: "2-digit" }).format(d);
  return `${formatDate(d, fmt, timeZone)} ${time}`;
}

export function relativeTime(value: string | Date | null | undefined, now = new Date()) {
  if (!value) return "—";
  const d = new Date(value);
  const s = Math.round((now.getTime() - d.getTime()) / 1000);
  const abs = Math.abs(s);
  const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  if (abs < 60) return rtf.format(-s, "second");
  if (abs < 3600) return rtf.format(-Math.round(s / 60), "minute");
  if (abs < 86400) return rtf.format(-Math.round(s / 3600), "hour");
  if (abs < 86400 * 30) return rtf.format(-Math.round(s / 86400), "day");
  return formatDate(d);
}

export function titleCase(s: string | null | undefined) {
  if (!s) return "";
  return s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function sentenceCase(s: string | null | undefined) {
  if (!s) return "";
  const t = s.replace(/_/g, " ");
  return t.charAt(0).toUpperCase() + t.slice(1);
}

/** Today's calendar date (yyyy-mm-dd) in a time zone. */
export function todayIn(timeZone: string, now = new Date()) {
  const { d, m, y } = parts(now, timeZone);
  return `${y}-${m}-${d}`;
}
