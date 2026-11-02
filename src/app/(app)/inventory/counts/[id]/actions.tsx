"use client";
import { Check, Send, Undo2, X } from "lucide-react";
import { transitionStockCount } from "@/app/actions/ops";
import { ActionButton } from "@/components/forms/action-button";

export function CountActions({ id, status, can }: { id: string; status: string; can: { adjust: boolean; approve: boolean } }) {
  return (
    <>
      {status === "in_progress" && can.adjust && (
        <ActionButton variant="primary" action={() => transitionStockCount(id, "submit")} confirm={{ title: "Submit this count?", description: "Save your counts first. Items left blank are not changed." }} confirmLabel="Submit">
          <Send /> Submit for approval
        </ActionButton>
      )}
      {status === "submitted" && can.approve && (
        <>
          <ActionButton action={(n) => transitionStockCount(id, "reopen", n)} noteLabel="What needs recounting?" confirm={{ title: "Send back for recount?" }} confirmLabel="Send back">
            <Undo2 /> Send back
          </ActionButton>
          <ActionButton variant="primary" action={(n) => transitionStockCount(id, "approve", n)} noteLabel="Note (optional)" confirm={{ title: "Approve and adjust stock?", description: "Stock on hand becomes the counted quantity for every counted item. This posts adjustments to the ledger." }} confirmLabel="Approve & adjust">
            <Check /> Approve
          </ActionButton>
        </>
      )}
      {["in_progress", "submitted"].includes(status) && can.adjust && (
        <ActionButton variant="ghost" action={(n) => transitionStockCount(id, "cancel", n)} noteLabel="Reason" confirm={{ title: "Cancel this count?", description: "No stock is changed." }} confirmLabel="Cancel count">
          <X /> Cancel
        </ActionButton>
      )}
    </>
  );
}
