"use client";
import { Boxes, ClipboardCopy, Factory, FileUp, PackagePlus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";
import { SchemaForm } from "@/components/forms/schema-form";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, FormError, Input, Select, Textarea } from "@/components/ui/form";
import { createFirstFactory, createOrganization, finishOnboarding, saveConfiguration, saveProfile, skipStep } from "@/app/actions/onboarding";
import { inviteMember } from "@/app/actions/team";
import { BUSINESS_TYPES, CHALLENGES, COUNTRIES, INDUSTRIES, PRODUCTION_MODELS, TIMEZONES, configSchema, orgSchema } from "@/lib/validation/onboarding";

function StepTitle({ title, description }: { title: string; description: string }) {
  return (
    <div className="mb-6">
      <h1 className="text-lg font-semibold tracking-tight">{title}</h1>
      <p className="mt-1 text-[13px] text-muted">{description}</p>
    </div>
  );
}

export function OrgForm() {
  return (
    <>
      <StepTitle title="Tell us about your company" description="This creates your organisation. You can change these details later in settings." />
      <SchemaForm
        schema={orgSchema}
        defaultValues={{ country: "NG" }}
        fields={[
          { name: "name", label: "Company name", required: true, autoFocus: true, span: 2 },
          { name: "business_type", label: "Business type", type: "select", options: BUSINESS_TYPES },
          { name: "industry", label: "Industry", type: "select", options: INDUSTRIES },
          { name: "country", label: "Country", type: "select", options: COUNTRIES, required: true, hint: "Nigerian organisations default to naira (₦)." },
          { name: "phone", label: "Phone number", type: "tel" },
          { name: "email", label: "Company email", type: "email" },
          { name: "website", label: "Website", type: "url", placeholder: "https://" },
          { name: "address", label: "Business address", type: "textarea" },
        ]}
        action={createOrganization}
        submitLabel="Create organisation"
      />
    </>
  );
}

export function ProfileForm() {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);
  const submit = (fd: FormData) =>
    start(async () => {
      const res = await saveProfile({
        main_products: fd.get("main_products"),
        employee_count_range: fd.get("employee_count_range"),
        factory_count: fd.get("factory_count"),
        production_model: fd.get("production_model"),
        production_challenges: fd.getAll("production_challenges"),
      });
      if (!res.ok) return setError(res.error);
      router.push(res.data?.redirect ?? "/onboarding");
    });
  return (
    <>
      <StepTitle title="Your manufacturing profile" description="Helps us tailor ForgeOS to how you produce. All optional." />
      <form action={submit} className="flex flex-col gap-4">
        <FormError message={error} />
        <Field label="Main products you manufacture" htmlFor="main_products">
          <Textarea id="main_products" name="main_products" placeholder="e.g. men's shirts, school uniforms, corporate wear" />
        </Field>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Number of employees" htmlFor="employee_count_range">
            <Select id="employee_count_range" name="employee_count_range" defaultValue="">
              <option value="">—</option>
              {["1-10", "11-50", "51-200", "201-500", "500+"].map((v) => (
                <option key={v}>{v}</option>
              ))}
            </Select>
          </Field>
          <Field label="Number of factories" htmlFor="factory_count">
            <Input id="factory_count" name="factory_count" type="number" min="0" step="1" />
          </Field>
          <Field label="Production model" htmlFor="production_model">
            <Select id="production_model" name="production_model" defaultValue="">
              <option value="">—</option>
              {PRODUCTION_MODELS.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <fieldset>
          <legend className="mb-2 text-[13px] font-medium text-ink-soft">Main production challenges</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {CHALLENGES.map((c) => (
              <Checkbox key={c} name="production_challenges" value={c} label={c} />
            ))}
          </div>
        </fieldset>
        <div className="flex justify-between border-t border-line pt-4">
          <Button type="button" variant="ghost" onClick={() => start(async () => { const r = await skipStep("profile"); if (r.ok) router.push(r.data!.redirect!); })}>
            Skip
          </Button>
          <Button type="submit" variant="primary" loading={pending}>
            Continue
          </Button>
        </div>
      </form>
    </>
  );
}

const DAYS = [
  { v: 1, l: "Mon" }, { v: 2, l: "Tue" }, { v: 3, l: "Wed" }, { v: 4, l: "Thu" }, { v: 5, l: "Fri" }, { v: 6, l: "Sat" }, { v: 7, l: "Sun" },
];

