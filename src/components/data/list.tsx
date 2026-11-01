import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import * as React from "react";
import { TH } from "@/components/ui/table";
import { cn } from "@/lib/utils";

export type SearchParams = Record<string, string | string[] | undefined>;

export type ListParams = { q: string; page: number; pageSize: number; sort: string; dir: "asc" | "desc"; filters: Record<string, string> };

/** Parses and whitelists list query-string params (search, sort, paging, filters). */
export function parseList(sp: SearchParams, opts: { sortable: string[]; defaultSort: string; defaultDir?: "asc" | "desc"; filters?: string[]; pageSize?: number }): ListParams {
  const s = (k: string) => {
    const v = sp[k];
    return Array.isArray(v) ? v[0] ?? "" : v ?? "";
  };
  const sort = opts.sortable.includes(s("sort")) ? s("sort") : opts.defaultSort;
  const dir = s("dir") === "asc" || s("dir") === "desc" ? (s("dir") as "asc" | "desc") : (opts.defaultDir ?? "asc");
  const page = Math.max(1, Math.min(10000, parseInt(s("page") || "1", 10) || 1));
  const filters: Record<string, string> = {};
  for (const f of opts.filters ?? []) if (s(f)) filters[f] = s(f).slice(0, 100);
  return { q: s("q").slice(0, 100).trim(), page, pageSize: opts.pageSize ?? 25, sort, dir, filters };
}

export function range(p: ListParams): [number, number] {
  const from = (p.page - 1) * p.pageSize;
  return [from, from + p.pageSize - 1];
}

/** Escapes user input for use inside a PostgREST ilike/or filter. */
export function likeTerm(q: string) {
  return `%${q.replace(/[%_\\,()*]/g, (c) => `\\${c}`)}%`;
}

function hrefWith(base: string, sp: SearchParams, patch: Record<string, string | undefined>) {
  const u = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    const val = Array.isArray(v) ? v[0] : v;
    if (val) u.set(k, val);
  }
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined || v === "") u.delete(k);
    else u.set(k, v);
  }
  const qs = u.toString();
  return qs ? `${base}?${qs}` : base;
}

export function SortTH({ label, col, params, base, sp, align }: { label: string; col: string; params: ListParams; base: string; sp: SearchParams; align?: "left" | "right" }) {
  const active = params.sort === col;
  const nextDir = active && params.dir === "asc" ? "desc" : "asc";
  const Icon = !active ? ArrowUpDown : params.dir === "asc" ? ArrowUp : ArrowDown;
  return (
    <TH align={align} aria-sort={active ? (params.dir === "asc" ? "ascending" : "descending") : "none"}>
      <Link href={hrefWith(base, sp, { sort: col, dir: nextDir, page: undefined })} className={cn("inline-flex items-center gap-1 hover:text-ink", active && "text-ink")}>
        {label}
        <Icon className="size-3" aria-hidden />
      </Link>
    </TH>
  );
}

export function Pagination({ params, total, base, sp }: { params: ListParams; total: number; base: string; sp: SearchParams }) {
  const pages = Math.max(1, Math.ceil(total / params.pageSize));
  const from = total === 0 ? 0 : (params.page - 1) * params.pageSize + 1;
  const to = Math.min(total, params.page * params.pageSize);
  return (
    <div className="flex items-center justify-between border-t border-line px-3 py-2 text-xs text-muted">
      <span className="tabular">
        {from}–{to} of {total}
      </span>
      <div className="flex items-center gap-1">
        <PageLink disabled={params.page <= 1} href={hrefWith(base, sp, { page: String(params.page - 1) })} label="Previous page">
          <ChevronLeft className="size-4" />
        </PageLink>
        <span className="tabular px-2">
          Page {params.page} of {pages}
        </span>
        <PageLink disabled={params.page >= pages} href={hrefWith(base, sp, { page: String(params.page + 1) })} label="Next page">
          <ChevronRight className="size-4" />
        </PageLink>
      </div>
    </div>
  );
}

function PageLink({ disabled, href, children, label }: { disabled: boolean; href: string; children: React.ReactNode; label: string }) {
  if (disabled)
    return (
      <span className="rounded p-1 opacity-40" aria-disabled>
        {children}
      </span>
    );
  return (
    <Link href={href} className="rounded p-1 hover:bg-subtle hover:text-ink" aria-label={label}>
      {children}
    </Link>
  );
}
