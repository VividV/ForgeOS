import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/misc";
import { getSession, requirePermission } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { NewRoleDialog, PermissionMatrix, DeleteRole } from "./client";

export const metadata = { title: "Roles & permissions" };

export default async function RolesPage({ searchParams }: { searchParams: Promise<{ role?: string }> }) {
  const ctx = await requirePermission("roles.read");
  const sp = await searchParams;
  const { supabase } = await getSession();
  const [{ data: roles }, { data: perms }, { data: rp }, { data: counts }] = await Promise.all([
    supabase.from("roles").select("*").eq("organization_id", ctx.org.id).order("is_owner", { ascending: false }).order("is_system", { ascending: false }).order("name"),
    supabase.from("permissions").select("*").order("module").order("action"),
    supabase.from("role_permissions").select("role_id, permission_key").eq("organization_id", ctx.org.id),
    supabase.from("member_roles").select("role_id").eq("organization_id", ctx.org.id),
  ]);
  const selected = (roles ?? []).find((r) => r.id === sp.role) ?? (roles ?? [])[0];
  const granted = new Set((rp ?? []).filter((x) => x.role_id === selected?.id).map((x) => x.permission_key));
  const countBy = new Map<string, number>();
  for (const c of counts ?? []) countBy.set(c.role_id, (countBy.get(c.role_id) ?? 0) + 1);
  const manage = ctx.can("roles.manage");

  return (
    <>
      <PageHeader title="Roles & permissions" description="Granular permissions by module (create, read, update, delete, approve, export, manage). Changes apply immediately and are audited." actions={manage && <NewRoleDialog />} />
      <div className="grid gap-4 lg:grid-cols-[260px_minmax(0,1fr)]">
        <Card>
          <ul className="p-1.5">
            {(roles ?? []).map((r) => (
              <li key={r.id}>
                <a href={`/admin/roles?role=${r.id}`} className={cn("flex items-center justify-between rounded-md px-2.5 py-2 text-[13px]", r.id === selected?.id ? "bg-accent-soft font-medium text-accent-ink" : "hover:bg-subtle")}>
                  <span>{r.name}</span>
                  <span className="tabular text-xs text-muted">{countBy.get(r.id) ?? 0}</span>
                </a>
              </li>
            ))}
          </ul>
        </Card>
        {selected && (
          <Card>
            <CardHeader
              title={
                <span className="flex items-center gap-2">
                  {selected.name} {selected.is_system && <Badge>Default role</Badge>} {selected.is_owner && <Badge tone="accent">Full access</Badge>}
                </span>
              }
              description={selected.description}
              action={manage && !selected.is_system && <DeleteRole id={selected.id} />}
            />
            <CardBody>
              {selected.is_owner ? (
                <p className="text-[13px] text-muted">The owner role always has every permission, including subscription and billing. It can&apos;t be edited.</p>
              ) : (
                <PermissionMatrix key={selected.id} roleId={selected.id} permissions={perms ?? []} granted={[...granted]} editable={manage} mine={[...ctx.permissions]} isOwner={ctx.roles.some(() => false) || ctx.can("billing.manage")} />
              )}
            </CardBody>
          </Card>
        )}
      </div>
    </>
  );
}
