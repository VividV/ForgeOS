import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/misc";
import { getSession, requirePermission } from "@/lib/auth";
import { integrations } from "@/lib/server-env";
import { Badge } from "@/components/ui/badge";
import { OrgSettingsForm, PrefsForm } from "./client";

export const metadata = { title: "Organisation settings" };

export default async function SettingsPage() {
  const ctx = await requirePermission("settings.read");
  const { supabase } = await getSession();
  const { data: org } = await supabase.from("organizations").select("*").eq("id", ctx.org.id).single();
  const manage = ctx.can("settings.manage");
  const list = [
    { name: "Email (Resend)", on: integrations.email, note: "Invitations and notification emails. Without it, invite links are shown to copy." },
    { name: "Google sign-in", on: integrations.google, note: "Enable the Google provider in Supabase Auth and set GOOGLE_AUTH_ENABLED=true." },
    { name: "Scheduled checks", on: integrations.serviceRole, note: "Overdue-order notifications run from the cron route using the service role key." },
  ];
  return (
    <>
      <PageHeader title="Organisation settings" description="Company details and how ForgeOS counts, values and displays your operations." />
      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader title="Company" />
          <CardBody>
            <OrgSettingsForm defaults={org ?? {}} editable={manage} />
          </CardBody>
        </Card>
        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader title="Operating preferences" />
            <CardBody>
              <PrefsForm defaults={{ ...ctx.settings, fiscal_year_start_month: String(ctx.settings.fiscal_year_start_month), po_approval_threshold: String(ctx.settings.po_approval_threshold ?? 0) }} editable={manage} />
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Integrations" description="Connections are configured with environment variables. ForgeOS never pretends a connection is active." />
            <ul className="divide-y divide-line">
              {list.map((i) => (
                <li key={i.name} className="flex items-start gap-3 px-4 py-3 text-[13px]">
                  <div className="flex-1">
                    <p className="font-medium">{i.name}</p>
                    <p className="text-xs text-muted">{i.note}</p>
                  </div>
                  {i.on ? <Badge tone="success">Connected</Badge> : <Badge>Not configured</Badge>}
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>
    </>
  );
}
