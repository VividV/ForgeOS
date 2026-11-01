import { ShieldAlert } from "lucide-react";
import Link from "next/link";

export const metadata = { title: "No access" };

export default function Forbidden() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-canvas px-6">
      <div className="max-w-sm text-center">
        <div className="mx-auto mb-4 flex size-11 items-center justify-center rounded-full bg-subtle text-muted">
          <ShieldAlert className="size-5" />
        </div>
        <h1 className="text-lg font-semibold">You don&apos;t have access to this page</h1>
        <p className="mt-2 text-[13px] text-muted">Your role doesn&apos;t include this area. If you need it for your work, ask an administrator to update your role.</p>
        <Link href="/" className="mt-6 inline-block text-[13px] font-medium text-accent-ink hover:underline">
          Go to your home page
        </Link>
      </div>
    </main>
  );
}
