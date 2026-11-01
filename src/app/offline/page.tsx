import { CloudOff } from "lucide-react";

export const metadata = { title: "Offline" };
export const dynamic = "force-static";

export default function Offline() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-canvas px-6">
      <div className="max-w-sm text-center">
        <div className="mx-auto mb-4 flex size-11 items-center justify-center rounded-full bg-warning-soft text-warning-ink">
          <CloudOff className="size-5" />
        </div>
        <h1 className="text-lg font-semibold">You&apos;re offline</h1>
        <p className="mt-2 text-[13px] text-muted">This page needs a connection. Updates you already made on an open job card are saved on this phone and will sync when you reconnect.</p>
      </div>
    </main>
  );
}
