import Link from "next/link";
import { ForgotForm } from "./form";

export const metadata = { title: "Reset password" };

export default function ForgotPasswordPage() {
  return (
    <div>
      <h1 className="text-xl font-semibold tracking-tight">Reset your password</h1>
      <p className="mt-1 text-[13px] text-muted">Enter your email and we&apos;ll send you a link to choose a new password.</p>
      <div className="mt-6">
        <ForgotForm />
      </div>
      <p className="mt-6 text-center text-[13px]">
        <Link href="/login" className="text-muted hover:text-ink">
          Back to sign in
        </Link>
      </p>
    </div>
  );
}
