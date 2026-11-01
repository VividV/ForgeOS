import { Badge } from "@/components/ui/badge";
import { Card, CardHeader } from "@/components/ui/card";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { TBody, TD, TH, THead, TR, Table } from "@/components/ui/table";
import { getSession, requirePermission } from "@/lib/auth";
import { formatDate, relativeTime } from "@/lib/format";
import { lookups } from "@/lib/services/lookups";
import { InviteDialog, MemberEditor, RevokeInvite } from "./client";

export const metadata = { title: "Team members" };

export default async function TeamPage() {
  const ctx = await requirePermission("team.read");
  const { supabase } = await getSession();
  const manage = ctx.can("team.manage");
  const [{ data: members }, { data: invites }, opts] = await Promise.all([
    supabase
      .from("organization_members")
      .select("id, user_id, status, job_title, factory_id, joined_at, profiles(full_name, email), factories(name), member_roles(role_id, roles(name, is_owner))")
      .eq("organization_id", ctx.org.id)
      .neq("status", "removed")
      .order("joined_at"),
    manage ? supabase.from("invitations").select("id, email, status, expires_at, created_at, roles(name)").eq("organization_id", ctx.org.id).eq("status", "pending").order("created_at", { ascending: false }) : Promise.resolve({ data: [] }),
    lookups(ctx.org.id, ["roles", "factories"]),
  ]);
  const roleOptions = opts.roles;

  return (
    <>
      <PageHeader title="Team members" description="People in your organisation and what they can do. Access is enforced on the server and in the database, not just hidden in the menu." actions={manage && <InviteDialog roles={roleOptions} />} />
      <Card className="mb-4">
        <Table>
          <THead>
            <tr>
              <TH>Name</TH>
              <TH>Roles</TH>
              <TH>Job title</TH>
              <TH>Factory</TH>
              <TH>Status</TH>
              <TH>Joined</TH>
              {manage && <TH />}
            </tr>
          </THead>
          <TBody>
            {(members ?? []).map((m) => {
              const p = m.profiles as unknown as { full_name: string; email: string };
              const roles = (m.member_roles as unknown as { role_id: string; roles: { name: string; is_owner: boolean } }[]) ?? [];
              return (
                <TR key={m.id}>
                  <TD>
                    <p className="font-medium">
                      {p.full_name || "—"} {m.user_id === ctx.user.id && <span className="text-xs text-muted">(you)</span>}
                    </p>
                    <p className="text-xs text-muted">{p.email}</p>
                  </TD>
                  <TD>
                    <div className="flex flex-wrap gap-1">
                      {roles.map((r) => (
                        <Badge key={r.role_id} tone={r.roles.is_owner ? "accent" : "neutral"}>
                          {r.roles.name}
                        </Badge>
                      ))}
                    </div>
                  </TD>
                  <TD className="text-muted">{m.job_title ?? "—"}</TD>
                  <TD className="text-muted">{(m.factories as unknown as { name: string } | null)?.name ?? "All"}</TD>
                  <TD>{m.status === "active" ? <Badge tone="success">Active</Badge> : <Badge tone="warning">Suspended</Badge>}</TD>
                  <TD className="text-muted">{formatDate(m.joined_at, ctx.settings.date_format, ctx.settings.timezone)}</TD>
                  {manage && (
                    <TD align="right">
                      <MemberEditor
                        member={{ id: m.id, name: p.full_name || p.email, status: m.status, job_title: m.job_title ?? "", factory_id: m.factory_id ?? "", role_ids: roles.map((r) => r.role_id), self: m.user_id === ctx.user.id }}
                        roles={roleOptions}
                        factories={opts.factories}
                      />
                    </TD>
                  )}
                </TR>
              );
            })}
          </TBody>
        </Table>
      </Card>
      {manage && (
        <Card>
          <CardHeader title="Pending invitations" description="Invitation links expire after 14 days." />
          {(invites ?? []).length === 0 ? (
            <EmptyState title="No pending invitations" />
          ) : (
            <Table>
              <TBody>
                {(invites ?? []).map((i) => (
                  <TR key={i.id}>
                    <TD>{i.email}</TD>
                    <TD>
                      <Badge>{(i.roles as unknown as { name: string }).name}</Badge>
                    </TD>
                    <TD className="text-muted">sent {relativeTime(i.created_at)}</TD>
                    <TD className="text-muted">expires {formatDate(i.expires_at, ctx.settings.date_format, ctx.settings.timezone)}</TD>
                    <TD align="right">
                      <RevokeInvite id={i.id} />
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </Card>
      )}
    </>
  );
}
