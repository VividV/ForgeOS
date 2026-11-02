import { notFound } from "next/navigation";
import { Card, CardBody, CardHeader, DescriptionList } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/misc";
import { getSession, requireOrg } from "@/lib/auth";
import { formatDate } from "@/lib/format";
import { OrgAdminForm } from "./form";

export const metadata = { title: "Organisation" };

export default async function PlatformOrgPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireOrg();
  if (!ctx.profile.is_platform_admin) notFound();
  const { supabase } = await getSession();
  const { data } = await supabase.rpc("platform_organizations", { p_search: null });
  const o = ((data ?? []) as Record<string, string | number | boolean | null>[]).find((x) => x.id === id);
  if (!o) notFound();
  const df = ctx.settings.date_format;
  const d = (v: unknown) => (v ? String(v).slice(0, 10) : "");
  return (
    <>
      <PageHeader title={String(o.name)} breadcrumb={[{ label: "Platform admin", href: "/platform" }, { label: String(o.name) }]} description={`${o.slug} · ${o.country}`} />
      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader title="Overview" />
          <CardBody>
            <DescriptionList
              className="sm:grid-cols-1"
              items={[
                { label: "Owner", value: String(o.owner_email ?? "—") },
                { label: "Created", value: formatDate(String(o.created_at), df) },
                { label: "Setup finished", value: o.onboarding_completed_at ? formatDate(String(o.onboarding_completed_at), df) : "Not yet" },
                { label: "Members · factories", value: `${o.members} · ${o.factories}` },
                { label: "Plan", value: `${o.plan_key} (${o.subscription_status})` },
              ]}
            />
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Subscription and access" description="Use for manual activations (bank transfer), extensions and suspensions. A note is required and recorded." />
          <CardBody>
            <OrgAdminForm id={id} defaults={{ plan: String(o.plan_key), status: String(o.subscription_status), trial_ends_at: d(o.trial_ends_at), current_period_end: d(o.current_period_end), org_status: String(o.status), note: "" }} />
          </CardBody>
        </Card>
      </div>
    </>
  );
}
