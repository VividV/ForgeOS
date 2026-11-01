import { Users } from "lucide-react";
import Link from "next/link";
import { getSession } from "@/lib/auth";
import { AcceptInvite } from "./accept";

export const metadata = { title: "Invitation" };

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const { supabase, user } = await getSession();
  const { data } = await supabase.rpc("get_invitation", { p_token: token });
  const inv = (data as { organization_name: string; role_name: string; email: string; status: string; expired: boolean }[] | null)?.[0];
  const next = `/invite/${token}`;

  return (
    <main className="flex min-h-screen items-center justify-center bg-canvas px-6">
      <div className="w-full max-w-md rounded-xl border border-line bg-surface p-8 shadow-card">
        <div className="mb-4 flex size-11 items-center justify-center rounded-full bg-accent-soft text-accent-ink">
          <Users className="size-5" />
        </div>
        {!inv ? (
          <>
            <h1 className="text-lg font-semibold">Invitation not found</h1>
            <p className="mt-2 text-[13px] text-muted">This link is not valid. Ask the person who invited you to send a new one.</p>
          </>
        ) : inv.status !== "pending" || inv.expired ? (
          <>
            <h1 className="text-lg font-semibold">This invitation is no longer valid</h1>
            <p className="mt-2 text-[13px] text-muted">It has been {inv.expired ? "expired" : inv.status}. Ask {inv.organization_name} for a new invitation.</p>
          </>
        ) : (
          <>
            <h1 className="text-lg font-semibold">Join {inv.organization_name} on ForgeOS</h1>
            <p className="mt-2 text-[13px] text-muted">
              You&apos;ve been invited as <span className="font-medium text-ink">{inv.role_name}</span>. The invitation was sent to{" "}
              <span className="font-medium text-ink">{inv.email}</span>.
            </p>
            <div className="mt-6">
              {user ? (
                user.email?.toLowerCase() === inv.email.toLowerCase() ? (
                  <AcceptInvite token={token} />
                ) : (
                  <p className="rounded-md bg-warning-soft px-3 py-2 text-[13px] text-warning-ink">
                    You&apos;re signed in as {user.email}. Sign out and sign in with {inv.email} to accept.
                  </p>
                )
              ) : (
                <div className="flex gap-2">
                  <Link href={`/signup?next=${encodeURIComponent(next)}`} className="flex-1 rounded-md bg-accent px-3 py-2 text-center text-sm font-medium text-white hover:bg-accent-hover">
                    Create account
                  </Link>
                  <Link href={`/login?next=${encodeURIComponent(next)}`} className="flex-1 rounded-md border border-line-strong px-3 py-2 text-center text-sm font-medium hover:bg-subtle">
                    Sign in
                  </Link>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </main>
  );
}
