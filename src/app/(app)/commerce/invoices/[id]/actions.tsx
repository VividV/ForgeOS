"use client";
import { X } from "lucide-react";
import { voidInvoice } from "@/app/actions/ops";
import { ActionButton } from "@/components/forms/action-button";

export function VoidInvoice({ id }: { id: string }) {
  return (
    <ActionButton variant="danger-outline" action={(n) => voidInvoice(id, n)} noteLabel="Reason" noteRequired confirm={{ title: "Void this invoice?", description: "It stays on record marked VOID, and its lines can be invoiced again." }} confirmLabel="Void invoice">
      <X /> Void
    </ActionButton>
  );
}
