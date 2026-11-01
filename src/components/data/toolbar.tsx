"use client";
import { Search, X } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import * as React from "react";
import { Select } from "@/components/ui/form";

/** URL-driven search and filters so lists are shareable and server-rendered. */
export function ListToolbar({
  placeholder = "Search…",
  filters = [],
  children,
  search = true,
}: {
  search?: boolean;
  placeholder?: string;
  filters?: { name: string; label: string; options: { value: string; label: string }[] }[];
  children?: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [q, setQ] = React.useState(sp.get("q") ?? "");
  const [, startTransition] = React.useTransition();

  const push = React.useCallback(
    (patch: Record<string, string>) => {
      const u = new URLSearchParams(sp.toString());
      for (const [k, v] of Object.entries(patch)) {
        if (v) u.set(k, v);
        else u.delete(k);
      }
      u.delete("page");
      startTransition(() => router.replace(`${pathname}${u.toString() ? `?${u}` : ""}`));
    },
    [sp, pathname, router],
  );

  React.useEffect(() => {
    const t = setTimeout(() => {
      if ((sp.get("q") ?? "") !== q) push({ q });
    }, 300);
    return () => clearTimeout(t);
  }, [q, sp, push]);

  return (
    <div className="flex flex-col gap-2 border-b border-line p-3 sm:flex-row sm:items-center">
      {search && <div className="relative flex-1 sm:max-w-xs">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-faint" aria-hidden />
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={placeholder}
          aria-label="Search"
          className="h-8 w-full rounded-md border border-line-strong bg-surface pl-8 pr-7 text-[13px] focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
        />
        {q && (
          <button type="button" onClick={() => setQ("")} className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-faint hover:text-ink" aria-label="Clear search">
            <X className="size-3.5" />
          </button>
        )}
      </div>}
      {filters.map((f) => (
        <Select key={f.name} aria-label={f.label} value={sp.get(f.name) ?? ""} onChange={(e) => push({ [f.name]: e.target.value })} className="h-8 text-[13px] sm:w-44">
          <option value="">{f.label}: all</option>
          {f.options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </Select>
      ))}
      {children && <div className="flex items-center gap-2 sm:ml-auto">{children}</div>}
    </div>
  );
}
