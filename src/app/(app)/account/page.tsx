import Link from "next/link";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/misc";
import { getSession, requireOrg } from "@/lib/auth";
import { integrations } from "@/lib/server-env";
import { ProfileForm } from "./form";
import { WhatsAppForm } from "./whatsapp";

export const metadata = { title: "Profile" };

export default async function AccountPage() {
  const ctx = await requireOrg();
  const { supabase } = await getSession();
  const [{ data }, { data: wa }] = await Promise.all([
    supabase.from("profiles").select("full_name, phone, email").eq("id", ctx.user.id).single(),
    supabase.from("whatsapp_contacts").select("phone, alerts, daily_summary").eq("organization_id", ctx.org.id).eq("user_id", ctx.user.id).maybeSingle(),
  ]);
  return (
    <>
      <PageHeader title="Your profile" description={data?.email} />
      <Card className="max-w-xl">
        <CardHeader title="Details" action={<Link href="/account/password" className="text-[13px] text-accent-ink hover:underline">Change password</Link>} />
        <CardBody>
          <ProfileForm defaults={{ full_name: data?.full_name ?? "", phone: data?.phone ?? "" }} />
        </CardBody>
      </Card>
      <Card className="mt-4 max-w-xl">
        <CardHeader
          title="WhatsApp"
          description={
            integrations.whatsapp
              ? `Get alerts for ${ctx.org.name} on WhatsApp, and reply to update job cards (send HELP for commands).`
              : "WhatsApp messaging isn't switched on for ForgeOS yet. You can save your number now; messages start once it's enabled."
          }
        />
        <CardBody>
          <WhatsAppForm linked={Boolean(wa)} defaults={{ phone: wa?.phone ?? data?.phone ?? "", alerts: wa?.alerts ?? true, daily_summary: wa?.daily_summary ?? false }} />
        </CardBody>
      </Card>
    </>
  );
}
