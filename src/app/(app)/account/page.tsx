import Link from "next/link";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/misc";
import { getSession, requireOrg } from "@/lib/auth";
import { ProfileForm } from "./form";

export const metadata = { title: "Profile" };

export default async function AccountPage() {
  const ctx = await requireOrg();
  const { supabase } = await getSession();
  const { data } = await supabase.from("profiles").select("full_name, phone, email").eq("id", ctx.user.id).single();
  return (
    <>
      <PageHeader title="Your profile" description={data?.email} />
      <Card className="max-w-xl">
        <CardHeader title="Details" action={<Link href="/account/password" className="text-[13px] text-accent-ink hover:underline">Change password</Link>} />
        <CardBody>
          <ProfileForm defaults={{ full_name: data?.full_name ?? "", phone: data?.phone ?? "" }} />
        </CardBody>
      </Card>
    </>
  );
}
