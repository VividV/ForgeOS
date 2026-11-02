import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { PageHeader, Stat } from "@/components/ui/misc";
import { TBody, TD, TH, THead, TR, Table } from "@/components/ui/table";
import { getSession, requireOrg } from "@/lib/auth";
import { formatDate, formatMoney, relativeTime } from "@/lib/format";

export const metadata = { title: "Platform admin" };

type Org = { id: string; name: string; slug: string; country: string; is_demo: boolean; status: string; created_at: string; onboarding_completed_at: string | null; plan_key: string; subscription_status: string; trial_ends_at: string | null; current_period_end: string | null; members: number; factories: number; owner_email: string | null; last_activity: string | null };

export default async function PlatformPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const ctx = await requireOrg();
  if (!ctx.profile.is_platform_admin) notFound();
  const sp = await searchParams;
  const { supabase } = await getSession();
  const [{ data: ov }, { data }] = await Promise.all([supabase.rpc("platform_overview"), supabase.rpc("platform_organizations", { p_search: sp.q?.trim() || null })]);
  const o = (ov ?? {}) as Record<string, number>;
  const orgs = (data ?? []) as Org[];
  const df = ctx.settings.date_format;
  return (
    <>
      <PageHeader title="Platform admin" description="Every organisation on ForgeOS. Only platform admins can see this page; changes are audited on the organisation." />
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Stat label="Organisations" value={String(o.organizations ?? 0)} hint={`${o.signups_30d ?? 0} new in 30 days · ${o.demo ?? 0} demo`} />
        <Stat label="On trial" value={String(o.trialing ?? 0)} />
        <Stat label="Paying" value={String(o.active ?? 0)} hint={o.past_due ? `${o.past_due} payment failed` : undefined} tone={o.past_due ? "warning" : undefined} />
        <Stat label="Monthly recurring revenue" value={formatMoney(o.mrr ?? 0, "NGN", { compact: true })} />
        <Stat label="Collected (30 days)" value={formatMoney(o.paid_30d ?? 0, "NGN", { compact: true })} hint={`${o.users ?? 0} user accounts`} />
      </div>
      <Card>
        <form className="border-b border-line px-4 py-3">
          <input name="q" defaultValue={sp.q ?? ""} placeholder="Search organisation" aria-label="Search organisation" className="h-9 w-full max-w-xs rounded-md border border-line-strong bg-surface px-3 text-sm" />
        </form>
        <Table>
          <THead>
            <tr>
              <TH>Organisation</TH>
              <TH>Owner</TH>
              <TH>Plan</TH>
              <TH>Ends</TH>
              <TH align="right">Members</TH>
              <TH align="right">Factories</TH>
              <TH>Last activity</TH>
              <TH>Created</TH>
            </tr>
          </THead>
          <TBody>
            {orgs.map((x) => (
              <TR key={x.id}>
                <TD>
                  <Link className="font-medium hover:text-accent-ink" href={`/platform/${x.id}`}>
                    {x.name}
                  </Link>{" "}
                  {x.is_demo && <Badge>Demo</Badge>} {x.status === "suspended" && <Badge tone="danger">Suspended</Badge>} {!x.onboarding_completed_at && <Badge tone="warning">Setting up</Badge>}
                </TD>
                <TD className="text-muted">{x.owner_email}</TD>
                <TD>
                  <span className="capitalize">{x.plan_key}</span> <Badge tone={x.subscription_status === "active" ? "success" : x.subscription_status === "past_due" || x.subscription_status === "expired" ? "danger" : "info"}>{x.subscription_status}</Badge>
                </TD>
                <TD className="text-muted">{formatDate(x.subscription_status === "trialing" ? x.trial_ends_at : x.current_period_end, df)}</TD>
                <TD align="right">{x.members}</TD>
                <TD align="right">{x.factories}</TD>
                <TD className="text-muted">{x.last_activity ? relativeTime(x.last_activity) : "—"}</TD>
                <TD className="text-muted">{formatDate(x.created_at, df)}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </Card>
    </>
  );
}
