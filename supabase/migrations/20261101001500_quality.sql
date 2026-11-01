-- Quality management: reusable checklists, inspections, defects and corrective actions.
-- Final production inspections gate how many units may enter finished-goods stock.

create table public.quality_templates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name text not null,
  applies_to text not null default 'production' check (applies_to in ('production', 'goods_receipt')),
  stage_id uuid references public.production_stages (id) on delete set null,
  product_id uuid references public.products (id) on delete cascade,
  description text,
  is_active boolean not null default true,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid,
  unique (organization_id, name),
  unique (organization_id, id)
);
create trigger quality_templates_touch before update on public.quality_templates for each row execute function app.tg_touch();

create table public.quality_template_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  template_id uuid not null,
  sequence integer not null,
  name text not null,
  check_type text not null default 'pass_fail' check (check_type in ('pass_fail', 'measurement', 'text')),
  target text,
  required boolean not null default true,
  unique (template_id, sequence),
  foreign key (organization_id, template_id) references public.quality_templates (organization_id, id) on delete cascade
);

create table public.quality_checks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  number text not null,
  check_type text not null check (check_type in ('production', 'goods_receipt')),
  is_final boolean not null default false,
  production_order_id uuid references public.production_orders (id) on delete cascade,
  operation_id uuid references public.production_operations (id) on delete set null,
  goods_receipt_id uuid references public.goods_receipts (id) on delete cascade,
  product_id uuid references public.products (id) on delete set null,
  template_id uuid references public.quality_templates (id) on delete set null,
  inspector_id uuid references public.profiles (id) default auth.uid(),
  inspected_at timestamptz not null default now(),
  quantity_inspected numeric(18, 4) not null check (quantity_inspected > 0),
  quantity_passed numeric(18, 4) not null check (quantity_passed >= 0),
  quantity_rejected numeric(18, 4) not null check (quantity_rejected >= 0),
  result text not null check (result in ('pass', 'fail', 'conditional')),
  conditional_note text,
  approved_by uuid references public.profiles (id),
  notes text,
  created_at timestamptz not null default now(),
  unique (organization_id, number),
  unique (organization_id, id),
  check (quantity_passed + quantity_rejected = quantity_inspected),
  check ((check_type = 'production' and production_order_id is not null) or (check_type = 'goods_receipt' and goods_receipt_id is not null)),
  check (result <> 'conditional' or conditional_note is not null)
);
create index quality_checks_order_idx on public.quality_checks (production_order_id);
create index quality_checks_org_idx on public.quality_checks (organization_id, inspected_at desc);
create trigger quality_checks_immutable before update or delete on public.quality_checks for each row execute function app.tg_immutable();

create table public.quality_check_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  quality_check_id uuid not null,
  template_item_id uuid references public.quality_template_items (id) on delete set null,
  name text not null,
  result text not null check (result in ('pass', 'fail', 'na')),
  value text,
  notes text,
  foreign key (organization_id, quality_check_id) references public.quality_checks (organization_id, id) on delete cascade
);

create table public.quality_defects (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  quality_check_id uuid not null,
  category text not null,
  severity text not null default 'minor' check (severity in ('minor', 'major', 'critical')),
  quantity numeric(18, 4) not null check (quantity > 0),
  description text,
  created_at timestamptz not null default now(),
  unique (organization_id, id),
  foreign key (organization_id, quality_check_id) references public.quality_checks (organization_id, id) on delete cascade
);
create index quality_defects_org_idx on public.quality_defects (organization_id, category);

create table public.corrective_actions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  quality_check_id uuid not null,
  defect_id uuid references public.quality_defects (id) on delete set null,
  description text not null,
  assigned_to uuid references public.profiles (id),
  due_date date,
  status text not null default 'open' check (status in ('open', 'in_progress', 'done', 'cancelled')),
  resolution text,
  completed_by uuid references public.profiles (id),
  completed_at timestamptz,
  created_by uuid references public.profiles (id) default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (organization_id, quality_check_id) references public.quality_checks (organization_id, id) on delete cascade
);
create index corrective_actions_open_idx on public.corrective_actions (organization_id, status);

