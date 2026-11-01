"use client";
import { CheckCircle2, Download, FileUp, TriangleAlert } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { FormError, Select } from "@/components/ui/form";
import { normaliseHeader, parseCsv } from "@/lib/csv";
import type { ActionResult } from "@/lib/errors";
import { cn } from "@/lib/utils";

export type ImportField = {
  key: string;
  label: string;
  required?: boolean;
  aliases?: string[];
  kind?: "text" | "number" | "code";
  allowed?: string[];
  example: string;
};

type Row = Record<string, string>;

/**
 * Upload → map columns → validate & preview (with duplicate detection) → confirm.
 * Nothing is saved until the user confirms, and the save is all-or-nothing.
 */
export function CsvImporter({
  fields,
  existingCodes,
  templateName,
  onImport,
  extra,
  doneHref,
}: {
  fields: ImportField[];
  existingCodes: string[];
  templateName: string;
  onImport: (rows: Row[]) => Promise<ActionResult<{ created?: number; opening_balances?: number }>>;
  extra?: React.ReactNode;
  doneHref: string;
}) {
  const router = useRouter();
  const [headers, setHeaders] = React.useState<string[]>([]);
  const [data, setData] = React.useState<string[][]>([]);
  const [map, setMap] = React.useState<Record<string, number>>({});
  const [error, setError] = React.useState<string | null>(null);
  const [pending, start] = React.useTransition();
  const existing = React.useMemo(() => new Set(existingCodes.map((c) => c.toUpperCase())), [existingCodes]);

  const template = () => {
    const csv = [fields.map((f) => f.key).join(","), fields.map((f) => (f.example.includes(",") ? `"${f.example}"` : f.example)).join(",")].join("\r\n");
    const url = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = templateName;
    a.click();
    URL.revokeObjectURL(url);
  };

  const onFile = async (file: File) => {
    setError(null);
    if (file.size > 5 * 1024 * 1024) return setError("File is larger than 5 MB. Split it into smaller files.");
    const rows = parseCsv(await file.text());
    if (rows.length < 2) return setError("The file needs a header row and at least one data row.");
    const h = rows[0].map((x) => x.trim());
    setHeaders(h);
    setData(rows.slice(1));
    const auto: Record<string, number> = {};
    for (const f of fields) {
      const names = [f.key, ...(f.aliases ?? [])].map(normaliseHeader);
      const idx = h.findIndex((x) => names.includes(normaliseHeader(x)));
      if (idx >= 0) auto[f.key] = idx;
    }
    setMap(auto);
  };

  const mapped: Row[] = data.map((r) => Object.fromEntries(fields.map((f) => [f.key, map[f.key] !== undefined ? (r[map[f.key]] ?? "").trim() : ""])));
  const seen = new Map<string, number>();
  const issues = mapped.map((r, i) => {
    const errs: string[] = [];
    for (const f of fields) {
      const v = r[f.key];
      if (f.required && !v) errs.push(`${f.label} is required`);
      if (v && f.kind === "number" && !Number.isFinite(Number(v.replace(/,/g, "")))) errs.push(`${f.label} must be a number`);
      if (v && f.kind === "number" && Number(v.replace(/,/g, "")) < 0) errs.push(`${f.label} can't be negative`);
      if (v && f.kind === "code" && !/^[A-Za-z0-9][A-Za-z0-9_./-]{0,31}$/.test(v)) errs.push(`${f.label} has invalid characters`);
      if (v && f.allowed && !f.allowed.includes(v.toLowerCase())) errs.push(`${f.label} must be one of: ${f.allowed.join(", ")}`);
    }
    const code = (r.code ?? "").toUpperCase();
    if (code) {
      if (existing.has(code)) errs.push("Duplicate: this code already exists");
      if (seen.has(code)) errs.push(`Duplicate: same code as row ${seen.get(code)! + 1}`);
      else seen.set(code, i);
    }
    return errs;
  });
  const bad = issues.filter((e) => e.length).length;
  const missingRequired = fields.filter((f) => f.required && map[f.key] === undefined);

  const confirm = () =>
    start(async () => {
      setError(null);
      const rows = mapped.map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, fields.find((f) => f.key === k)?.kind === "number" ? v.replace(/,/g, "") : v])));
      const res = await onImport(rows);
      if (!res.ok) return setError(res.error);
      toast.success(res.message ?? "Imported");
      router.push(doneHref);
    });

  return (
    <div className="flex flex-col gap-4">
      <FormError message={error} />
      <div className="flex flex-wrap items-center gap-2">
        <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-md bg-accent px-3.5 py-2 text-sm font-medium text-white hover:bg-accent-hover">
          <FileUp className="size-4" /> {headers.length ? "Choose another file" : "Choose CSV file"}
          <input type="file" accept=".csv,text/csv" className="sr-only" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
        </label>
        <Button variant="ghost" onClick={template}>
          <Download /> Download template
        </Button>
      </div>

      {headers.length > 0 && (
        <>
          <section>
            <h2 className="mb-2 text-[13px] font-semibold">1. Match your columns</h2>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {fields.map((f) => (
                <label key={f.key} className="flex items-center gap-2 text-[13px]">
                  <span className="w-40 shrink-0">
                    {f.label}
                    {f.required && <span className="text-danger">*</span>}
                  </span>
                  <Select
                    className="h-8"
                    value={map[f.key] ?? ""}
                    onChange={(e) =>
                      setMap((m) => {
                        const n = { ...m };
                        if (e.target.value === "") delete n[f.key];
                        else n[f.key] = Number(e.target.value);
                        return n;
                      })
                    }
                  >
                    <option value="">— not in file —</option>
                    {headers.map((h, i) => (
                      <option key={i} value={i}>
                        {h}
                      </option>
                    ))}
                  </Select>
                </label>
              ))}
            </div>
          </section>
          {extra}
          <section>
            <div className="mb-2 flex flex-wrap items-center gap-3">
              <h2 className="text-[13px] font-semibold">2. Check the preview</h2>
              <span className="text-xs text-muted">{mapped.length} rows</span>
              {bad > 0 ? (
                <span className="inline-flex items-center gap-1 text-xs text-danger-ink">
                  <TriangleAlert className="size-3.5" /> {bad} row(s) need fixing
                </span>
              ) : (
                missingRequired.length === 0 && (
                  <span className="inline-flex items-center gap-1 text-xs text-success">
                    <CheckCircle2 className="size-3.5" /> All rows valid
                  </span>
                )
              )}
            </div>
            <div className="max-h-[420px] overflow-auto rounded-lg border border-line">
              <table className="w-full text-[12.5px]">
                <thead className="sticky top-0 bg-subtle">
                  <tr>
                    <th className="px-2 py-1.5 text-left font-medium text-muted">#</th>
                    {fields.filter((f) => map[f.key] !== undefined).map((f) => (
                      <th key={f.key} className="px-2 py-1.5 text-left font-medium text-muted">
                        {f.label}
                      </th>
                    ))}
                    <th className="px-2 py-1.5 text-left font-medium text-muted">Problems</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {mapped.slice(0, 300).map((r, i) => (
                    <tr key={i} className={cn(issues[i].length && "bg-danger-soft/50")}>
                      <td className="px-2 py-1 text-muted">{i + 1}</td>
                      {fields.filter((f) => map[f.key] !== undefined).map((f) => (
                        <td key={f.key} className="max-w-48 truncate px-2 py-1">
                          {r[f.key]}
                        </td>
                      ))}
                      <td className="px-2 py-1 text-danger-ink">{issues[i].join("; ")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {mapped.length > 300 && <p className="mt-1 text-xs text-muted">Previewing the first 300 rows; all rows are validated.</p>}
          </section>
          <div className="flex items-center justify-end gap-3 border-t border-line pt-4">
            {missingRequired.length > 0 && <span className="text-xs text-danger-ink">Map required columns: {missingRequired.map((f) => f.label).join(", ")}</span>}
            <Button variant="primary" onClick={confirm} loading={pending} disabled={bad > 0 || missingRequired.length > 0 || mapped.length === 0}>
              Import {mapped.length} rows
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
