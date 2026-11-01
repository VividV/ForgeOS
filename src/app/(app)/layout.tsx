import { Sidebar } from "@/components/shell/sidebar";
import { Topbar } from "@/components/shell/topbar";
import { getSession, requireOrg } from "@/lib/auth";
import { visibleNav } from "@/lib/nav";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireOrg();
  const { supabase } = await getSession();
  const { count } = await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", ctx.org.id)
    .eq("user_id", ctx.user.id)
    .is("read_at", null);

  return (
    <div className="flex min-h-screen">
      <Sidebar nav={visibleNav(ctx.permissions)} orgName={ctx.org.name} isDemo={ctx.org.is_demo} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar
          orgs={ctx.orgs}
          activeOrgId={ctx.org.id}
          userName={ctx.profile.full_name}
          userEmail={ctx.user.email}
          roles={ctx.roles}
          unread={count ?? 0}
        />
        <main className="mx-auto w-full max-w-[1400px] flex-1 px-4 py-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}