-- RLS
alter table public.quality_templates enable row level security;
alter table public.quality_template_items enable row level security;
alter table public.quality_checks enable row level security;
alter table public.quality_check_items enable row level security;
alter table public.quality_defects enable row level security;
alter table public.corrective_actions enable row level security;
revoke all on public.quality_templates, public.quality_template_items, public.quality_checks, public.quality_check_items,
  public.quality_defects, public.corrective_actions from anon;

create policy qt_select on public.quality_templates for select to authenticated using (app.has_any(organization_id, array['quality.read', 'quality.create']));
create policy qt_write on public.quality_templates for all to authenticated
  using (app.has_permission(organization_id, 'quality.manage')) with check (app.has_permission(organization_id, 'quality.manage'));
create policy qti_select on public.quality_template_items for select to authenticated using (app.has_any(organization_id, array['quality.read', 'quality.create']));
create policy qti_write on public.quality_template_items for all to authenticated
  using (app.has_permission(organization_id, 'quality.manage')) with check (app.has_permission(organization_id, 'quality.manage'));
create policy qc_select on public.quality_checks for select to authenticated using (app.has_any(organization_id, array['quality.read', 'production_orders.read']));
create policy qci_select on public.quality_check_items for select to authenticated using (app.has_any(organization_id, array['quality.read', 'production_orders.read']));
create policy qd_select on public.quality_defects for select to authenticated using (app.has_any(organization_id, array['quality.read', 'production_orders.read']));
create policy ca_select on public.corrective_actions for select to authenticated using (
  app.has_permission(organization_id, 'quality.read') or (assigned_to = auth.uid() and app.is_member(organization_id)));
revoke insert, update, delete on public.quality_checks, public.quality_check_items, public.quality_defects, public.corrective_actions from authenticated;

create trigger quality_templates_audit after insert or update or delete on public.quality_templates for each row execute function app.tg_audit_row();
create trigger quality_templates_org_immutable before update on public.quality_templates for each row execute function app.tg_org_immutable();

-- Records an inspection with checklist results, defects and corrective actions in one transaction.
-- p: {check_type, production_order_id|goods_receipt_id, operation_id, is_final, template_id, quantity_inspected,
--     quantity_rejected, result, conditional_note, notes,
--     items: [{template_item_id, name, result, value, notes}],
--     defects: [{category, severity, quantity, description}],
--     actions: [{description, assigned_to, due_date}]}
create or replace function public.quality_check_record(p_org uuid, p jsonb) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_id uuid; v_number text; v_type text := p ->> 'check_type'; v_po public.production_orders; v_insp numeric; v_rej numeric; v_pass numeric;
  v_result text := p ->> 'result'; v_product uuid; v_final boolean := coalesce((p ->> 'is_final')::boolean, false); v_inspected_total numeric;
  v_out numeric; x jsonb; v_def uuid; v_defect_total numeric := 0;
