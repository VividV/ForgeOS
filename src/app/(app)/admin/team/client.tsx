"use client";
import { ClipboardCopy, Pencil, UserPlus } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";
import { ActionButton } from "@/components/forms/action-button";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Checkbox, Field, FormError, Input, Select } from "@/components/ui/form";
import { inviteMember, revokeInvitation, setMemberRoles, updateMember } from "@/app/actions/team";

type Opt = { value: string; label: string }[];

export function InviteDialog({ roles }: { roles: Opt }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [email, setEmail] = React.useState("");
  const [role, setRole] = React.useState("");
  const [link, setLink] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [pending, start] = React.useTransition();
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) {
          setLink(null);
          setEmail("");
          setError(null);
        }
      }}
      title="Invite a team member"
      description="They'll sign up (or sign in) with this email to join."
      trigger={
        <Button variant="primary">
          <UserPlus /> Invite member
        </Button>
      }
    >
      {link ? (
        <div className="flex flex-col gap-3">
          <p className="text-[13px] text-muted">Email isn&apos;t configured yet, so share this link with {email} directly (WhatsApp, SMS…). It works once and expires in 14 days.</p>
          <div className="flex gap-2">
            <Input readOnly value={link} aria-label="Invitation link" onFocus={(e) => e.currentTarget.select()} />
            <Button onClick={() => { navigator.clipboard.writeText(link); toast.success("Link copied"); }}>
              <ClipboardCopy /> Copy
            </Button>
          </div>
          <div className="flex justify-end">
            <Button variant="primary" onClick={() => setOpen(false)}>
              Done
            </Button>
          </div>
        </div>
      ) : (
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            start(async () => {
              setError(null);
              const r = await inviteMember({ email, role_id: role });
              if (!r.ok) return setError(r.error);
              toast.success(r.message ?? "Invited");
              router.refresh();
              if (r.data?.link) setLink(r.data.link);
              else setOpen(false);
            });
          }}
        >
          <FormError message={error} />
          <Field label="Email" htmlFor="inv-e" required>
            <Input id="inv-e" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
          </Field>
          <Field label="Role" htmlFor="inv-r" required>
            <Select id="inv-r" value={role} onChange={(e) => setRole(e.target.value)} required>
              <option value="" disabled>
                Select…
              </option>
              {roles.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </Select>
          </Field>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" loading={pending}>
              Send invitation
            </Button>
          </div>
        </form>
      )}
    </Dialog>
  );
}

export function RevokeInvite({ id }: { id: string }) {
  return (
    <ActionButton size="sm" variant="ghost" action={() => revokeInvitation(id)} confirm={{ title: "Revoke this invitation?", description: "The link will stop working." }} confirmLabel="Revoke">
      Revoke
    </ActionButton>
  );
}

export function MemberEditor({
  member,
  roles,
  factories,
}: {
  member: { id: string; name: string; status: string; job_title: string; factory_id: string; role_ids: string[]; self: boolean };
  roles: Opt;
  factories: Opt;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [sel, setSel] = React.useState<string[]>(member.role_ids);
  const [status, setStatus] = React.useState(member.status);
  const [title, setTitle] = React.useState(member.job_title);
  const [factory, setFactory] = React.useState(member.factory_id);
  const [error, setError] = React.useState<string | null>(null);
  const [pending, start] = React.useTransition();
  const save = () =>
    start(async () => {
      setError(null);
      const rolesChanged = JSON.stringify([...sel].sort()) !== JSON.stringify([...member.role_ids].sort());
      if (rolesChanged) {
        const r = await setMemberRoles(member.id, sel);
        if (!r.ok) return setError(r.error);
      }
      const u = await updateMember(member.id, { status, job_title: title, factory_id: factory });
      if (!u.ok) return setError(u.error);
      toast.success("Member updated");
      setOpen(false);
      router.refresh();
    });
  return (
    <Dialog
      open={open}
      onOpenChange={setOpen}
      title={`Edit ${member.name}`}
      trigger={
        <Button size="icon-sm" variant="ghost" aria-label={`Edit ${member.name}`}>
          <Pencil />
        </Button>
      }
    >
      <div className="flex flex-col gap-4">
        <FormError message={error} />
        <fieldset>
          <legend className="mb-2 text-[13px] font-medium text-ink-soft">Roles</legend>
          <div className="grid grid-cols-2 gap-2">
            {roles.map((r) => (
              <Checkbox key={r.value} label={r.label} checked={sel.includes(r.value)} onChange={(e) => setSel((s) => (e.target.checked ? [...s, r.value] : s.filter((x) => x !== r.value)))} />
            ))}
          </div>
        </fieldset>
        <Field label="Job title" htmlFor="m-title">
          <Input id="m-title" value={title} onChange={(e) => setTitle(e.target.value)} />
        </Field>
        <Field label="Home factory" htmlFor="m-factory">
          <Select id="m-factory" value={factory} onChange={(e) => setFactory(e.target.value)}>
            <option value="">All factories</option>
            {factories.map((f) => (
              <option key={f.value} value={f.value}>
                {f.label}
              </option>
            ))}
          </Select>
        </Field>
        {!member.self && (
          <Field label="Access" htmlFor="m-status" hint="Suspended members can't sign in to this organisation. Removing keeps their history.">
            <Select id="m-status" value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="active">Active</option>
              <option value="suspended">Suspended</option>
              <option value="removed">Removed</option>
            </Select>
          </Field>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button variant="primary" onClick={save} loading={pending} disabled={sel.length === 0}>
            Save
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
