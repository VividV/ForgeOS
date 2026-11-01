"use client";
import {
  Activity, ArrowLeftRight, BellRing, Boxes, CalendarCheck, ClipboardList, Cog, Factory, FileBarChart, Gauge, HardHat, Kanban,
  Layers, ListTree, Lock, Menu, PackageCheck, PanelLeftClose, PanelLeftOpen, Route, ScrollText, Settings, Shield, Shirt,
  SlidersHorizontal, TriangleAlert, Truck, Users, Warehouse, X, type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import * as React from "react";
import type { NavGroup } from "@/lib/nav";
import { cn } from "@/lib/utils";

const ICONS: Record<string, LucideIcon> = {
  gauge: Gauge, "calendar-check": CalendarCheck, "triangle-alert": TriangleAlert, activity: Activity, "hard-hat": HardHat,
  factory: Factory, kanban: Kanban, "clipboard-list": ClipboardList, cog: Cog, route: Route, boxes: Boxes, layers: Layers,
  "package-check": PackageCheck, "arrow-left-right": ArrowLeftRight, lock: Lock, "sliders-horizontal": SlidersHorizontal,
  warehouse: Warehouse, "bell-ring": BellRing, shirt: Shirt, "list-tree": ListTree, truck: Truck, "file-bar-chart": FileBarChart,
  users: Users, shield: Shield, settings: Settings, "scroll-text": ScrollText,
};

function isActive(path: string, href: string) {
  if (href === "/inventory") return path === "/inventory";
  return path === href || path.startsWith(href + "/");
}

export function Sidebar({ nav, orgName, isDemo }: { nav: NavGroup[]; orgName: string; isDemo: boolean }) {
  const path = usePathname();
  const [collapsed, setCollapsed] = React.useState(false);
  const [mobileOpen, setMobileOpen] = React.useState(false);

  React.useEffect(() => {
    try {
      setCollapsed(localStorage.getItem("forge.sidebar") === "collapsed");
    } catch {}
  }, []);
  React.useEffect(() => setMobileOpen(false), [path]);

  const toggle = () => {
    setCollapsed((c) => {
      try {
        localStorage.setItem("forge.sidebar", c ? "open" : "collapsed");
      } catch {}
      return !c;
    });
  };

  const content = (mobile: boolean) => (
    <div className="flex h-full flex-col">
      <div className={cn("flex h-14 items-center gap-2 border-b border-white/5 px-4", collapsed && !mobile && "justify-center px-0")}>
        <div className="flex size-7 shrink-0 items-center justify-center rounded-md bg-accent text-[13px] font-bold text-white">F</div>
        {(!collapsed || mobile) && (
          <div className="min-w-0 leading-tight">
            <p className="text-[13px] font-semibold text-white">ForgeOS</p>
            <p className="truncate text-[11px] text-sidebar-muted">{orgName}</p>
          </div>
        )}
        {mobile && (
          <button className="ml-auto rounded p-1 text-sidebar-muted hover:text-white" onClick={() => setMobileOpen(false)} aria-label="Close menu">
            <X className="size-5" />
          </button>
        )}
      </div>
      {isDemo && (!collapsed || mobile) && (
        <div className="mx-3 mt-3 rounded-md border border-warning/40 bg-warning/10 px-2.5 py-1.5 text-[11px] text-warning">Sample workspace — demo data</div>
      )}
      <nav className="flex-1 overflow-y-auto px-2 py-3" aria-label="Main">
        {nav.map((g) => (
          <div key={g.label} className="mb-4">
            {(!collapsed || mobile) && <p className="mb-1 px-2 text-[10.5px] font-semibold uppercase tracking-wider text-sidebar-muted">{g.label}</p>}
            <ul className="flex flex-col gap-0.5">
              {g.items.map((i) => {
                const Icon = ICONS[i.icon] ?? Gauge;
                const active = isActive(path, i.href);
                return (
                  <li key={i.href}>
                    <Link
                      href={i.href}
                      title={collapsed && !mobile ? i.label : undefined}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "flex h-8 items-center gap-2.5 rounded-md px-2 text-[13px] text-sidebar-text transition-colors hover:bg-sidebar-hover hover:text-white",
                        active && "bg-sidebar-active text-white",
                        collapsed && !mobile && "justify-center px-0",
                      )}
                    >
                      <Icon className={cn("size-4 shrink-0", active ? "text-accent" : "text-sidebar-muted")} aria-hidden />
                      {(!collapsed || mobile) && <span className="truncate">{i.label}</span>}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>
      {!mobile && (
        <button
          onClick={toggle}
          className="flex h-10 items-center gap-2 border-t border-white/5 px-4 text-[12px] text-sidebar-muted hover:text-white"
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? <PanelLeftOpen className="mx-auto size-4" /> : <PanelLeftClose className="size-4" />}
          {!collapsed && "Collapse"}
        </button>
      )}
    </div>
  );

  return (
    <>
      <button
        className="no-print fixed left-3 top-3 z-40 rounded-md border border-line bg-surface p-1.5 text-ink shadow-card lg:hidden"
        onClick={() => setMobileOpen(true)}
        aria-label="Open menu"
      >
        <Menu className="size-5" />
      </button>
      <aside className={cn("no-print sticky top-0 hidden h-screen shrink-0 bg-sidebar transition-[width] lg:block", collapsed ? "w-14" : "w-60")}>{content(false)}</aside>
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-ink/40" onClick={() => setMobileOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-72 bg-sidebar shadow-pop">{content(true)}</aside>
        </div>
      )}
    </>
  );
}