begin
  perform app.require_permission(p_org, 'quality.create');
  v_insp := (p ->> 'quantity_inspected')::numeric;
  v_rej := coalesce(nullif(p ->> 'quantity_rejected', '')::numeric, 0);
  if v_insp is null or v_insp <= 0 then perform app.raise_rule('Enter how many units were inspected'); end if;
  if v_rej < 0 or v_rej > v_insp then perform app.raise_rule('Rejected units must be between 0 and the quantity inspected'); end if;
  v_pass := v_insp - v_rej;
  if v_result not in ('pass', 'fail', 'conditional') then perform app.raise_rule('Choose a result'); end if;
  if v_result = 'conditional' then
    perform app.require_permission(p_org, 'quality.approve');
    if coalesce(trim(p ->> 'conditional_note'), '') = '' then perform app.raise_rule('Explain the conditions of the approval'); end if;
  end if;
  if v_result = 'fail' and v_pass > 0 and v_rej = 0 then perform app.raise_rule('A failed inspection must reject at least one unit'); end if;

  if v_type = 'production' then
    select * into v_po from public.production_orders where id = (p ->> 'production_order_id')::uuid and organization_id = p_org for update;
    if v_po.id is null then raise exception 'Production order not found' using errcode = 'P0002'; end if;
    if v_po.status not in ('in_progress', 'paused', 'quality_inspection') then
      perform app.raise_rule('Inspections can be recorded while an order is in production or in quality inspection');
    end if;
    v_product := v_po.product_id;
    if v_final then
      -- Final inspections can't cover more units than came out of the last production step.
      select coalesce(sum(quantity_inspected), 0) into v_inspected_total from public.quality_checks where production_order_id = v_po.id and is_final;
      select coalesce(op.quantity_completed + op.quantity_rejected, 0) into v_out from public.production_operations op
      where op.production_order_id = v_po.id and op.status <> 'skipped' order by op.sequence desc limit 1;
      if v_inspected_total + v_insp > greatest(v_out, 0) + 0.0001 then
        perform app.raise_rule(format('Only %s units have come through production; %s are already inspected', round(v_out, 2), round(v_inspected_total, 2)));
      end if;
    end if;
  elsif v_type = 'goods_receipt' then
    if not exists (select 1 from public.goods_receipts where id = (p ->> 'goods_receipt_id')::uuid and organization_id = p_org) then
      raise exception 'Goods receipt not found' using errcode = 'P0002';
    end if;
  else
    perform app.raise_rule('Unknown inspection type');
  end if;

  v_number := app.next_doc_number(p_org, 'quality_check', 'QC-');
  insert into public.quality_checks (organization_id, number, check_type, is_final, production_order_id, operation_id, goods_receipt_id, product_id,
    template_id, quantity_inspected, quantity_passed, quantity_rejected, result, conditional_note, approved_by, notes)
  values (p_org, v_number, v_type, v_type = 'production' and v_final, nullif(p ->> 'production_order_id', '')::uuid, nullif(p ->> 'operation_id', '')::uuid,
          nullif(p ->> 'goods_receipt_id', '')::uuid, v_product, nullif(p ->> 'template_id', '')::uuid, v_insp, v_pass, v_rej, v_result,
          nullif(p ->> 'conditional_note', ''), case when v_result = 'conditional' then auth.uid() end, nullif(p ->> 'notes', ''))
  returning id into v_id;

  for x in select * from jsonb_array_elements(coalesce(p -> 'items', '[]'::jsonb)) loop
    insert into public.quality_check_items (organization_id, quality_check_id, template_item_id, name, result, value, notes)
    values (p_org, v_id, nullif(x ->> 'template_item_id', '')::uuid, x ->> 'name', coalesce(nullif(x ->> 'result', ''), 'na'), nullif(x ->> 'value', ''), nullif(x ->> 'notes', ''));
  end loop;
  for x in select * from jsonb_array_elements(coalesce(p -> 'defects', '[]'::jsonb)) loop
    if coalesce(trim(x ->> 'category'), '') = '' or coalesce((x ->> 'quantity')::numeric, 0) <= 0 then
      perform app.raise_rule('Each defect needs a category and a quantity');
    end if;
    v_defect_total := v_defect_total + (x ->> 'quantity')::numeric;
    insert into public.quality_defects (organization_id, quality_check_id, category, severity, quantity, description)
    values (p_org, v_id, trim(x ->> 'category'), coalesce(nullif(x ->> 'severity', ''), 'minor'), (x ->> 'quantity')::numeric, nullif(x ->> 'description', ''))
    returning id into v_def;
  end loop;
  if v_defect_total > v_insp then perform app.raise_rule('Defect quantities can''t exceed the units inspected'); end if;
  for x in select * from jsonb_array_elements(coalesce(p -> 'actions', '[]'::jsonb)) loop
    continue when coalesce(trim(x ->> 'description'), '') = '';
    insert into public.corrective_actions (organization_id, quality_check_id, description, assigned_to, due_date)
    values (p_org, v_id, x ->> 'description', nullif(x ->> 'assigned_to', '')::uuid, nullif(x ->> 'due_date', '')::date);
    if nullif(x ->> 'assigned_to', '') is not null then
      perform app.notify_user(p_org, (x ->> 'assigned_to')::uuid, 'corrective_action', 'warning', 'Corrective action assigned',
        x ->> 'description', '/operations/quality/' || v_id, 'quality_checks', v_id);
    end if;
  end loop;

  if v_rej > 0 then
    perform app.notify_permission(p_org, 'quality.read', 'quality_failure', case when v_result = 'fail' then 'critical' else 'warning' end,
      v_number || ': ' || round(v_rej, 2) || ' rejected', coalesce(v_po.number, 'Goods receipt'), '/operations/quality/' || v_id, 'quality_checks', v_id);
  end if;
  if v_type = 'production' then
    insert into public.production_logs (organization_id, production_order_id, operation_id, log_type, quantity_good, quantity_rejected, message, metadata)
    values (p_org, v_po.id, nullif(p ->> 'operation_id', '')::uuid, 'note', v_pass, v_rej,
            (case when v_final then 'Final inspection ' else 'Inspection ' end) || v_number || ': ' || v_result, jsonb_build_object('quality_check_id', v_id));
  end if;
  perform app.audit(p_org, 'quality_' || v_result, 'quality_checks', v_id, v_number || ' recorded', null,
    jsonb_build_object('inspected', v_insp, 'passed', v_pass, 'rejected', v_rej, 'final', v_final));
  return v_id;
