"use client";
import { Check, X } from "lucide-react";
import { ActionButton } from "@/components/forms/action-button";
import { decideRequisition } from "@/app/actions/procurement";

export function RequisitionActions({ id, status, canApprove, isRequester }: { id: string; status: string; canApprove: boolean; isRequester: boolean }) {
  return (
    <>
      {status === "submitted" && canApprove && (
        <>
          <ActionButton variant="danger-outline" action={(n) => decideRequisition(id, "reject", n)} noteLabel="Reason for rejecting" noteRequired confirm={{ title: "Reject this requisition?" }} confirmLabel="Reject">
            <X /> Reject
          </ActionButton>
          <ActionButton variant="primary" action={(n) => decideRequisition(id, "approve", n)} noteLabel="Note (optional)" confirm={{ title: "Approve this requisition?", description: "Procurement can then raise a purchase order." }} confirmLabel="Approve">
            <Check /> Approve
          </ActionButton>
        </>
      )}
      {(status === "submitted" || status === "approved") && (isRequester || canApprove) && (
        <ActionButton variant="ghost" action={(n) => decideRequisition(id, "cancel", n)} noteLabel="Reason" confirm={{ title: "Cancel this requisition?" }} confirmLabel="Cancel requisition">
          Cancel
        </ActionButton>
      )}
    </>
  );
}
