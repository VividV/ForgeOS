"use client";
import { DropdownMenu } from "radix-ui";
import { Bell, Building2, Check, ChevronDown, LogOut, Plus, Sparkles, UserRound } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import * as React from "react";
import { leaveDemoWorkspace, openDemoWorkspace } from "@/app/actions/demo";
import { signOut, switchOrganization } from "@/app/actions/session";
import { cn } from "@/lib/utils";

const menu = "z-50 min-w-56 rounded-lg border border-line bg-surface p-1 shadow-pop";
const item = "flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-[13px] text-ink-soft outline-none data-[highlighted]:bg-subtle data-[highlighted]:text-ink";

export function Topbar({
  orgs,
  activeOrgId,
  userName,
  userEmail,
  roles,
  unread,
}: {
  orgs: { id: string; name: string; is_demo: boolean }[];
  activeOrgId: string;
  userName: string;
  userEmail: string;
  roles: string[];
  unread: number;
}) {
  const router = useRouter();
  const active = orgs.find((o) => o.id === activeOrgId);
  const [, startTransition] = React.useTransition();

  return (
    <header className="no-print sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-line bg-surface/90 pl-14 pr-3 backdrop-blur lg:px-6">
      <DropdownMenu.Root>
        <DropdownMenu.Trigger className="flex h-8 max-w-[50vw] items-center gap-1.5 rounded-md px-2 text-[13px] font-medium text-ink hover:bg-subtle">
          <Building2 className="size-4 text-muted" aria-hidden />
          <span className="truncate">{active?.name}</span>
          <ChevronDown className="size-3.5 text-muted" aria-hidden />
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content className={menu} align="start" sideOffset={6}>
            <DropdownMenu.Label className="px-2 py-1 text-[11px] font-medium uppercase tracking-wide text-muted">Organisations</DropdownMenu.Label>
            {orgs.map((o) => (
              <DropdownMenu.Item
                key={o.id}
                className={item}
                onSelect={() =>
                  startTransition(async () => {
                    await switchOrganization(o.id);
                    router.push("/");
                    router.refresh();
                  })
                }
              >
                <Check className={cn("size-3.5", o.id === activeOrgId ? "opacity-100" : "opacity-0")} />
                <span className="truncate">{o.name}</span>
                {o.is_demo && <span className="ml-auto rounded bg-warning-soft px-1 text-[10px] text-warning-ink">Demo</span>}
              </DropdownMenu.Item>
            ))}
            <DropdownMenu.Separator className="my-1 h-px bg-line" />
            <DropdownMenu.Item className={item} onSelect={() => router.push("/onboarding?new=1")}>
              <Plus className="size-3.5" /> New organisation
            </DropdownMenu.Item>
            {orgs.find((o) => o.id === activeOrgId)?.is_demo ? (
              <DropdownMenu.Item
                className={item}
                onSelect={() =>
                  startTransition(async () => {
                    const r = await leaveDemoWorkspace(activeOrgId);
                    if (r.ok) {
                      router.push("/");
                      router.refresh();
                    }
                  })
                }
              >
                <LogOut className="size-3.5" /> Leave demo workspace
              </DropdownMenu.Item>
            ) : (
              <DropdownMenu.Item
                className={item}
                onSelect={() =>
                  startTransition(async () => {
                    const r = await openDemoWorkspace();
                    if (r.ok) {
                      router.push("/overview");
                      router.refresh();
                    }
                  })
                }
              >
                <Sparkles className="size-3.5" /> {orgs.some((o) => o.is_demo) ? "Open demo workspace" : "Try the demo workspace"}
              </DropdownMenu.Item>
            )}
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>

      <div className="ml-auto flex items-center gap-1">
        <Link href="/notifications" className="relative rounded-md p-2 text-muted hover:bg-subtle hover:text-ink" aria-label={`Notifications${unread ? ` (${unread} unread)` : ""}`}>
          <Bell className="size-[18px]" />
          {unread > 0 && (
            <span className="tabular absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[10px] font-semibold text-white">
              {unread > 99 ? "99+" : unread}
            </span>
          )}
        </Link>
        <DropdownMenu.Root>
          <DropdownMenu.Trigger className="flex h-8 items-center gap-2 rounded-md pl-1 pr-2 hover:bg-subtle" aria-label="Account menu">
            <span className="flex size-7 items-center justify-center rounded-full bg-ink text-[11px] font-semibold text-white">
              {(userName || userEmail).slice(0, 1).toUpperCase()}
            </span>
            <span className="hidden max-w-32 truncate text-[13px] text-ink sm:block">{userName || userEmail}</span>
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content className={menu} align="end" sideOffset={6}>
              <div className="px-2 py-1.5">
                <p className="truncate text-[13px] font-medium text-ink">{userName || "—"}</p>
                <p className="truncate text-xs text-muted">{userEmail}</p>
                {roles.length > 0 && <p className="mt-1 truncate text-[11px] text-muted">{roles.join(", ")}</p>}
              </div>
              <DropdownMenu.Separator className="my-1 h-px bg-line" />
              <DropdownMenu.Item className={item} onSelect={() => router.push("/account")}>
                <UserRound className="size-3.5" /> Profile
              </DropdownMenu.Item>
              <DropdownMenu.Item className={item} onSelect={() => startTransition(async () => { await signOut(); router.push("/login"); router.refresh(); })}>
                <LogOut className="size-3.5" /> Sign out
              </DropdownMenu.Item>
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
      </div>
    </header>
  );
}
