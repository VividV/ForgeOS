import { CheckCircle2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { PageHeader, Progress } from "@/components/ui/misc";
import { TBody, TD, TH, THead, TR, Table } from "@/components/ui/table";
import { getSession, requirePermission } from "@/lib/auth";
import { formatDate, formatMoney } from "@/lib/format";
import { integrations } from "@/lib/server-env";
import { CancelPlan, SubscribeButton } from "./client";

export const metadata = { title: "Billing" };

const STATUS: Record<string, [string, "success" | "warning" | "danger" | "info" | "neutral"]> = {
  trialing: ["Free trial", "info"], active: ["Active", "success"], past_due: ["Payment failed", "danger"], cancelled: ["Not renewing", "warning"], expired: ["Expired", "danger"], comped: ["Complimentary", "success"],
};

export default async function BillingPage({ searchParams }: { searchParams: Promise<{ paid?: string; error?: string }> }) {
  const ctx = await requirePermission("billing.manage");
  const sp = await searchParams;
  const { supabase } = await getSession();
  const [{ data: plans }, { data: payments }, { data: sub }] = await Promise.all([
    supabase.from("plans").select("*").order("sort"),
    supabase.from("billing_payments").select("reference, plan_key, amount, status, paid_at, period_end, created_at").eq("organization_id", ctx.org.id).order("created_at", { ascending: false }).limit(24),
    supabase.from("subscriptions").select("cancel_at_period_end").eq("organization_id", ctx.org.id).maybeSingle(),
  ]);
  const b = ctx.billing;
  const df = ctx.settings.date_format;
  const st = STATUS[b?.status ?? "trialing"];
  const daysLeft = b?.ends_at ? Math.ceil((Date.parse(b.ends_at) - Date.now()) / 86400000) : null;
  return (
    <>
      <PageHeader title="Billing" description="Your ForgeOS plan, usage and payments. Prices are per organisation per month, in naira." />
      {sp.paid && <p className="mb-4 rounded-md bg-success-soft px-3 py-2 text-[13px] text-success">Payment received. Thank you, your plan is active.</p>}
      {sp.error && <p className="mb-4 rounded-md bg-danger-soft px-3 py-2 text-[13px] text-danger-ink">{sp.error}</p>}
      {ctx.org.is_demo && <p className="mb-4 rounded-md bg-info-soft px-3 py-2 text-[13px] text-info">This is a demo workspace. It is free and never billed.</p>}
      {!integrations.paystack && !ctx.org.is_demo && (
        <p className="mb-4 rounded-md bg-warning-soft px-3 py-2 text-[13px] text-warning-ink">Online payments aren&apos;t switched on yet. Your trial keeps running; ForgeOS can activate a plan for you directly.</p>
      )}
      <div className="mb-4 grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader title="Current plan" />
          <CardBody>
            <p className="text-2xl font-semibold">{b?.plan_name ?? "—"}</p>
            <p className="mt-1 flex items-center gap-2 text-[13px]">
              <Badge tone={st[1]}>{st[0]}</Badge>
              {b?.ends_at && (
                <span className="text-muted">
                  {b.status === "trialing" ? "Trial ends" : sub?.cancel_at_period_end ? "Access until" : "Renews"} {formatDate(b.ends_at, df)}
                  {daysLeft !== null && daysLeft >= 0 ? ` (${daysLeft} day${daysLeft === 1 ? "" : "s"})` : ""}
                </span>
              )}
            </p>
            {b?.in_grace && !b.locked && <p className="mt-2 text-[13px] text-warning-ink">Your plan has ended. You have 7 days to renew before changes are paused.</p>}
            {b?.locked && <p className="mt-2 text-[13px] text-danger-ink">Changes are paused. Everyone can still view data. Choose a plan to continue.</p>}
            {b?.status === "active" && !sub?.cancel_at_period_end && integrations.paystack && (
              <div className="mt-3">
                <CancelPlan />
              </div>
            )}
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Team members" description="Active members plus pending invitations" />
          <CardBody>
            <p className="tabular text-2xl font-semibold">
              {b?.users ?? 0}
              <span className="text-base font-normal text-muted"> / {b?.max_users ?? "unlimited"}</span>
            </p>
            {b?.max_users && <Progress className="mt-2" value={(b.users / b.max_users) * 100} tone={b.users >= b.max_users ? "danger" : "accent"} />}
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Factories" />
          <CardBody>
            <p className="tabular text-2xl font-semibold">
              {b?.factories ?? 0}
              <span className="text-base font-normal text-muted"> / {b?.max_factories ?? "unlimited"}</span>
            </p>
            {b?.max_factories && <Progress className="mt-2" value={(b.factories / b.max_factories) * 100} tone={b.factories >= b.max_factories ? "danger" : "accent"} />}
          </CardBody>
        </Card>
      </div>
      <div className="mb-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {(plans ?? []).map((p) => {
          const current = b?.plan === p.key && ["active", "comped"].includes(b?.status ?? "");
          return (
            <Card key={p.key} className={current ? "ring-2 ring-accent" : undefined}>
              <CardBody className="flex h-full flex-col gap-3">
                <div>
                  <p className="text-sm font-semibold">{p.name}</p>
                  <p className="mt-1 text-2xl font-semibold">{p.price_monthly != null ? formatMoney(p.price_monthly, "NGN", { decimals: 0 }) : "Let's talk"}</p>
                  {p.price_monthly != null && <p className="text-xs text-muted">per month</p>}
                  <p className="mt-2 text-[13px] text-muted">{p.description}</p>
                </div>
                <ul className="flex-1 space-y-1.5 text-[13px]">
                  {(p.features as string[]).map((f) => (
                    <li key={f} className="flex gap-2">
                      <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-success" />
                      {f}
                    </li>
                  ))}
                </ul>
                {ctx.org.is_demo ? null : p.price_monthly == null ? (
                  <a href="mailto:sales@forgeos.app?subject=ForgeOS%20Enterprise" className="text-center text-[13px] font-medium text-accent-ink hover:underline">
                    Contact us
                  </a>
                ) : current ? (
                  <p className="text-center text-[13px] font-medium text-success">Your current plan</p>
                ) : (
                  <SubscribeButton plan={p.key} label={b?.status === "active" ? `Switch to ${p.name}` : `Choose ${p.name}`} primary={p.key === b?.plan} disabled={!integrations.paystack} />
                )}
              </CardBody>
            </Card>
          );
        })}
      </div>
      <Card>
        <CardHeader title="Payments" description="Card and bank payments are processed by Paystack. ForgeOS never sees your card details." />
        {(payments ?? []).filter((p) => p.status === "success").length === 0 ? (
          <p className="px-4 py-3 text-[13px] text-muted">No payments yet.</p>
        ) : (
          <Table>
            <THead>
              <tr>
                <TH>Date</TH>
                <TH>Plan</TH>
                <TH align="right">Amount</TH>
                <TH>Covers until</TH>
                <TH>Reference</TH>
              </tr>
            </THead>
            <TBody>
              {(payments ?? [])
                .filter((p) => p.status === "success")
                .map((p) => (
                  <TR key={p.reference}>
                    <TD>{formatDate(p.paid_at, df)}</TD>
                    <TD className="capitalize">{p.plan_key}</TD>
                    <TD align="right">{formatMoney(p.amount, "NGN")}</TD>
                    <TD className="text-muted">{formatDate(p.period_end, df)}</TD>
                    <TD className="font-mono text-xs text-muted">{p.reference}</TD>
                  </TR>
                ))}
            </TBody>
          </Table>
        )}
      </Card>
    </>
  );
}
