import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { integrations } from "@/lib/server-env";
import { GoogleButton, LoginForm } from "./forms";

export const metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string; notice?: string }> }) {
  const sp = await searchParams;
  const { user } = await getSession();
  if (user) redirect(sp.next && sp.next.startsWith("/") && !sp.next.startsWith("//") ? sp.next : "/");
  return (
    <div>
      <h1 className="text-xl font-semibold tracking-tight">Sign in to ForgeOS</h1>
      <p className="mt-1 text-[13px] text-muted">
        New here?{" "}
        <Link href={`/signup${sp.next ? `?next=${encodeURIComponent(sp.next)}` : ""}`} className="font-medium text-accent-ink hover:underline">
          Create an account
        </Link>
      </p>
      {sp.error && <p className="mt-4 rounded-md bg-danger-soft px-3 py-2 text-sm text-danger-ink">{sp.error}</p>}
      {sp.notice && <p className="mt-4 rounded-md bg-success-soft px-3 py-2 text-sm text-success">{sp.notice}</p>}
      <div className="mt-6">
        <LoginForm next={sp.next} />
      </div>
      {integrations.google && (
        <>
          <div className="my-5 flex items-center gap-3 text-xs text-faint">
            <span className="h-px flex-1 bg-line" /> or <span className="h-px flex-1 bg-line" />
          </div>
          <GoogleButton next={sp.next} />
        </>
      )}
      <p className="mt-6 text-center text-[13px]">
        <Link href="/forgot-password" className="text-muted hover:text-ink">
          Forgot your password?
        </Link>
      </p>
    </div>
  );
}
