import { requireUser } from "@/lib/auth";
import { PasswordForm } from "@/app/(app)/account/form";

export const metadata = { title: "Set a new password" };

// Outside the app shell so it works straight from a password-recovery link.
export default async function PasswordPage() {
  await requireUser();
  return (
    <main className="flex min-h-screen items-center justify-center bg-canvas px-6">
      <div className="w-full max-w-sm rounded-xl border border-line bg-surface p-8 shadow-card">
        <h1 className="mb-4 text-lg font-semibold">Set a new password</h1>
        <PasswordForm />
      </div>
    </main>
  );
}
