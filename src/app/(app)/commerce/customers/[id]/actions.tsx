"use client";
import { ActionButton } from "@/components/forms/action-button";
import { setCustomerActive } from "@/app/actions/sales";

export function ArchiveCustomer({ id, active }: { id: string; active: boolean }) {
  return (
    <ActionButton
      variant="ghost"
      action={() => setCustomerActive(id, !active)}
      confirm={active ? { title: "Archive this customer?", description: "Existing orders are kept. Archived customers can't be chosen on new orders." } : undefined}
    >
      {active ? "Archive" : "Reactivate"}
    </ActionButton>
  );
}
