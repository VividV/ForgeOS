import Link from "next/link";
import type { Billing } from "@/lib/auth";

/** Trial / renewal reminders. Shown to everyone when changes are paused; otherwise only to the billing owner. */
export function BillingBanner({ billing, canManage, isDemo }: { billing: Billing | null; canManage: boolean; isDemo: boolean }) {
  if (!billing || isDemo || billing.status === "comped") return null;
  const days = billing.ends_at ? Math.ceil((Date.parse(billing.ends_at) - Date.now()) / 86400000) : null;
  let tone = "bg-info-soft text-info";
  let text: string | null = null;
  if (billing.locked) {
    tone = "bg-danger-soft text-danger-ink";
    text = canManage ? "Your subscription has ended, so changes are paused. Everyone can still view data." : "This organisation's subscription has ended, so changes are paused. Ask the owner to renew.";
  } else if (billing.in_grace) {
    tone = "bg-warning-soft text-warning-ink";
    text = billing.status === "trialing" ? "Your free trial has ended. Choose a plan within 7 days to keep making changes." : "Your plan has ended. Renew within 7 days to keep making changes.";
  } else if (billing.status === "past_due") {
    tone = "bg-warning-soft text-warning-ink";
    text = "Your last payment didn't go through. Update your payment to avoid interruption.";
  } else if (billing.status === "trialing" && days !== null && days <= 7) {
    text = `${days} day${days === 1 ? "" : "s"} left in your free trial of ${billing.plan_name}.`;
  }
  if (!text || (!canManage && !billing.locked)) return null;
  return (
    <div className={`flex flex-wrap items-center justify-center gap-x-3 gap-y-1 px-4 py-2 text-center text-[13px] ${tone}`}>
      <span>{text}</span>
      {canManage && (
        <Link href="/admin/billing" className="font-semibold underline underline-offset-2">
          {billing.locked || billing.in_grace ? "Choose a plan" : "View plans"}
        </Link>
      )}
    </div>
  );
}
