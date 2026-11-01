"use client";
import { Check, CheckCheck } from "lucide-react";
import { ActionButton } from "@/components/forms/action-button";
import { markAllNotificationsRead, markNotificationRead } from "@/app/actions/notifications";

export function MarkRead({ id }: { id: string }) {
  return (
    <ActionButton size="icon-sm" variant="ghost" aria-label="Mark as read" title="Mark as read" action={() => markNotificationRead(id)} successMessage="Marked as read">
      <Check />
    </ActionButton>
  );
}

export function MarkAllRead() {
  return (
    <ActionButton action={() => markAllNotificationsRead()} successMessage="All caught up">
      <CheckCheck /> Mark all read
    </ActionButton>
  );
}
