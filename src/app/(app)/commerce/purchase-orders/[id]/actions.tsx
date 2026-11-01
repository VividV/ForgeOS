"use client";
import { Check, Send, Undo2, X } from "lucide-react";
import { ActionButton } from "@/components/forms/action-button";
import { transitionPurchaseOrder } from "@/app/actions/procurement";

export function PoActions({ id, status, can }: { id: string; status: string; can: { create: boolean; approve: boolean; manage: boolean } }) {
  return (
    <>
      {status === "draft" && can.create && (
        <ActionButton action={() => transitionPurchaseOrder(id, "submit")}>
          <Send /> Submit for approval
        </ActionButton>
      )}
      {(status === "pending_approval" || (status === "draft" && can.approve)) && can.approve && (
        <ActionButton variant="primary" action={() => transitionPurchaseOrder(id, "approve")} confirm={{ title: "Approve this purchase order?" }} confirmLabel="Approve">
          <Check /> Approve
        </ActionButton>
      )}
      {status === "pending_approval" && can.approve && (
        <ActionButton action={(n) => transitionPurchaseOrder(id, "reject", n)} noteLabel="What needs changing?" confirm={{ title: "Return to draft?" }} confirmLabel="Return to draft">
          <Undo2 /> Return
        </ActionButton>
      )}
      {status === "approved" && can.manage && (
        <ActionButton action={() => transitionPurchaseOrder(id, "send")} confirm={{ title: "Mark as sent to the supplier?", description: "Print or download the PO and send it to the supplier, then confirm here." }} confirmLabel="Mark as sent">
          <Send /> Mark as sent
        </ActionButton>
      )}
      {["approved", "sent", "partially_received", "received"].includes(status) && can.manage && (
        <ActionButton variant="ghost" action={(n) => transitionPurchaseOrder(id, "close", n)} noteLabel="Note (e.g. supplier can't deliver the rest)" confirm={{ title: "Close this purchase order?", description: "No more goods can be received against it." }} confirmLabel="Close order">
          Close
        </ActionButton>
      )}
      {["draft", "pending_approval", "approved", "sent"].includes(status) && can.manage && (
        <ActionButton variant="danger-outline" action={(n) => transitionPurchaseOrder(id, "cancel", n)} noteLabel="Reason for cancelling" noteRequired confirm={{ title: "Cancel this purchase order?" }} confirmLabel="Cancel order">
          <X /> Cancel
        </ActionButton>
      )}
    </>
  );
}
