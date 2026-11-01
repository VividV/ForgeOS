"use client";
import { ActionButton } from "@/components/forms/action-button";
import { setMaterialActive } from "@/app/actions/catalog";

export function MaterialActiveToggle({ id, active }: { id: string; active: boolean }) {
  return (
    <ActionButton
      variant="ghost"
      action={() => setMaterialActive(id, !active)}
      confirm={active ? { title: "Deactivate this material?", description: "It won't be offered for new BOMs. Stock and history are kept." } : undefined}
      confirmLabel="Deactivate"
    >
      {active ? "Deactivate" : "Activate"}
    </ActionButton>
  );
}
