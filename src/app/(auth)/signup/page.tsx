import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { integrations } from "@/lib/server-env";
import { GoogleButton, SignupForm } from "../login/forms";

export const metadata = { title: "Create account" };

export default async function SignupPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const sp = await searchParams;
  const { user } = await getSession();
  if (user) redirect("/");
  return (
    <div>
      <h1 className="text-xl font-semibold tracking-tight">Create your ForgeOS account</h1>
      <p className="mt-1 text-[13px] text-muted">
        Already have one?{" "}
        <Link href={`/login${sp.next ? `?next=${encodeURIComponent(sp.next)}` : ""}`} className="font-medium text-accent-ink hover:underline">
          Sign in
        </Link>
      </p>
      <div className="mt-6">
        <SignupForm next={sp.next} />
      </div>
      {integrations.google && (
        <>
          <div className="my-5 flex items-center gap-3 text-xs text-faint">
            <span className="h-px flex-1 bg-line" /> or <span className="h-px flex-1 bg-line" />
          </div>
          <GoogleButton next={sp.next} />
        </>
      )}
      <p className="mt-6 text-xs text-muted">If you were invited by your company, sign up with the email address the invitation was sent to.</p>
    </div>
  );
}
