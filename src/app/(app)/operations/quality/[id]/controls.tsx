"use client";
import { ActionButton } from "@/components/forms/action-button";
import { updateCorrectiveAction } from "@/app/actions/quality";

export function ActionControls({ id, status, canCancel }: { id: string; status: string; canCancel: boolean }) {
  return (
    <>
      {status === "open" && (
        <ActionButton size="sm" action={() => updateCorrectiveAction(id, "in_progress")}>
          Start
        </ActionButton>
      )}
      <ActionButton size="sm" variant="primary" action={(n) => updateCorrectiveAction(id, "done", n)} noteLabel="What was done?" noteRequired confirm={{ title: "Close corrective action" }} confirmLabel="Mark done">
        Mark done
      </ActionButton>
      {canCancel && (
        <ActionButton size="sm" variant="ghost" action={(n) => updateCorrectiveAction(id, "cancelled", n)} noteLabel="Reason" confirm={{ title: "Cancel this corrective action?" }} confirmLabel="Cancel action">
          Cancel
        </ActionButton>
      )}
    </>
  );
}