end $$;

create or replace function public.corrective_action_update(p_action uuid, p_status text, p_resolution text default null) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare a public.corrective_actions;
begin
  select * into a from public.corrective_actions where id = p_action for update;
  if a.id is null then raise exception 'Corrective action not found' using errcode = 'P0002'; end if;
  if not (a.assigned_to = auth.uid() or app.has_permission(a.organization_id, 'quality.approve')) then
    raise exception 'missing permission: quality.approve' using errcode = '42501';
  end if;
  if p_status not in ('open', 'in_progress', 'done', 'cancelled') then perform app.raise_rule('Invalid status'); end if;
  if p_status = 'done' and coalesce(trim(p_resolution), '') = '' then perform app.raise_rule('Describe what was done'); end if;
  update public.corrective_actions set status = p_status, resolution = coalesce(nullif(p_resolution, ''), resolution),
    completed_by = case when p_status = 'done' then auth.uid() end, completed_at = case when p_status = 'done' then now() end, updated_at = now()
  where id = p_action;
  perform app.audit(a.organization_id, 'corrective_action_' || p_status, 'corrective_actions', p_action, p_resolution);
end $$;

-- Final-inspection totals per order (used by completion and the UI).
create or replace view public.production_inspection_totals with (security_invoker = true) as
select production_order_id, organization_id, count(*) as inspections,
       sum(quantity_inspected) as inspected, sum(quantity_passed) as passed, sum(quantity_rejected) as rejected
from public.quality_checks where check_type = 'production' and is_final
group by production_order_id, organization_id;

-- Defect analytics
create or replace function public.defect_summary(p_org uuid, p_from date, p_to date)
returns table (category text, severity text, quantity numeric, occurrences bigint)
language sql stable security definer set search_path = public, pg_temp as $$
  select d.category, d.severity, sum(d.quantity), count(*)
  from public.quality_defects d join public.quality_checks c on c.id = d.quality_check_id
  where d.organization_id = p_org and app.has_permission(p_org, 'quality.read')
    and c.inspected_at >= p_from and c.inspected_at < p_to + 1
  group by 1, 2 order by 3 desc
$$;
