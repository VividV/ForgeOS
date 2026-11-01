import { redirect } from "next/navigation";
import { getOrgContext } from "@/lib/auth";
import { homeFor } from "@/lib/nav";

export default async function Home() {
  const ctx = await getOrgContext();
  if (!ctx || (!ctx.org.onboarding_completed_at && ctx.can("settings.manage"))) redirect("/onboarding");
  redirect(homeFor(ctx.permissions));
}
