"use client";
import { CloudOff, RefreshCw, TriangleAlert } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { jobCardAction } from "@/app/actions/production";
import { getQueue, isNetworkError, markError, remove, subscribe, type QueuedUpdate } from "@/lib/offline-queue";

export function useQueue() {
  const [q, setQ] = React.useState<QueuedUpdate[]>([]);
  React.useEffect(() => {
    setQ(getQueue());
    return subscribe(() => setQ(getQueue()));
  }, []);
  return q;
}

let syncing = false;
export async function syncQueue(): Promise<{ synced: number; failed: number }> {
  if (syncing) return { synced: 0, failed: 0 };
  syncing = true;
  let synced = 0;
  let failed = 0;
  try {
    for (const u of getQueue().filter((x) => x.state === "pending")) {
      try {
        const r = await jobCardAction(u.card_id, { ...u.values, client_ref: u.client_ref });
        if (r.ok) {
          remove(u.client_ref);
          synced++;
        } else {
          markError(u.client_ref, r.error);
          failed++;
        }
      } catch (e) {
        if (isNetworkError(e)) break; // still offline: keep everything queued
        markError(u.client_ref, (e as Error).message);
        failed++;
      }
    }
  } finally {
    syncing = false;
  }
  return { synced, failed };
}

/** Shows queued offline updates and replays them when the connection returns. */
export function OfflineSync() {
  const router = useRouter();
  const queue = useQueue();
  const [online, setOnline] = React.useState(true);
  const [busy, setBusy] = React.useState(false);

  const run = React.useCallback(async () => {
    setBusy(true);
    const r = await syncQueue();
    setBusy(false);
    if (r.synced) {
      toast.success(`${r.synced} offline update(s) synchronised`);
      router.refresh();
    }
    if (r.failed) toast.error(`${r.failed} update(s) could not be applied. Review them below.`);
  }, [router]);

  React.useEffect(() => {
    setOnline(navigator.onLine);
    const on = () => {
      setOnline(true);
      void run();
    };
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    const t = setInterval(() => navigator.onLine && getQueue().some((x) => x.state === "pending") && void run(), 20000);
    if (navigator.onLine && getQueue().some((x) => x.state === "pending")) void run();
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
      clearInterval(t);
    };
  }, [run]);

  const pending = queue.filter((x) => x.state === "pending");
  const errors = queue.filter((x) => x.state === "error");
  if (online && queue.length === 0) return null;

  return (
    <div className="mb-4 flex flex-col gap-2" role="status" aria-live="polite">
      {!online && (
        <div className="flex items-center gap-2 rounded-lg border border-warning/40 bg-warning-soft px-3 py-2 text-[13px] text-warning-ink">
          <CloudOff className="size-4" /> You&apos;re offline. Updates are saved on this phone and sent when you reconnect.
        </div>
      )}
      {pending.length > 0 && (
        <div className="flex items-center gap-2 rounded-lg border border-info/30 bg-info-soft px-3 py-2 text-[13px] text-info">
          <RefreshCw className={`size-4 ${busy ? "animate-spin" : ""}`} /> {pending.length} update(s) waiting to sync
          {online && (
            <Button size="sm" variant="ghost" className="ml-auto" onClick={run} loading={busy}>
              Sync now
            </Button>
          )}
        </div>
      )}
      {errors.map((e) => (
        <div key={e.client_ref} className="flex items-start gap-2 rounded-lg border border-danger/30 bg-danger-soft px-3 py-2 text-[13px] text-danger-ink">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" />
          <div className="flex-1">
            <p>
              <strong>{e.card_code}</strong> · {String(e.values.action)} {e.values.good ? `${e.values.good} good` : ""} — not applied: {e.error}
            </p>
          </div>
          <Button size="sm" variant="ghost" onClick={() => remove(e.client_ref)}>
            Dismiss
          </Button>
        </div>
      ))}
    </div>
  );
}
