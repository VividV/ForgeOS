"use client";
import { Undo2 } from "lucide-react";
import { ActionButton } from "@/components/forms/action-button";
import { reverseTransaction } from "@/app/actions/inventory";

export function ReverseButton({ id }: { id: string }) {
  return (
    <ActionButton
      size="icon-sm"
      variant="ghost"
      aria-label="Reverse this movement"
      title="Reverse"
      action={(note) => reverseTransaction(id, note)}
      noteLabel="Why is this being reversed?"
      noteRequired
      confirm={{ title: "Reverse this movement?", description: "A compensating entry is posted. The original record stays in the ledger." }}
      confirmLabel="Post reversal"
    >
      <Undo2 />
    </ActionButton>
  );
}
