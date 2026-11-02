import { redirect } from "next/navigation";
import { signOut } from "@/app/actions/session";

export const metadata = { title: "Organisation suspended" };

export default function SuspendedPage() {
  async function leave() {
    "use server";
    await signOut();
    redirect("/login");
  }
  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 text-center">
      <h1 className="text-xl font-semibold">This organisation is suspended</h1>
      <p className="mt-2 text-[13px] text-muted">Access has been paused by ForgeOS. Your data is safe. Contact support to restore access.</p>
      <div className="mt-6 flex items-center justify-center gap-4 text-[13px]">
        <a className="font-medium text-accent-ink hover:underline" href="mailto:support@forgeos.app">
          Contact support
        </a>
        <form action={leave}>
          <button type="submit" className="font-medium text-muted hover:text-ink">
            Sign out
          </button>
        </form>
      </div>
    </div>
  );
}
