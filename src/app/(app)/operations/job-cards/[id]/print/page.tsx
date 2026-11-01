import { notFound } from "next/navigation";
import QRCode from "qrcode";
import { getSession, requirePermission } from "@/lib/auth";
import { appUrl } from "@/lib/env";
import { formatDate, formatQty } from "@/lib/format";
import { PrintButton } from "./print-button";

type JobCard = {
  id: string; code: string; status: string; target_quantity: number; quantity_completed: number; assigned_team: string | null; instructions: string | null; issued_at: string; assignee_name: string | null;
  order: { number: string; priority: string; quantity_planned: number; due_date: string | null; notes: string | null; factory: string };
  product: { name: string; code: string; description: string | null; variant: string; size: string | null; colour: string | null; uom: string };
  operation: { name: string; sequence: number; instructions: string | null; requires_quality_check: boolean; work_centre: string | null };
  stages: { sequence: number; name: string; status: string }[];
  materials: { name: string; code: string; uom: string; per_unit: number; required: number }[] | null;
};

export const metadata = { title: "Job card" };

export default async function PrintJobCard({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requirePermission("job_cards.read", "job_cards.create", "production_orders.read", "job_cards.work");
  const { supabase } = await getSession();
  const { data } = await supabase.rpc("get_job_card", { p_card: id });
  const j = data as JobCard | null;
  if (!j) notFound();
  const url = `${appUrl()}/floor/jobs/${j.id}`;
  const qr = await QRCode.toString(url, { type: "svg", margin: 0, width: 132, errorCorrectionLevel: "M" });
  const df = ctx.settings.date_format;

  return (
    <div className="mx-auto max-w-3xl">
      <div className="no-print mb-4 flex justify-end">
        <PrintButton />
      </div>
      <article className="rounded-lg border border-ink/80 bg-white p-8 text-ink print:border-0 print:p-0">
        <header className="flex items-start justify-between gap-6 border-b-2 border-ink pb-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-muted">{ctx.org.name} · Job card</p>
            <h1 className="mt-1 font-mono text-3xl font-bold">{j.code}</h1>
            <p className="mt-1 text-sm">
              Order <strong>{j.order.number}</strong> · {j.order.factory} · Priority <strong className="uppercase">{j.order.priority}</strong>
            </p>
          </div>
          <div className="text-center">
            <div className="size-[132px] [&_svg]:size-full" dangerouslySetInnerHTML={{ __html: qr }} aria-label="QR code linking to this job card" />
            <p className="mt-1 font-mono text-[10px]">Scan to update</p>
          </div>
        </header>

        <section className="grid grid-cols-2 gap-6 border-b border-line py-4 text-sm">
          <div>
            <h2 className="text-xs font-semibold uppercase text-muted">Product</h2>
            <p className="mt-1 text-lg font-semibold">{j.product.name}</p>
            <p>
              {j.product.code}
              {j.product.variant !== "Standard" ? ` · ${j.product.variant}` : ""}
              {j.product.size ? ` · Size ${j.product.size}` : ""}
              {j.product.colour ? ` · ${j.product.colour}` : ""}
            </p>
            {j.product.description && <p className="mt-1 text-xs text-ink-soft">{j.product.description}</p>}
          </div>
          <div>
            <h2 className="text-xs font-semibold uppercase text-muted">This job</h2>
            <p className="mt-1 text-lg font-semibold">
              Step {j.operation.sequence}: {j.operation.name}
            </p>
            <p>
              Target <strong className="text-lg">{formatQty(j.target_quantity)}</strong> {j.product.uom}
              {j.operation.work_centre ? ` · ${j.operation.work_centre}` : ""}
            </p>
            <p>Assigned to: <strong>{j.assignee_name || j.assigned_team}</strong></p>
            <p>Due: {formatDate(j.order.due_date, df)} · Issued {formatDate(j.issued_at, df, ctx.settings.timezone)}</p>
          </div>
        </section>

        {(j.operation.instructions || j.instructions) && (
          <section className="border-b border-line py-4 text-sm">
            <h2 className="text-xs font-semibold uppercase text-muted">Instructions</h2>
            {j.operation.instructions && <p className="mt-1">{j.operation.instructions}</p>}
            {j.instructions && <p className="mt-1">{j.instructions}</p>}
          </section>
        )}

        <section className="border-b border-line py-4 text-sm">
          <h2 className="mb-2 text-xs font-semibold uppercase text-muted">Required materials (whole order)</h2>
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-line text-xs text-muted">
                <th className="py-1 font-medium">Material</th>
                <th className="py-1 text-right font-medium">Per unit</th>
                <th className="py-1 text-right font-medium">Total required</th>
              </tr>
            </thead>
            <tbody>
              {(j.materials ?? []).map((m) => (
                <tr key={m.code} className="border-b border-line/60">
                  <td className="py-1">
                    {m.name} <span className="font-mono text-xs text-muted">{m.code}</span>
                  </td>
                  <td className="tabular py-1 text-right">
                    {formatQty(m.per_unit, 4)} {m.uom}
                  </td>
                  <td className="tabular py-1 text-right">
                    {formatQty(m.required, 2)} {m.uom}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="grid grid-cols-2 gap-6 py-4 text-sm">
          <div>
            <h2 className="mb-2 text-xs font-semibold uppercase text-muted">Routing</h2>
            <ol className="space-y-0.5">
              {j.stages.map((s) => (
                <li key={s.sequence} className={s.sequence === j.operation.sequence ? "font-bold" : ""}>
                  {s.sequence}. {s.name}
                  {s.sequence === j.operation.sequence ? "  ← this job" : ""}
                </li>
              ))}
            </ol>
          </div>
          <div>
            <h2 className="mb-2 text-xs font-semibold uppercase text-muted">Quality requirements</h2>
            <p>{j.operation.requires_quality_check ? "This step requires a quality check before work moves on." : "Report any defects with quantity and reason."}</p>
            <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
              <div className="h-14 rounded border border-ink/40 p-1">Good units</div>
              <div className="h-14 rounded border border-ink/40 p-1">Rejected units</div>
              <div className="col-span-2 h-14 rounded border border-ink/40 p-1">Signature / date</div>
            </div>
          </div>
        </section>
      </article>
    </div>
  );
}
