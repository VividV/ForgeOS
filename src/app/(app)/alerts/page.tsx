import { AlertTriangle, CircleAlert, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { getSession, requirePermission } from "@/lib/auth";

export const metadata = { title: "Alerts" };

const KIND: Record<string, string> = {
  overdue: "Overdue order", materials_pending: "Waiting for materials", over_consumption: "Over-consumption", idle_work_centre: "Idle work centre",
  rejection_rising: "Quality", low_stock: "Low stock", out_of_stock: "Out of stock",
};

export default async function AlertsPage() {
  const ctx = await requirePermission("dashboard.read");
  const { supabase } = await getSession();
  const { data } = await supabase.rpc("operational_alerts", { p_org: ctx.org.id, p_factory: null });
  const alerts = ((data ?? []) as { kind: string; severity: string; title: string; detail: string | null; link: string }[]).sort((a, b) => Number(b.severity === "critical") - Number(a.severity === "critical"));
  return (
    <>
      <PageHeader title="Alerts" description="Detected by fixed rules on live records (not AI): overdue orders, shortages, over-consumption against the BOM, idle work centres, rising rejection and stock below reorder level." />
      <Card>
        {alerts.length === 0 ? (
          <EmptyState icon={<ShieldCheck />} title="All clear" description="No rule is currently triggered." />
        ) : (
          <ul className="divide-y divide-line">
            {alerts.map((a, i) => (
              <li key={i}>
                <Link href={a.link} className="flex items-start gap-3 px-4 py-3 hover:bg-subtle/60">
                  {a.severity === "critical" ? <CircleAlert className="mt-0.5 size-4 text-danger" /> : <AlertTriangle className="mt-0.5 size-4 text-warning" />}
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-medium">{a.title}</p>
                    {a.detail && <p className="text-xs text-muted">{a.detail}</p>}
                  </div>
                  <Badge tone={a.severity === "critical" ? "danger" : "warning"}>{KIND[a.kind] ?? a.kind}</Badge>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
