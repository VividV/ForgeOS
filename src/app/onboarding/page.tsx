import { Check } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getOrgContext } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { ConfigForm, DataStep, FactoryForm, OrgForm, ProfileForm, TeamStep } from "./steps";

export const metadata = { title: "Set up your factory" };

const STEPS = [
  { key: "organization", label: "Company" },
  { key: "profile", label: "Manufacturing profile" },
  { key: "factory", label: "Factory" },
  { key: "configuration", label: "Configuration" },
  { key: "team", label: "Invite team" },
  { key: "data", label: "Initial data" },
] as const;

export default async function OnboardingPage({ searchParams }: { searchParams: Promise<{ step?: string; new?: string }> }) {
  const sp = await searchParams;
  const ctx = await getOrgContext();
  const creatingNew = sp.new === "1" || !ctx;
  if (ctx && !creatingNew && ctx.org.onboarding_completed_at && !sp.step) redirect("/");
  if (ctx && !creatingNew && !ctx.can("settings.manage")) {
    // invited members never see the owner's setup flow
    redirect("/");
  }

  let step: string = creatingNew ? "organization" : (sp.step ?? "");
  let state: Record<string, boolean> = {};
  let roles: { id: string; name: string }[] = [];
  let hasFactory = false;
  if (ctx && !creatingNew) {
    const { getSession } = await import("@/lib/auth");
    const { supabase } = await getSession();
    const [{ data: org }, { count }, { data: r }] = await Promise.all([
      supabase.from("organizations").select("onboarding_state").eq("id", ctx.org.id).single(),
      supabase.from("factories").select("id", { count: "exact", head: true }).eq("organization_id", ctx.org.id).is("deleted_at", null),
      supabase.from("roles").select("id, name, is_owner").eq("organization_id", ctx.org.id).order("name"),
    ]);
    state = { organization: true, ...(org?.onboarding_state ?? {}), factory: (count ?? 0) > 0 };
    hasFactory = (count ?? 0) > 0;
    roles = (r ?? []).filter((x) => !x.is_owner).map((x) => ({ id: x.id, name: x.name }));
    if (!STEPS.some((s) => s.key === step) || step === "organization") {
      step = STEPS.find((s) => !state[s.key])?.key ?? "data";
    }
    if (step === "factory" && hasFactory) step = "configuration";
  }
  const idx = STEPS.findIndex((s) => s.key === step);

  return (
    <div className="min-h-screen bg-canvas">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex h-14 max-w-5xl items-center gap-2 px-6">
          <div className="flex size-7 items-center justify-center rounded-md bg-accent text-[13px] font-bold text-white">F</div>
          <span className="text-sm font-semibold">ForgeOS</span>
          <span className="ml-2 text-[13px] text-muted">Set up {ctx && !creatingNew ? ctx.org.name : "your organisation"}</span>
          {ctx && creatingNew && (
            <Link href="/" className="ml-auto text-[13px] text-muted hover:text-ink">
              Cancel
            </Link>
          )}
        </div>
      </header>
      <div className="mx-auto grid max-w-5xl gap-8 px-6 py-10 md:grid-cols-[220px_1fr]">
        <ol className="flex flex-row gap-3 overflow-x-auto md:flex-col md:gap-1" aria-label="Setup steps">
          {STEPS.map((s, i) => {
            const done = state[s.key] || i < idx;
            const current = s.key === step;
            return (
              <li key={s.key} className={cn("flex shrink-0 items-center gap-2.5 rounded-md px-2 py-1.5 text-[13px]", current ? "bg-surface font-medium text-ink shadow-card" : "text-muted")}>
                <span className={cn("flex size-5 items-center justify-center rounded-full border text-[10px] font-semibold", done ? "border-success bg-success text-white" : current ? "border-accent text-accent-ink" : "border-line-strong")}>
                  {done ? <Check className="size-3" /> : i + 1}
                </span>
                {s.label}
              </li>
            );
          })}
        </ol>
        <section className="rounded-xl border border-line bg-surface p-6 shadow-card">
          {step === "organization" && <OrgForm />}
          {step === "profile" && <ProfileForm />}
          {step === "factory" && <FactoryForm />}
          {step === "configuration" && ctx && <ConfigForm defaults={ctx.settings} />}
          {step === "team" && <TeamStep roles={roles} />}
          {step === "data" && <DataStep />}
        </section>
      </div>
    </div>
  );
}
