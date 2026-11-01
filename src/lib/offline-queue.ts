"use client";
// Offline-tolerant queue for factory-floor updates. Each update carries a
// client_ref so the server applies it at most once, however many times it is
// replayed. Updates are never discarded silently: failures stay visible.

export type QueuedUpdate = {
  client_ref: string;
  card_id: string;
  card_code: string;
  values: Record<string, unknown>;
  queued_at: string;
  state: "pending" | "error";
  error?: string;
};

const KEY = "forge.offline-queue.v1";
const listeners = new Set<() => void>();

function read(): QueuedUpdate[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "[]") as QueuedUpdate[];
  } catch {
    return [];
  }
}
function write(q: QueuedUpdate[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(q));
  } catch {
    // storage unavailable (private mode / quota): keep in memory for this session
    memory = q;
  }
  listeners.forEach((l) => l());
}
let memory: QueuedUpdate[] | null = null;

export function getQueue(): QueuedUpdate[] {
  return memory ?? read();
}
export function enqueue(u: Omit<QueuedUpdate, "queued_at" | "state">) {
  write([...getQueue().filter((x) => x.client_ref !== u.client_ref), { ...u, queued_at: new Date().toISOString(), state: "pending" }]);
}
export function remove(ref: string) {
  write(getQueue().filter((x) => x.client_ref !== ref));
}
export function markError(ref: string, error: string) {
  write(getQueue().map((x) => (x.client_ref === ref ? { ...x, state: "error", error } : x)));
}
export function subscribe(fn: () => void) {
  listeners.add(fn);
  const onStorage = (e: StorageEvent) => e.key === KEY && fn();
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(fn);
    window.removeEventListener("storage", onStorage);
  };
}

/** True when the error looks like a network failure rather than a server rejection. */
export function isNetworkError(e: unknown) {
  if (typeof navigator !== "undefined" && !navigator.onLine) return true;
  const msg = String((e as Error)?.message ?? e);
  return /fetch|network|Failed to fetch|Load failed|NetworkError|ECONN|timeout/i.test(msg);
}
