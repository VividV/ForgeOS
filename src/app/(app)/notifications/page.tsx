import { Bell } from "lucide-react";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { getSession, requireOrg } from "@/lib/auth";
import { formatDateTime, relativeTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { MarkAllRead, MarkRead } from "./client";

export const metadata = { title: "Notifications" };

export default async function NotificationsPage() {
  const ctx = await requireOrg();
  const { supabase } = await getSession();
  const { data } = await supabase
    .from("notifications")
    .select("*")
    .eq("organization_id", ctx.org.id)
    .eq("user_id", ctx.user.id)
    .order("created_at", { ascending: false })
    .limit(100);
  const unread = (data ?? []).filter((n) => !n.read_at).length;
  return (
    <>
      <PageHeader title="Notifications" description={unread ? `${unread} unread` : "You're all caught up."} actions={unread > 0 && <MarkAllRead />} />
      <Card>
        {(data ?? []).length === 0 ? (
          <EmptyState icon={<Bell />} title="No notifications yet" description="Assignments, approvals, shortages and delays will appear here." />
        ) : (
          <ul className="divide-y divide-line">
            {(data ?? []).map((n) => (
              <li key={n.id} className={cn("flex items-start gap-3 px-4 py-3", !n.read_at && "bg-accent-soft/30")}>
                <span
                  className={cn("mt-1.5 size-2 shrink-0 rounded-full", n.read_at ? "bg-transparent" : n.severity === "critical" ? "bg-danger" : n.severity === "warning" ? "bg-warning" : "bg-accent")}
                  aria-label={n.read_at ? undefined : "Unread"}
                />
                <div className="min-w-0 flex-1">
                  {n.link ? (
                    <Link href={n.link} className="text-[13px] font-medium hover:text-accent-ink">
                      {n.title}
                    </Link>
                  ) : (
                    <p className="text-[13px] font-medium">{n.title}</p>
                  )}
                  {n.body && <p className="text-xs text-muted">{n.body}</p>}
                </div>
                <span className="shrink-0 text-xs text-muted" title={formatDateTime(n.created_at, ctx.settings.date_format, ctx.settings.timezone)}>
                  {relativeTime(n.created_at)}
                </span>
                {!n.read_at && <MarkRead id={n.id} />}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
