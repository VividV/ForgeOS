"use client";
import * as React from "react";
import { toast } from "sonner";
import { cancelSubscription, startCheckout } from "@/app/actions/billing";
import { ActionButton } from "@/components/forms/action-button";
import { Button } from "@/components/ui/button";

export function SubscribeButton({ plan, label, primary, disabled }: { plan: string; label: string; primary?: boolean; disabled?: boolean }) {
  const [pending, start] = React.useTransition();
  return (
    <Button
      variant={primary ? "primary" : "secondary"}
      className="w-full"
      loading={pending}
      disabled={disabled}
      onClick={() =>
        start(async () => {
          const r = await startCheckout(plan);
          if (!r.ok) return void toast.error(r.error);
          // Paystack's hosted checkout
          window.location.href = r.data!.redirect!;
        })
      }
    >
      {label}
    </Button>
  );
}

export function CancelPlan() {
  return (
    <ActionButton variant="ghost" action={() => cancelSubscription()} confirm={{ title: "Stop your plan from renewing?", description: "You keep full access until the end of the period you've paid for." }} confirmLabel="Don't renew">
      Cancel renewal
    </ActionButton>
  );
}
