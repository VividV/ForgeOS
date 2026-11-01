"use client";
import { ActionButton } from "@/components/forms/action-button";
import { setTemplateActive } from "@/app/actions/quality";

export function TemplateToggle({ id, active }: { id: string; active: boolean }) {
  return (
    <ActionButton size="sm" variant="ghost" action={() => setTemplateActive(id, !active)}>
      {active ? "Deactivate" : "Activate"}
    </ActionButton>
  );
}
