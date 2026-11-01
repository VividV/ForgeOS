import { MailCheck } from "lucide-react";
import Link from "next/link";

export const metadata = { title: "Check your email" };

export default async function CheckEmail({ searchParams }: { searchParams: Promise<{ email?: string }> }) {
  const { email } = await searchParams;
  return (
    <main className="flex min-h-screen items-center justify-center bg-canvas px-6">
      <div className="w-full max-w-sm rounded-xl border border-line bg-surface p-8 text-center shadow-card">
        <div className="mx-auto mb-4 flex size-11 items-center justify-center rounded-full bg-accent-soft text-accent-ink">
          <MailCheck className="size-5" />
        </div>
        <h1 className="text-lg font-semibold">Confirm your email</h1>
        <p className="mt-2 text-[13px] text-muted">
          We sent a verification link to <span className="font-medium text-ink">{email ?? "your inbox"}</span>. Open it on this device to activate your account.
        </p>
        <Link href="/login" className="mt-6 inline-block text-[13px] font-medium text-accent-ink hover:underline">
          Back to sign in
        </Link>
      </div>
    </main>
  );
}