export function FactoryForm() {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string>>({});
  const submit = (fd: FormData) =>
    start(async () => {
      const values = Object.fromEntries(fd.entries());
      const res = await createFirstFactory({ ...values, working_days: fd.getAll("working_days") });
      if (!res.ok) {
        setError(res.error);
        setFieldErrors(res.fieldErrors ?? {});
        return;
      }
      toast.success("Factory added");
      router.push(res.data?.redirect ?? "/onboarding");
    });
  return (
    <>
      <StepTitle title="Set up your first factory" description="A store (warehouse) is created for it automatically. You can add more factories later." />
      <form action={submit} className="flex flex-col gap-4">
        <FormError message={error} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Factory name" htmlFor="name" required error={fieldErrors.name}>
            <Input id="name" name="name" required autoFocus placeholder="e.g. Ikeja Plant" />
          </Field>
          <Field label="Short code" htmlFor="code" hint="Used on documents, e.g. IKJ" error={fieldErrors.code}>
            <Input id="code" name="code" className="uppercase" maxLength={10} />
          </Field>
          <Field label="Address" htmlFor="address" className="sm:col-span-2">
            <Input id="address" name="address" />
          </Field>
          <Field label="Production capacity per day" htmlFor="capacity_per_day" error={fieldErrors.capacity_per_day}>
            <Input id="capacity_per_day" name="capacity_per_day" type="number" min="0" step="any" />
          </Field>
          <Field label="Capacity unit" htmlFor="capacity_unit">
            <Input id="capacity_unit" name="capacity_unit" placeholder="e.g. pieces" />
          </Field>
          <Field label="Number of work centres" htmlFor="work_centre_count" hint="We'll create them so you can rename them." error={fieldErrors.work_centre_count}>
            <Input id="work_centre_count" name="work_centre_count" type="number" min="0" max="30" step="1" defaultValue="3" />
          </Field>
          <Field label="Time zone" htmlFor="timezone">
            <Select id="timezone" name="timezone" defaultValue="Africa/Lagos">
              {TIMEZONES.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </Select>
          </Field>
          <Field label="Opens at" htmlFor="opens_at">
            <Input id="opens_at" name="opens_at" type="time" defaultValue="08:00" />
          </Field>
          <Field label="Closes at" htmlFor="closes_at">
            <Input id="closes_at" name="closes_at" type="time" defaultValue="17:00" />
          </Field>
        </div>
        <fieldset>
          <legend className="mb-2 text-[13px] font-medium text-ink-soft">Working days</legend>
          <div className="flex flex-wrap gap-3">
            {DAYS.map((d) => (
              <Checkbox key={d.v} name="working_days" value={d.v} label={d.l} defaultChecked={d.v <= 6} />
            ))}
          </div>
          {fieldErrors.working_days && <p className="mt-1 text-xs text-danger-ink">{fieldErrors.working_days}</p>}
        </fieldset>
        <Field label="Production stages" htmlFor="stage_template" hint="A starting workflow for production orders. You can rename, reorder or replace stages at any time.">
          <Select id="stage_template" name="stage_template" defaultValue="generic">
            <option value="generic">General manufacturing (Preparation → Processing → Assembly → Finishing → QC → Packaging)</option>
            <option value="garment">Garments (Design approval → Fabric inspection → Cutting → … → Packaging)</option>
            <option value="food">Food & beverage</option>
            <option value="furniture">Furniture</option>
          </Select>
        </Field>
        <div className="flex justify-end border-t border-line pt-4">
          <Button type="submit" variant="primary" loading={pending}>
            Add factory
          </Button>
        </div>
      </form>
    </>
  );
}

export function ConfigForm({ defaults }: { defaults: Record<string, unknown> }) {
  return (
    <>
      <StepTitle title="Configuration" description="How ForgeOS counts, values and displays your operations." />
      <SchemaForm
        schema={configSchema}
        defaultValues={{ ...defaults, fiscal_year_start_month: String(defaults.fiscal_year_start_month ?? 1) }}
        fields={[
          { name: "currency", label: "Default currency", type: "select", required: true, options: [
            { value: "NGN", label: "Nigerian naira (₦)" }, { value: "USD", label: "US dollar ($)" }, { value: "GBP", label: "Pound sterling (£)" }, { value: "EUR", label: "Euro (€)" },
          ] },
          { name: "measurement_system", label: "Measurement units", type: "select", required: true, options: [{ value: "metric", label: "Metric (m, kg)" }, { value: "imperial", label: "Imperial (yd, lb)" }] },
          { name: "date_format", label: "Date format", type: "select", required: true, options: [{ value: "dd/MM/yyyy", label: "31/12/2026" }, { value: "MM/dd/yyyy", label: "12/31/2026" }, { value: "yyyy-MM-dd", label: "2026-12-31" }] },
          { name: "fiscal_year_start_month", label: "Fiscal year starts", type: "select", required: true, options: ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"].map((m, i) => ({ value: String(i + 1), label: m })) },
          { name: "inventory_valuation", label: "Inventory valuation", type: "select", required: true, options: [{ value: "weighted_average", label: "Weighted average cost" }, { value: "fifo", label: "FIFO (coming soon)" }], hint: "Weighted average is applied consistently to every movement." },
          { name: "costing_method", label: "Production costing", type: "select", required: true, options: [{ value: "actual", label: "Actual cost (from materials issued)" }, { value: "standard", label: "Standard cost" }] },
          { name: "require_production_approval", label: "Production orders need approval before materials are reserved", type: "checkbox", span: 2 },
        ]}
        action={saveConfiguration}
        submitLabel="Continue"
      />
    </>
  );
}

export function TeamStep({ roles }: { roles: { id: string; name: string }[] }) {
  const router = useRouter();
  const [links, setLinks] = React.useState<{ email: string; link?: string }[]>([]);
  const [pending, start] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);
  const formRef = React.useRef<HTMLFormElement>(null);
  const submit = (fd: FormData) =>
    start(async () => {
      setError(null);
      const email = String(fd.get("email") ?? "");
      const res = await inviteMember({ email, role_id: fd.get("role_id") });
      if (!res.ok) return setError(res.error);
      toast.success(res.message ?? "Invited");
      setLinks((l) => [...l, { email, link: res.data?.link }]);
      formRef.current?.reset();
    });
  return (
    <>
      <StepTitle title="Invite your team" description="Each person gets a role that controls what they can see and do. You can do this later from Team Members." />
      <form ref={formRef} action={submit} className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <Field label="Email" htmlFor="inv-email" className="flex-1">
          <Input id="inv-email" name="email" type="email" required />
        </Field>
        <Field label="Role" htmlFor="inv-role" className="sm:w-56">
          <Select id="inv-role" name="role_id" required defaultValue="">
            <option value="" disabled>Select…</option>
            {roles.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </Select>
        </Field>
        <Button type="submit" variant="secondary" loading={pending}>
          Invite
        </Button>
      </form>
      <div className="mt-3">
        <FormError message={error} />
      </div>
      {links.length > 0 && (
        <ul className="mt-4 divide-y divide-line rounded-lg border border-line">
          {links.map((l) => (
            <li key={l.email} className="flex items-center gap-3 px-3 py-2 text-[13px]">
              <span className="flex-1 truncate">{l.email}</span>
              {l.link ? (
                <Button size="sm" variant="ghost" onClick={() => { navigator.clipboard.writeText(l.link!); toast.success("Link copied"); }}>
                  <ClipboardCopy /> Copy invite link
                </Button>
              ) : (
                <span className="text-success">Email sent</span>
              )}
            </li>
          ))}
        </ul>
      )}
      <div className="mt-6 flex justify-end border-t border-line pt-4">
        <Button variant="primary" onClick={() => start(async () => { const r = await skipStep("team"); if (r.ok) router.push(r.data!.redirect!); })}>
          {links.length ? "Continue" : "Skip for now"}
        </Button>
      </div>
    </>
  );
}

export function DataStep() {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);
  const finish = (to?: string) =>
    start(async () => {
      const r = await finishOnboarding();
      if (!r.ok) return setError(r.error);
      router.push(to ?? r.data?.redirect ?? "/overview");
      router.refresh();
    });
  const options = [
    { icon: <PackagePlus />, title: "Add your first product", text: "Define what you make, then its bill of materials.", to: "/commerce/products/new" },
    { icon: <FileUp />, title: "Import raw materials from CSV", text: "Bring your spreadsheet across, with opening stock.", to: "/inventory/materials/import" },
    { icon: <Boxes />, title: "Import products from CSV", text: "Upload your product list in one go.", to: "/commerce/products/import" },
    { icon: <Factory />, title: "Create your first production order", text: "Needs a product with an approved BOM.", to: "/operations/production-orders/new" },
  ];
  return (
    <>
      <StepTitle title="You're ready to start" description="Your workspace is empty: nothing has been added on your behalf. Choose where to begin." />
      <FormError message={error} />
      <div className="grid gap-3 sm:grid-cols-2">
        {options.map((o) => (
          <button
            key={o.title}
            onClick={() => finish(o.to)}
            disabled={pending}
            className="flex items-start gap-3 rounded-lg border border-line p-4 text-left transition-colors hover:border-accent/50 hover:bg-accent-soft/40 disabled:opacity-60"
          >
            <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-accent-soft text-accent-ink [&_svg]:size-4">{o.icon}</span>
            <span>
              <span className="block text-sm font-medium">{o.title}</span>
              <span className="mt-0.5 block text-xs text-muted">{o.text}</span>
            </span>
          </button>
        ))}
      </div>
      <div className="mt-6 flex items-center justify-between border-t border-line pt-4">
        <Link href="/onboarding?step=team" className="text-[13px] text-muted hover:text-ink">
          Back
        </Link>
        <Button variant="primary" loading={pending} onClick={() => finish()}>
          Go to Mission Control
        </Button>
      </div>
    </>
  );
}
