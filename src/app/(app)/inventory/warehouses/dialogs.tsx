"use client";
import { Pencil, Plus } from "lucide-react";
import { ActionButton } from "@/components/forms/action-button";
import { FormDialog } from "@/components/forms/form-dialog";
import { saveWarehouse, setWarehouseActive } from "@/app/actions/catalog";
import { warehouseSchema } from "@/lib/validation/catalog";

type W = { id: string; name: string; code: string; factory_id: string | null; address: string | null };

export function WarehouseDialog({ factories, warehouse }: { factories: { value: string; label: string }[]; warehouse?: W }) {
  return (
    <FormDialog
      triggerLabel={warehouse ? "Edit" : "Add warehouse"}
      triggerIcon={warehouse ? <Pencil /> : <Plus />}
      triggerVariant={warehouse ? "ghost" : "primary"}
      triggerSize={warehouse ? "sm" : "md"}
      title={warehouse ? `Edit ${warehouse.name}` : "Add warehouse"}
      schema={warehouseSchema}
      defaultValues={warehouse}
      fields={[
        { name: "code", label: "Code", required: true, uppercase: true, placeholder: "MAIN" },
        { name: "name", label: "Name", required: true },
        { name: "factory_id", label: "Factory", type: "select", options: factories, hint: "Optional. Leave empty for a central store." },
        { name: "address", label: "Address" },
      ]}
      action={(v) => saveWarehouse(warehouse?.id ?? null, v)}
    />
  );
}

export function WarehouseToggle({ id, active }: { id: string; active: boolean }) {
  return (
    <ActionButton
      size="sm"
      variant="ghost"
      action={() => setWarehouseActive(id, !active)}
      confirm={active ? { title: "Deactivate warehouse?", description: "Only empty warehouses can be deactivated." } : undefined}
      confirmLabel="Deactivate"
    >
      {active ? "Deactivate" : "Activate"}
    </ActionButton>
  );
}
