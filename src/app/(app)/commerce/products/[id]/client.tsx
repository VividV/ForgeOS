"use client";
import { Pencil, Plus } from "lucide-react";
import { ActionButton } from "@/components/forms/action-button";
import { FormDialog } from "@/components/forms/form-dialog";
import { archiveProduct, createBomVersion, saveVariant, setVariantActive } from "@/app/actions/catalog";
import { variantSchema } from "@/lib/validation/catalog";

export function VariantDialog({ productId, variant }: { productId: string; variant?: Record<string, unknown> & { id: string; name: string } }) {
  return (
    <FormDialog
      triggerLabel={variant ? "" : "Add variant"}
      triggerIcon={variant ? <Pencil /> : <Plus />}
      triggerVariant={variant ? "ghost" : "secondary"}
      triggerSize={variant ? "icon-sm" : "sm"}
      title={variant ? `Edit ${variant.name}` : "Add variant"}
      schema={variantSchema}
      defaultValues={variant}
      fields={[
        { name: "name", label: "Variant name", required: true, placeholder: "Blue / Large" },
        { name: "sku", label: "SKU" },
        { name: "size", label: "Size" },
        { name: "colour", label: "Colour" },
        { name: "selling_price", label: "Selling price (if different)", type: "number" },
      ]}
      action={(v) => saveVariant(productId, variant?.id ?? null, v)}
    />
  );
}

export function VariantToggle({ productId, variantId, active }: { productId: string; variantId: string; active: boolean }) {
  return (
    <ActionButton size="sm" variant="ghost" action={() => setVariantActive(productId, variantId, !active)}>
      {active ? "Deactivate" : "Activate"}
    </ActionButton>
  );
}

export function NewBomButton({ productId, approvedId }: { productId: string; approvedId: string | null }) {
  return (
    <ActionButton size="sm" variant="primary" action={() => createBomVersion(productId, null, approvedId)}>
      <Plus /> {approvedId ? "New version" : "Create BOM"}
    </ActionButton>
  );
}

export function ArchiveProduct({ id }: { id: string }) {
  return (
    <ActionButton
      variant="danger-outline"
      action={() => archiveProduct(id)}
      confirm={{ title: "Archive this product?", description: "It will be hidden from lists and can no longer be produced. Its history, stock movements and past orders are kept." }}
      confirmLabel="Archive"
    >
      Archive
    </ActionButton>
  );
}
