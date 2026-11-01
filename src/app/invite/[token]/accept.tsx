"use client";
import { ActionButton } from "@/components/forms/action-button";
import { acceptInvitation } from "@/app/actions/team";

export function AcceptInvite({ token }: { token: string }) {
  return (
    <ActionButton variant="primary" className="w-full" action={() => acceptInvitation(token)} successMessage="Welcome aboard" redirectTo="/">
      Accept invitation
    </ActionButton>
  );
}
