"use client";
import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, FormError, Input, Select, Textarea } from "@/components/ui/form";
import { createProductionOrder } from "@/app/actions/production";

type Opt = { value: string; label: string }[];

export function NewOrderForm({
  products,
  factories,
  warehouses,
  members,
  defaults,
  requireApproval,
  canApprove,
}: {
  products: { id: string; label: string; variants: { id: string; name: string; is_default: boolean }[] }[];
  factories: Opt;
  warehouses: Opt;
  members: Opt;
  defaults: { product_id: string; quantity: string; source: string };
  requireApproval: boolean;
  canApprove: boolean;
}) {
  const router = useRouter();
  const [productId, setProductId] = React.useState(defaults.product_id || products[0]?.id);
  const [error, setError] = React.useState<string | null>(null);
  const [fe, setFe] = React.useState<Record<string, string>>({});
  const [pending, start] = React.useTransition();
  const product = products.find((p) => p.id === productId);

  const submit = (fd: FormData) =>
    start(async () => {
      setError(null);
      setFe({});
      const values = Object.fromEntries(fd.entries()) as Record<string, unknown>;
      values.submit = fd.get("submit") === "on";
      const r = await createProductionOrder(values);
      if (!r.ok) {
        setError(r.error);
        setFe(r.fieldErrors ?? {});
        return;
      }
      toast.success(r.message ?? "Created");
      router.push(r.data?.redirect ?? "/operations/production-orders");
    });

  return (
    <form action={submit} className="flex flex-col gap-4" noValidate>
      <FormError message={error} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Product" htmlFor="product_id" required error={fe.product_id} className="sm:col-span-2">
          <Select id="product_id" name="product_id" value={productId} onChange={(e) => setProductId(e.target.value)}>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </Select>
        </Field>
        {product && product.variants.length > 1 && (
          <Field label="Variant" htmlFor="variant_id">
            <Select id="variant_id" name="variant_id" defaultValue={product.variants[0].id}>
              {product.variants.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </Select>
          </Field>
        )}
        <Field label="Quantity to produce" htmlFor="quantity" required error={fe.quantity}>
          <Input id="quantity" name="quantity" type="number" min="0" step="any" defaultValue={defaults.quantity} autoFocus />
        </Field>
        <Field label="Factory" htmlFor="factory_id" required error={fe.factory_id}>
          <Select id="factory_id" name="factory_id" defaultValue={factories[0]?.value}>
            {factories.map((f) => (
              <option key={f.value} value={f.value}>
                {f.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Priority" htmlFor="priority">
          <Select id="priority" name="priority" defaultValue="normal">
            <option value="low">Low</option>
            <option value="normal">Normal</option>
            <option value="high">High</option>
            <option value="urgent">Urgent</option>
          </Select>
        </Field>
        <Field label="Planned start" htmlFor="planned_start_date" error={fe.planned_start_date}>
          <Input id="planned_start_date" name="planned_start_date" type="date" />
        </Field>
        <Field label="Due date" htmlFor="due_date" error={fe.due_date}>
          <Input id="due_date" name="due_date" type="date" />
        </Field>
        <Field label="Production manager" htmlFor="manager_id">
          <Select id="manager_id" name="manager_id" defaultValue="">
            <option value="">—</option>
            {members.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Source" htmlFor="source">
          <Select id="source" name="source" defaultValue={defaults.source}>
            <option value="manual">Manual planning</option>
            <option value="customer_order">Customer order</option>
            <option value="replenishment">Stock replenishment</option>
          </Select>
        </Field>
        <Field label="Reference" htmlFor="source_reference" hint="Customer PO, order no., etc.">
          <Input id="source_reference" name="source_reference" />
        </Field>
        <Field label="Take materials from" htmlFor="material_warehouse_id" hint="Defaults to the factory's store.">
          <Select id="material_warehouse_id" name="material_warehouse_id" defaultValue="">
            <option value="">Factory default store</option>
            {warehouses.map((w) => (
              <option key={w.value} value={w.value}>
                {w.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Put finished goods into" htmlFor="output_warehouse_id">
          <Select id="output_warehouse_id" name="output_warehouse_id" defaultValue="">
            <option value="">Same as materials</option>
            {warehouses.map((w) => (
              <option key={w.value} value={w.value}>
                {w.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Notes" htmlFor="notes" className="sm:col-span-2">
          <Textarea id="notes" name="notes" />
        </Field>
      </div>
      <Checkbox name="submit" defaultChecked label={requireApproval || !canApprove ? "Submit for approval straight away" : "Submit for approval straight away"} />
      <div className="flex justify-end gap-2 border-t border-line pt-4">
        <Button type="button" variant="ghost" onClick={() => router.back()}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" loading={pending}>
          Create order
        </Button>
      </div>
    </form>
  );
}
