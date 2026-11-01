"use client";
import * as React from "react";
import { formatMoney } from "@/lib/format";
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

// Chart palette (validated: lightness band, chroma floor, CVD ΔE ≥ 21, contrast ≥ 3:1 on white).
// Fixed order — colour follows the series, never its rank.
export const SERIES = ["#D9692A", "#3F6FB0"] as const;
const GRID = "#eceef1";
const AXIS = { fontSize: 11, fill: "#646c78" };

const compact = (n: number) => new Intl.NumberFormat("en", { notation: n >= 10000 ? "compact" : "standard", maximumFractionDigits: 1 }).format(n);

function TooltipBox({ active, payload, label, format }: { active?: boolean; payload?: { name: string; value: number; color: string }[]; label?: string; format?: (n: number) => string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-md border border-line bg-surface px-3 py-2 text-xs shadow-pop">
      <p className="mb-1 font-medium text-ink">{label}</p>
      {payload.map((p) => (
        <p key={p.name} className="flex items-center gap-2 text-ink-soft">
          <span className="size-2 rounded-sm" style={{ background: p.color }} aria-hidden />
          {p.name}: <span className="tabular font-medium text-ink">{format ? format(p.value) : p.value.toLocaleString()}</span>
        </p>
      ))}
    </div>
  );
}

function Legend({ items }: { items: { label: string; color: string }[] }) {
  if (items.length < 2) return null;
  return (
    <ul className="mb-2 flex flex-wrap gap-4 text-xs text-ink-soft" aria-label="Legend">
      {items.map((i) => (
        <li key={i.label} className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm" style={{ background: i.color }} aria-hidden />
          {i.label}
        </li>
      ))}
    </ul>
  );
}

function TableView({ rows, columns }: { rows: Record<string, string | number>[]; columns: { key: string; label: string; format?: (v: number) => string }[] }) {
  return (
    <details className="mt-2 text-xs">
      <summary className="cursor-pointer text-muted hover:text-ink">View as table</summary>
      <div className="mt-2 max-h-56 overflow-auto rounded border border-line">
        <table className="w-full">
          <thead className="bg-subtle">
            <tr>
              {columns.map((c) => (
                <th key={c.key} className="px-2 py-1 text-left font-medium text-muted">
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="border-t border-line">
                {columns.map((c) => (
                  <td key={c.key} className="tabular px-2 py-1">
                    {typeof r[c.key] === "number" && c.format ? c.format(r[c.key] as number) : String(r[c.key])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

/** Columns over time, optionally stacked by series (2px surface gap between segments). */
export function TimeColumns({
  data,
  xKey,
  series,
  height = 220,
  money,
}: {
  data: Record<string, string | number>[];
  xKey: string;
  series: { key: string; label: string }[];
  height?: number;
  money?: string;
}) {
  const format = money ? (n: number) => formatMoney(n, money, { compact: true }) : undefined;
  const items = series.map((s, i) => ({ ...s, color: SERIES[i % SERIES.length] }));
  const empty = data.every((d) => series.every((s) => !Number(d[s.key])));
  return (
    <div>
      <Legend items={items.map((i) => ({ label: i.label, color: i.color }))} />
      {empty ? (
        <div className="flex items-center justify-center rounded-md bg-subtle/60 text-[13px] text-muted" style={{ height }}>
          No recorded activity in this period
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={height}>
          <BarChart data={data} margin={{ top: 4, right: 4, left: -16, bottom: 0 }} barCategoryGap="25%">
            <CartesianGrid vertical={false} stroke={GRID} />
            <XAxis dataKey={xKey} tick={AXIS} tickLine={false} axisLine={{ stroke: GRID }} minTickGap={16} />
            <YAxis tick={AXIS} tickLine={false} axisLine={false} tickFormatter={(v) => (format ? format(v) : compact(v))} allowDecimals={false} />
            <Tooltip cursor={{ fill: "rgba(32,37,43,0.04)" }} content={<TooltipBox format={format} />} />
            {items.map((s, i) => (
              <Bar
                key={s.key}
                dataKey={s.key}
                name={s.label}
                stackId="a"
                fill={s.color}
                maxBarSize={24}
                stroke="#ffffff"
                strokeWidth={items.length > 1 ? 1 : 0}
                radius={i === items.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      )}
      <TableView rows={data} columns={[{ key: xKey, label: "Date" }, ...series.map((s) => ({ key: s.key, label: s.label, format }))]} />
    </div>
  );
}

/** Single-series trend line. */
export function TrendLine({ data, xKey, yKey, label, height = 200, money }: { data: Record<string, string | number>[]; xKey: string; yKey: string; label: string; height?: number; money?: string }) {
  const format = money ? (n: number) => formatMoney(n, money, { compact: true }) : undefined;
  const empty = data.every((d) => !Number(d[yKey]));
  return (
    <div>
      {empty ? (
        <div className="flex items-center justify-center rounded-md bg-subtle/60 text-[13px] text-muted" style={{ height }}>
          No recorded activity in this period
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={height}>
          <LineChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke={GRID} />
            <XAxis dataKey={xKey} tick={AXIS} tickLine={false} axisLine={{ stroke: GRID }} minTickGap={16} />
            <YAxis tick={AXIS} tickLine={false} axisLine={false} tickFormatter={(v) => (format ? format(v) : compact(v))} />
            <Tooltip content={<TooltipBox format={format} />} cursor={{ stroke: "#d4d7dd" }} />
            <Line type="monotone" dataKey={yKey} name={label} stroke={SERIES[0]} strokeWidth={2} dot={false} activeDot={{ r: 5, stroke: "#fff", strokeWidth: 2 }} />
          </LineChart>
        </ResponsiveContainer>
      )}
      <TableView rows={data} columns={[{ key: xKey, label: "Date" }, { key: yKey, label, format }]} />
    </div>
  );
}

/** Horizontal bars for ranked categories (single series, value labelled at the tip). */
export function RankBars({ data, money, empty = "No data" }: { data: { label: string; value: number; href?: string }[]; money?: string; empty?: string }) {
  const format = money ? (n: number) => formatMoney(n, money, { compact: true }) : undefined;
  const max = Math.max(...data.map((d) => d.value), 0);
  if (!data.length || max === 0) return <p className="py-8 text-center text-[13px] text-muted">{empty}</p>;
  return (
    <ul className="flex flex-col gap-2.5">
      {data.map((d) => (
        <li key={d.label} className="group">
          <div className="mb-1 flex justify-between gap-2 text-xs">
            <span className="truncate text-ink-soft">{d.label}</span>
            <span className="tabular font-medium text-ink">{format ? format(d.value) : d.value.toLocaleString()}</span>
          </div>
          <div className="h-2 rounded-full bg-subtle" title={`${d.label}: ${format ? format(d.value) : d.value}`}>
            <div className="h-full rounded-full" style={{ width: `${(d.value / max) * 100}%`, background: SERIES[0] }} />
          </div>
        </li>
      ))}
    </ul>
  );
}
