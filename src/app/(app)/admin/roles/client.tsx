"use client";
import { Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";
import { z } from "zod";
import { ActionButton } from "@/components/forms/action-button";
import { FormDialog } from "@/components/forms/form-dialog";
import { Button } from "@/components/ui/button";
import { FormError } from "@/components/ui/form";
import { createRole, deleteRole, saveRolePermissions } from "@/app/actions/team";

export function NewRoleDialog() {
  return (
    <FormDialog
      triggerLabel="New role"
      triggerIcon={<Plus />}
      triggerVariant="primary"
      title="New role"
      description="Start empty, then tick the permissions it needs."
      schema={z.object({ name: z.string().trim().min(2, "Name the role") })}
      fields={[
        { name: "name", label: "Role name", required: true, placeholder: "Store keeper" },
        { name: "description", label: "Description" },
      ]}
      action={createRole}
    />
  );
}

export function DeleteRole({ id }: { id: string }) {
  return (
    <ActionButton size="sm" variant="danger-outline" action={() => deleteRole(id)} confirm={{ title: "Delete this role?", description: "Only roles with no members can be deleted." }} confirmLabel="Delete" redirectTo="/admin/roles">
      <Trash2 /> Delete
    </ActionButton>
  );
}

const ACTIONS = ["read", "create", "update", "delete", "approve", "adjust", "export", "manage", "work"];
const MODULE_LABEL: Record<string, string> = {
  dashboard: "Mission Control", production_orders: "Production orders", job_cards: "Job cards", work_centres: "Factories & work centres",
  routing: "Stages & routings", products: "Products", bom: "Bills of materials", materials: "Materials", inventory: "Inventory",
  warehouses: "Warehouses", suppliers: "Suppliers", costing: "Costs & values", reports: "Reports", team: "Team", roles: "Roles",
  settings: "Settings", audit_logs: "Audit log", billing: "Billing",
};

export function PermissionMatrix({
  roleId,
  permissions,
  granted,
  editable,
  mine,
  isOwner,
}: {
  roleId: string;
  permissions: { key: string; module: string; action: string; description: string }[];
  granted: string[];
  editable: boolean;
  mine: string[];
  isOwner: boolean;
}) {
  const router = useRouter();
  const [sel, setSel] = React.useState(new Set(granted));
  const [error, setError] = React.useState<string | null>(null);
  const [pending, start] = React.useTransition();
  const modules = [...new Set(permissions.map((p) => p.module))];
  const mineSet = new Set(mine);
  const dirty = [...sel].sort().join() !== [...granted].sort().join();
  return (
    <div className="flex flex-col gap-3">
      <FormError message={error} />
      <div className="overflow-x-auto">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="border-b border-line text-left text-[11px] uppercase tracking-wide text-muted">
              <th className="py-2 pr-3 font-medium">Module</th>
              {ACTIONS.map((a) => (
                <th key={a} className="px-2 py-2 text-center font-medium">
                  {a}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {modules.map((m) => (
              <tr key={m}>
                <td className="py-2 pr-3">{MODULE_LABEL[m] ?? m}</td>
                {ACTIONS.map((a) => {
                  const p = permissions.find((x) => x.module === m && x.action === a);
                  if (!p) return <td key={a} />;
                  const blocked = !isOwner && !mineSet.has(p.key);
                  return (
                    <td key={a} className="px-2 py-2 text-center">
                      <input
                        type="checkbox"
                        className="size-4 accent-accent"
                        checked={sel.has(p.key)}
                        disabled={!editable || blocked}
                        title={blocked ? "You can't grant a permission you don't have" : p.description}
                        aria-label={`${MODULE_LABEL[m] ?? m}: ${a}`}
                        onChange={(e) =>
                          setSel((s) => {
                            const n = new Set(s);
                            if (e.target.checked) n.add(p.key);
                            else n.delete(p.key);
                            return n;
                          })
                        }
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {editable && (
        <div className="flex justify-end">
          <Button
            variant="primary"
            disabled={!dirty}
            loading={pending}
            onClick={() =>
              start(async () => {
                setError(null);
                const r = await saveRolePermissions(roleId, [...sel]);
                if (!r.ok) return setError(r.error);
                toast.success("Permissions saved");
                router.refresh();
              })
            }
          >
            Save permissions
          </Button>
        </div>
      )}
    </div>
  );
}
