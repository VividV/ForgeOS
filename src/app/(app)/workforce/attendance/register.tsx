"use client";
import { CheckCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";
import { saveAttendance } from "@/app/actions/workforce";
import { Button } from "@/components/ui/button";
import { FormError, Input, Select } from "@/components/ui/form";

type Row = { employee_id: string; name: string; code: string; department: string | null; status: string; clock_in: string; clock_out: string; notes: string };
const STATUSES = [
  ["", "—"],
  ["present", "Present"],
  ["late", "Late"],
  ["half_day", "Half day"],
  ["absent", "Absent"],
  ["leave", "Leave"],
  ["off", "Day off"],
] as const;

export function AttendanceRegister({ date, rows: initial, editable }: { date: string; rows: Row[]; editable: boolean }) {
  const router = useRouter();
  const [rows, setRows] = React.useState(initial);
  const [error, setError] = React.useState<string | null>(null);
  const [pending, start] = React.useTransition();
  React.useEffect(() => setRows(initial), [initial]);
  const set = (i: number, p: Partial<Row>) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...p } : r)));
  const save = () =>
    start(async () => {
      setError(null);
      const r = await saveAttendance({ work_date: date, entries: rows.map(({ employee_id, status, clock_in, clock_out, notes }) => ({ employee_id, status, clock_in, clock_out, notes })) });
      if (!r.ok) return setError(r.error);
      toast.success(r.message ?? "Saved");
      router.refresh();
    });
  const marked = rows.filter((r) => r.status).length;
  return (
    <div className="flex flex-col gap-3">
      <FormError message={error} />
      {editable && (
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 pt-3">
          <p className="text-xs text-muted">
            {marked} of {rows.length} marked. Leave times blank to use the shift hours; enter in and out times for actual hours and overtime.
          </p>
          <Button size="sm" variant="ghost" onClick={() => setRows((rs) => rs.map((r) => (r.status ? r : { ...r, status: "present" })))}>
            <CheckCheck /> Mark the rest present
          </Button>
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-[13px]">
          <thead className="border-y border-line bg-subtle/60 text-left text-[11.5px] uppercase tracking-wide text-muted">
            <tr>
              <th className="px-4 py-2 font-medium">Employee</th>
              <th className="px-3 py-2 font-medium">Status</th>
              <th className="px-3 py-2 font-medium">In</th>
              <th className="px-3 py-2 font-medium">Out</th>
              <th className="px-3 py-2 font-medium">Note</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((r, i) => (
              <tr key={r.employee_id}>
                <td className="px-4 py-2">
                  <span className="font-medium">{r.name}</span> <span className="font-mono text-xs text-muted">{r.code}</span>
                  {r.department && <div className="text-xs text-muted">{r.department}</div>}
                </td>
                <td className="px-3 py-2">
                  <Select className="h-8 w-32" aria-label={`Status for ${r.name}`} value={r.status} disabled={!editable} onChange={(e) => set(i, { status: e.target.value })}>
                    {STATUSES.map(([v, l]) => (
                      <option key={v} value={v}>
                        {l}
                      </option>
                    ))}
                  </Select>
                </td>
                <td className="px-3 py-2">
                  <Input className="h-8 w-36" type="time" aria-label={`Clock in for ${r.name}`} value={r.clock_in} disabled={!editable || ["absent", "leave", "off"].includes(r.status)} onChange={(e) => set(i, { clock_in: e.target.value })} />
                </td>
                <td className="px-3 py-2">
                  <Input className="h-8 w-36" type="time" aria-label={`Clock out for ${r.name}`} value={r.clock_out} disabled={!editable || ["absent", "leave", "off"].includes(r.status)} onChange={(e) => set(i, { clock_out: e.target.value })} />
                </td>
                <td className="px-3 py-2">
                  <Input className="h-8 min-w-40" aria-label={`Note for ${r.name}`} value={r.notes} disabled={!editable} onChange={(e) => set(i, { notes: e.target.value })} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {editable && (
        <div className="flex justify-end border-t border-line px-4 py-3">
          <Button variant="primary" loading={pending} onClick={save}>
            Save attendance
          </Button>
        </div>
      )}
    </div>
  );
}
