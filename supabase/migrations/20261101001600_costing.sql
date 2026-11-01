-- Product costing: total manufacturing cost = material + direct labour + machine + allocated overhead + other.
-- Cost per good unit uses ACCEPTED output. Estimates and actuals are kept separate.

create table public.cost_rates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  kind text not null check (kind in ('labour', 'overhead')),
  name text not null,
  basis text not null check (basis in ('per_hour', 'per_unit', 'percent_material', 'per_order')),
  rate numeric(18, 4) not null check (rate >= 0),
  is_default boolean not null default true,
  is_active boolean not null default true,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid,
  unique (organization_id, name),
  check (kind <> 'labour' or basis = 'per_hour'),
  check (basis <> 'percent_material' or rate <= 500)
);
create unique index cost_rates_one_default_labour on public.cost_rates (organization_id) where kind = 'labour' and is_default and is_active;
create trigger cost_rates_touch before update on public.cost_rates for each row execute function app.tg_touch();
create trigger cost_rates_audit after insert or update or delete on public.cost_rates for each row execute function app.tg_audit_row();
create trigger cost_rates_org_immutable before update on public.cost_rates for each row execute function app.tg_org_immutable();

create table public.labour_cost_entries (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  production_order_id uuid not null references public.production_orders (id) on delete cascade,
  operation_id uuid references public.production_operations (id) on delete set null,
  entry_type text not null default 'labour' check (entry_type in ('labour', 'machine')),
  worker_id uuid references public.profiles (id) on delete set null,
  worker_name text,
  work_centre_id uuid references public.work_centres (id) on delete set null,
  hours numeric(12, 2) not null check (hours > 0 and hours <= 10000),
  rate numeric(18, 4) not null check (rate >= 0),
  amount numeric(18, 2) generated always as (round(hours * rate, 2)) stored,
  entry_date date not null default current_date,
  notes text,
  created_by uuid references public.profiles (id) default auth.uid(),
  created_at timestamptz not null default now()
);
create index labour_cost_entries_order_idx on public.labour_cost_entries (production_order_id);

create table public.overhead_cost_entries (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  production_order_id uuid not null references public.production_orders (id) on delete cascade,
  category text not null default 'overhead' check (category in ('overhead', 'packaging', 'utilities', 'transport', 'other')),
  description text not null,
  amount numeric(18, 2) not null check (amount >= 0),
  is_allocated boolean not null default false,
  cost_rate_id uuid references public.cost_rates (id) on delete set null,
  created_by uuid references public.profiles (id) default auth.uid(),
  created_at timestamptz not null default now()
);
create index overhead_cost_entries_order_idx on public.overhead_cost_entries (production_order_id);

create table public.production_cost_snapshots (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  production_order_id uuid not null unique references public.production_orders (id) on delete cascade,
  product_id uuid not null references public.products (id),
  quantity_planned numeric(18, 4) not null,
  quantity_accepted numeric(18, 4) not null,
  quantity_rejected numeric(18, 4) not null,
  material_cost numeric(18, 2) not null,
  labour_cost numeric(18, 2) not null,
  machine_cost numeric(18, 2) not null,
  overhead_cost numeric(18, 2) not null,
  other_cost numeric(18, 2) not null,
  total_cost numeric(18, 2) not null,
  unit_cost numeric(18, 6) not null,
  estimated_total numeric(18, 2) not null,
  estimated_unit_cost numeric(18, 6) not null,
  selling_price numeric(18, 4),
  created_at timestamptz not null default now()
);
create index production_cost_snapshots_product_idx on public.production_cost_snapshots (product_id, created_at desc);
create trigger production_cost_snapshots_immutable before update or delete on public.production_cost_snapshots
  for each row execute function app.tg_immutable();

-- product_cost_snapshots: saved standard-cost estimates for a product (history of what a unit "should" cost)
create table public.product_cost_snapshots (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  product_id uuid not null references public.products (id) on delete cascade,
  bom_id uuid references public.bills_of_materials (id) on delete set null,
  material_cost numeric(18, 4) not null,
  labour_cost numeric(18, 4) not null,
  machine_cost numeric(18, 4) not null,
  overhead_cost numeric(18, 4) not null,
  total_cost numeric(18, 4) not null,
  selling_price numeric(18, 4),
  breakdown jsonb not null default '{}'::jsonb,
  created_by uuid references public.profiles (id) default auth.uid(),
  created_at timestamptz not null default now()
);
create index product_cost_snapshots_product_idx on public.product_cost_snapshots (product_id, created_at desc);

alter table public.cost_rates enable row level security;
alter table public.labour_cost_entries enable row level security;
alter table public.overhead_cost_entries enable row level security;
alter table public.production_cost_snapshots enable row level security;
alter table public.product_cost_snapshots enable row level security;
revoke all on public.cost_rates, public.labour_cost_entries, public.overhead_cost_entries, public.production_cost_snapshots, public.product_cost_snapshots from anon;
create policy cost_rates_select on public.cost_rates for select to authenticated using (app.has_any(organization_id, array['costing.read', 'costing.manage']));
create policy cost_rates_write on public.cost_rates for all to authenticated
  using (app.has_permission(organization_id, 'costing.manage')) with check (app.has_permission(organization_id, 'costing.manage'));
create policy labour_select on public.labour_cost_entries for select to authenticated using (app.has_any(organization_id, array['costing.read', 'costing.manage']));
create policy overhead_select on public.overhead_cost_entries for select to authenticated using (app.has_any(organization_id, array['costing.read', 'costing.manage']));
create policy pcs_select on public.production_cost_snapshots for select to authenticated using (app.has_permission(organization_id, 'costing.read'));
create policy prodcs_select on public.product_cost_snapshots for select to authenticated using (app.has_permission(organization_id, 'costing.read'));
revoke insert, update, delete on public.labour_cost_entries, public.overhead_cost_entries, public.production_cost_snapshots, public.product_cost_snapshots from authenticated;

-- Entries -----------------------------------------------------------------------------
create or replace function public.cost_entry_add(p_order uuid, p jsonb) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare o public.production_orders; v_id uuid; v_type text := coalesce(nullif(p ->> 'entry_type', ''), 'labour'); v_rate numeric; v_wc uuid;
begin
  select * into o from public.production_orders where id = p_order for update;
  if o.id is null then raise exception 'Order not found' using errcode = 'P0002'; end if;
  perform app.require_permission(o.organization_id, 'costing.manage');
  if o.status in ('draft', 'awaiting_approval', 'completed', 'cancelled') then
    perform app.raise_rule('Costs can be recorded on approved orders that are not yet completed');
  end if;
  if v_type = 'overhead' then
    if coalesce(trim(p ->> 'description'), '') = '' then perform app.raise_rule('Describe the cost'); end if;
    if coalesce((p ->> 'amount')::numeric, -1) < 0 then perform app.raise_rule('Enter an amount'); end if;
    insert into public.overhead_cost_entries (organization_id, production_order_id, category, description, amount)
    values (o.organization_id, p_order, coalesce(nullif(p ->> 'category', ''), 'overhead'), p ->> 'description', (p ->> 'amount')::numeric)
    returning id into v_id;
  else
    v_wc := nullif(p ->> 'work_centre_id', '')::uuid;
    v_rate := nullif(p ->> 'rate', '')::numeric;
    if v_rate is null then
      if v_type = 'machine' then
        select hourly_cost into v_rate from public.work_centres where id = v_wc and organization_id = o.organization_id;
      else
        select rate into v_rate from public.cost_rates where organization_id = o.organization_id and kind = 'labour' and is_default and is_active;
      end if;
    end if;
    if v_rate is null then perform app.raise_rule(case when v_type = 'machine' then 'Set an hourly cost on the work centre or enter a rate' else 'Set a default labour rate or enter a rate' end); end if;
    insert into public.labour_cost_entries (organization_id, production_order_id, operation_id, entry_type, worker_id, worker_name, work_centre_id, hours, rate, entry_date, notes)
    values (o.organization_id, p_order, nullif(p ->> 'operation_id', '')::uuid, v_type, nullif(p ->> 'worker_id', '')::uuid, nullif(p ->> 'worker_name', ''),
            v_wc, (p ->> 'hours')::numeric, v_rate, coalesce(nullif(p ->> 'entry_date', '')::date, current_date), nullif(p ->> 'notes', ''))
    returning id into v_id;
  end if;
  perform app.audit(o.organization_id, 'cost_entry', 'production_orders', p_order, 'Cost recorded (' || v_type || ')', null, p);
  return v_id;
end $$;

create or replace function public.cost_entry_remove(p_entry uuid, p_kind text) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_order uuid; v_org uuid; v_status text; v_old jsonb;
begin
  if p_kind = 'overhead' then
    select production_order_id, organization_id, to_jsonb(e) into v_order, v_org, v_old from public.overhead_cost_entries e where id = p_entry and not is_allocated;
  else
    select production_order_id, organization_id, to_jsonb(e) into v_order, v_org, v_old from public.labour_cost_entries e where id = p_entry;
  end if;
  if v_order is null then raise exception 'Entry not found' using errcode = 'P0002'; end if;
  perform app.require_permission(v_org, 'costing.manage');
  select status into v_status from public.production_orders where id = v_order;
  if v_status in ('completed', 'cancelled') then perform app.raise_rule('Costs on completed orders are final'); end if;
  if p_kind = 'overhead' then delete from public.overhead_cost_entries where id = p_entry; else delete from public.labour_cost_entries where id = p_entry; end if;
  perform app.audit(v_org, 'cost_entry_removed', 'production_orders', v_order, 'Cost entry removed', v_old, null);
end $$;

-- Estimate & actual -------------------------------------------------------------------
-- Overhead allocation from default rates on a given base.
create or replace function app.allocate_overhead(p_org uuid, p_material numeric, p_units numeric, p_hours numeric)
returns table (rate_id uuid, name text, amount numeric)
language sql stable security definer set search_path = public, pg_temp as $$
  select id, name, round(case basis
      when 'percent_material' then p_material * rate / 100
      when 'per_unit' then p_units * rate
      when 'per_hour' then p_hours * rate
      when 'per_order' then rate end, 2)
  from public.cost_rates where organization_id = p_org and kind = 'overhead' and is_default and is_active
$$;

create or replace function public.production_cost_summary(p_order uuid) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  o public.production_orders; v_lab_rate numeric; v_std_min numeric; e_mat numeric; e_lab_h numeric; e_lab numeric; e_mach numeric; e_ovh numeric;
  a_mat numeric; a_lab numeric; a_lab_h numeric; a_mach numeric; a_ovh_manual numeric; a_other numeric; a_alloc numeric; snap public.production_cost_snapshots;
  v_price numeric; v_units numeric; v_good numeric;
begin
  select * into o from public.production_orders where id = p_order;
  if o.id is null then return null; end if;
  if not app.has_permission(o.organization_id, 'costing.read') then raise exception 'missing permission: costing.read' using errcode = '42501'; end if;
  select rate into v_lab_rate from public.cost_rates where organization_id = o.organization_id and kind = 'labour' and is_default and is_active;
  select standard_minutes_per_unit, selling_price into v_std_min, v_price from public.products where id = o.product_id;
  select coalesce(v.selling_price, v_price) into v_price from public.product_variants v where v.id = o.variant_id;

  -- ESTIMATE (from BOM snapshot, standard minutes and default rates)
  select coalesce(sum(quantity_required * estimated_unit_cost), 0) into e_mat from public.production_order_materials where production_order_id = p_order;
  select coalesce(sum(coalesce(op.standard_minutes_per_unit, 0) * o.quantity_planned / 60), 0),
         coalesce(sum(coalesce(op.standard_minutes_per_unit, 0) * o.quantity_planned / 60 * coalesce(w.hourly_cost, 0)), 0)
    into e_lab_h, e_mach
  from public.production_operations op left join public.work_centres w on w.id = op.work_centre_id
  where op.production_order_id = p_order and op.status <> 'skipped';
  if e_lab_h = 0 and coalesce(v_std_min, 0) > 0 then e_lab_h := v_std_min * o.quantity_planned / 60; end if;
  e_lab := round(e_lab_h * coalesce(v_lab_rate, 0), 2);
  select coalesce(sum(amount), 0) into e_ovh from app.allocate_overhead(o.organization_id, e_mat, o.quantity_planned, e_lab_h);

  -- ACTUAL
  select coalesce(sum(issued_cost - returned_cost), 0) into a_mat from public.production_order_materials where production_order_id = p_order;
  select coalesce(sum(amount) filter (where entry_type = 'labour'), 0), coalesce(sum(hours) filter (where entry_type = 'labour'), 0),
         coalesce(sum(amount) filter (where entry_type = 'machine'), 0)
    into a_lab, a_lab_h, a_mach from public.labour_cost_entries where production_order_id = p_order;
  select coalesce(sum(amount) filter (where category in ('overhead', 'utilities') and not is_allocated), 0),
         coalesce(sum(amount) filter (where category in ('packaging', 'transport', 'other')), 0),
         coalesce(sum(amount) filter (where is_allocated), 0)
    into a_ovh_manual, a_other, a_alloc from public.overhead_cost_entries where production_order_id = p_order;
  select * into snap from public.production_cost_snapshots where production_order_id = p_order;
  if snap.id is null then
    v_units := o.quantity_completed + o.quantity_rejected;
    if v_units = 0 then
      select coalesce(op.quantity_completed + op.quantity_rejected, 0) into v_units from public.production_operations op
      where op.production_order_id = p_order and op.status <> 'skipped' order by op.sequence desc limit 1;
    end if;
    select coalesce(sum(amount), 0) into a_alloc from app.allocate_overhead(o.organization_id, a_mat, coalesce(v_units, 0), a_lab_h);
  end if;
  v_good := case when snap.id is not null then snap.quantity_accepted else nullif(o.quantity_completed, 0) end;

  return jsonb_build_object(
    'status', o.status, 'final', snap.id is not null, 'selling_price', v_price,
    'quantity_planned', o.quantity_planned, 'quantity_accepted', o.quantity_completed, 'quantity_rejected', o.quantity_rejected,
    'labour_rate', v_lab_rate,
    'estimate', jsonb_build_object('material', round(e_mat, 2), 'labour', e_lab, 'labour_hours', round(e_lab_h, 2), 'machine', round(e_mach, 2),
       'overhead', e_ovh, 'other', 0, 'total', round(e_mat + e_lab + e_mach + e_ovh, 2),
       'unit_cost', round((e_mat + e_lab + e_mach + e_ovh) / o.quantity_planned, 4)),
    'actual', jsonb_build_object('material', round(coalesce(snap.material_cost, a_mat), 2), 'labour', coalesce(snap.labour_cost, a_lab), 'labour_hours', a_lab_h,
       'machine', coalesce(snap.machine_cost, a_mach), 'overhead', coalesce(snap.overhead_cost, a_ovh_manual + a_alloc), 'allocated_overhead', a_alloc,
       'other', coalesce(snap.other_cost, a_other),
       'total', coalesce(snap.total_cost, round(a_mat + a_lab + a_mach + a_ovh_manual + a_alloc + a_other, 2)),
       'unit_cost', case when v_good > 0 then round(coalesce(snap.total_cost, a_mat + a_lab + a_mach + a_ovh_manual + a_alloc + a_other) / v_good, 4) end),
    'labour_entries', (select coalesce(jsonb_agg(jsonb_build_object('id', l.id, 'type', l.entry_type, 'hours', l.hours, 'rate', l.rate, 'amount', l.amount,
        'worker', coalesce(l.worker_name, p.full_name), 'operation', op.name, 'work_centre', w.name, 'date', l.entry_date, 'notes', l.notes) order by l.created_at), '[]'::jsonb)
       from public.labour_cost_entries l left join public.profiles p on p.id = l.worker_id
       left join public.production_operations op on op.id = l.operation_id left join public.work_centres w on w.id = l.work_centre_id
       where l.production_order_id = p_order),
    'overhead_entries', (select coalesce(jsonb_agg(jsonb_build_object('id', e.id, 'category', e.category, 'description', e.description, 'amount', e.amount,
        'allocated', e.is_allocated) order by e.created_at), '[]'::jsonb) from public.overhead_cost_entries e where e.production_order_id = p_order)
  );
end $$;

-- Standard cost estimate for one unit of a product (approved BOM + routing minutes + default rates).
create or replace function public.product_cost_estimate(p_product uuid, p_save boolean default false) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  p public.products; b public.bills_of_materials; v_mat numeric := 0; v_lab_rate numeric; v_min numeric; v_mach numeric := 0; v_lab numeric; v_ovh numeric;
  v_routing uuid; v_lines jsonb; v_out jsonb;
begin
  select * into p from public.products where id = p_product;
  if p.id is null then raise exception 'Product not found' using errcode = 'P0002'; end if;
  if not app.has_permission(p.organization_id, 'costing.read') then raise exception 'missing permission: costing.read' using errcode = '42501'; end if;
  select * into b from public.bills_of_materials where product_id = p_product and status = 'approved' and variant_id is null limit 1;
  if b.id is null then select * into b from public.bills_of_materials where product_id = p_product and status = 'approved' limit 1; end if;
  if b.id is not null then
    select coalesce(sum(bi.quantity * (1 + bi.wastage_pct / 100) * app.estimated_unit_cost(bi.stock_item_id)), 0) / b.output_quantity,
           jsonb_agg(jsonb_build_object('name', d.name, 'qty', round(bi.quantity * (1 + bi.wastage_pct / 100) / b.output_quantity, 4), 'uom', d.uom_code,
             'unit_cost', round(app.estimated_unit_cost(bi.stock_item_id), 4),
             'cost', round(bi.quantity * (1 + bi.wastage_pct / 100) * app.estimated_unit_cost(bi.stock_item_id) / b.output_quantity, 4)) order by bi.line_no)
      into v_mat, v_lines
    from public.bom_items bi join public.stock_item_details d on d.id = bi.stock_item_id where bi.bom_id = b.id;
  end if;
  select rate into v_lab_rate from public.cost_rates where organization_id = p.organization_id and kind = 'labour' and is_default and is_active;
  v_routing := coalesce(
    (select id from public.routing_templates where organization_id = p.organization_id and product_id = p_product and is_active limit 1),
    (select id from public.routing_templates where organization_id = p.organization_id and is_default));
  select coalesce(sum(rs.standard_minutes_per_unit), 0), coalesce(sum(coalesce(rs.standard_minutes_per_unit, 0) / 60 * coalesce(w.hourly_cost, 0)), 0)
    into v_min, v_mach
  from public.routing_steps rs left join public.work_centres w on w.id = rs.work_centre_id where rs.routing_id = v_routing;
  if v_min = 0 then v_min := coalesce(p.standard_minutes_per_unit, 0); end if;
  v_lab := round(v_min / 60 * coalesce(v_lab_rate, 0), 4);
  select coalesce(sum(case basis when 'percent_material' then v_mat * rate / 100 when 'per_unit' then rate when 'per_hour' then v_min / 60 * rate else 0 end), 0)
    into v_ovh from public.cost_rates where organization_id = p.organization_id and kind = 'overhead' and is_default and is_active;
  v_out := jsonb_build_object('product_id', p.id, 'bom_id', b.id, 'bom_version', b.version, 'material', round(v_mat, 4), 'labour', v_lab,
    'labour_minutes', v_min, 'machine', round(v_mach, 4), 'overhead', round(v_ovh, 4), 'total', round(v_mat + v_lab + v_mach + v_ovh, 4),
    'selling_price', p.selling_price, 'target_cost', p.target_cost, 'labour_rate', v_lab_rate, 'lines', coalesce(v_lines, '[]'::jsonb),
    'note', case when v_lab_rate is null then 'No default labour rate set' when b.id is null then 'No approved BOM' end);
  if p_save then
    perform app.require_permission(p.organization_id, 'costing.manage');
    insert into public.product_cost_snapshots (organization_id, product_id, bom_id, material_cost, labour_cost, machine_cost, overhead_cost, total_cost, selling_price, breakdown)
    values (p.organization_id, p.id, b.id, round(v_mat, 4), v_lab, round(v_mach, 4), round(v_ovh, 4), round(v_mat + v_lab + v_mach + v_ovh, 4), p.selling_price, v_out);
  end if;
  return v_out;
end $$;

-- Completion (replaces the phase-1 version): inspection gate + full actual costing ---------------
create or replace function public.production_order_complete(
  p_order uuid, p_good numeric, p_rejected numeric, p_note text default null,
  p_allow_material_exception boolean default false, p_idem text default null
) returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare
  o public.production_orders; m record; v_item uuid; v_txn public.inventory_transactions; v_out uuid;
  v_total_units numeric := coalesce(p_good, 0) + coalesce(p_rejected, 0);
  v_require_qc boolean; v_passed numeric; v_inspections int;
  a_mat numeric; a_lab numeric; a_lab_h numeric; a_mach numeric; a_ovh numeric; a_other numeric; a_alloc numeric := 0; v_total numeric; v_unit numeric;
  al record; v_summary jsonb; v_price numeric;
begin
  select * into o from public.production_orders where id = p_order for update;
  if o.id is null then raise exception 'Order not found' using errcode = 'P0002'; end if;
  perform app.require_permission(o.organization_id, 'production_orders.manage');
  if p_idem is not null then
    select id into v_out from public.production_outputs where production_order_id = p_order limit 1;
    if v_out is not null then return v_out; end if;
  end if;
  if o.status not in ('in_progress', 'quality_inspection') then perform app.raise_rule('Only orders in progress or in quality inspection can be completed'); end if;
  if coalesce(p_good, 0) < 0 or coalesce(p_rejected, 0) < 0 or v_total_units = 0 then perform app.raise_rule('Enter the accepted and rejected quantities'); end if;

  -- Quality gate: accepted output can't exceed what passed final inspection.
  select require_final_inspection into v_require_qc from public.organization_settings where organization_id = o.organization_id;
  select count(*), coalesce(sum(quantity_passed), 0) into v_inspections, v_passed from public.quality_checks where production_order_id = p_order and is_final;
  if v_require_qc and v_inspections = 0 then perform app.raise_rule('A final quality inspection is required before completing this order'); end if;
  if v_inspections > 0 and p_good > v_passed + 0.0001 then
    perform app.raise_rule(format('Only %s units passed final inspection, so at most %s can be accepted into stock', round(v_passed, 2), round(v_passed, 2)));
  end if;

  for m in select x.*, d.name from public.production_order_materials x join public.stock_item_details d on d.id = x.stock_item_id where x.production_order_id = p_order loop
    if v_total_units * m.quantity_per_unit > (m.quantity_issued - m.quantity_returned) + 0.0001 and not p_allow_material_exception then
      perform app.raise_rule(format('Output of %s units needs %s of %s but only %s was issued. Issue the material, or record an approved exception.',
        round(v_total_units, 2), round(v_total_units * m.quantity_per_unit, 2), m.name, round(m.quantity_issued - m.quantity_returned, 2)));
    end if;
  end loop;
  if p_allow_material_exception then
    perform app.require_permission(o.organization_id, 'production_orders.approve');
    if coalesce(trim(p_note), '') = '' then perform app.raise_rule('A note is required for a material exception'); end if;
    perform app.audit(o.organization_id, 'material_exception', 'production_orders', p_order, p_note);
  end if;

  -- Actual costs
  select coalesce(sum(issued_cost - returned_cost), 0) into a_mat from public.production_order_materials where production_order_id = p_order;
  select coalesce(sum(amount) filter (where entry_type = 'labour'), 0), coalesce(sum(hours) filter (where entry_type = 'labour'), 0),
         coalesce(sum(amount) filter (where entry_type = 'machine'), 0)
    into a_lab, a_lab_h, a_mach from public.labour_cost_entries where production_order_id = p_order;
  for al in select * from app.allocate_overhead(o.organization_id, a_mat, v_total_units, a_lab_h) loop
    if al.amount > 0 then
      insert into public.overhead_cost_entries (organization_id, production_order_id, category, description, amount, is_allocated, cost_rate_id)
      values (o.organization_id, p_order, 'overhead', 'Allocated: ' || al.name, al.amount, true, al.rate_id);
      a_alloc := a_alloc + al.amount;
    end if;
  end loop;
  select coalesce(sum(amount) filter (where category in ('overhead', 'utilities')), 0), coalesce(sum(amount) filter (where category in ('packaging', 'transport', 'other')), 0)
    into a_ovh, a_other from public.overhead_cost_entries where production_order_id = p_order;
  v_total := round(a_mat + a_lab + a_mach + a_ovh + a_other, 2);
  v_unit := case when coalesce(p_good, 0) > 0 then v_total / p_good else 0 end;
  select id into v_item from public.stock_items where product_variant_id = o.variant_id;

  if coalesce(p_good, 0) > 0 then
    v_txn := app.post_inventory_txn(o.organization_id, v_item, o.output_warehouse_id, 'finished_goods_receipt', p_good, v_unit,
      'given', 'none', false, 'production_order', p_order, p_order, null, null, null, 'Output of ' || o.number, p_note,
      case when p_idem is null then null else p_idem || ':fg' end);
  end if;
  insert into public.production_outputs (organization_id, production_order_id, quantity_good, quantity_rejected, warehouse_id, unit_cost, material_cost, inventory_transaction_id)
  values (o.organization_id, p_order, coalesce(p_good, 0), coalesce(p_rejected, 0), o.output_warehouse_id, round(v_unit, 6), a_mat, v_txn.id)
  returning id into v_out;

  perform app.release_reservations(p_order);
  update public.job_cards set status = 'completed', completed_at = coalesce(completed_at, now()), updated_at = now()
  where production_order_id = p_order and status not in ('completed', 'cancelled');
  perform set_config('app.po_workflow', 'on', true);
  update public.production_orders set quantity_completed = coalesce(p_good, 0), quantity_rejected = coalesce(p_rejected, 0) where id = p_order;
  perform set_config('app.po_workflow', '', true);

  -- estimate for the snapshot (computed with the user's context, so permission checks pass for costing readers)
  v_summary := public.production_cost_summary_internal(p_order);
  select coalesce(v.selling_price, p.selling_price) into v_price from public.product_variants v join public.products p on p.id = v.product_id where v.id = o.variant_id;
  insert into public.production_cost_snapshots (organization_id, production_order_id, product_id, quantity_planned, quantity_accepted, quantity_rejected,
    material_cost, labour_cost, machine_cost, overhead_cost, other_cost, total_cost, unit_cost, estimated_total, estimated_unit_cost, selling_price)
  values (o.organization_id, p_order, o.product_id, o.quantity_planned, coalesce(p_good, 0), coalesce(p_rejected, 0), round(a_mat, 2), a_lab, a_mach, a_ovh, a_other,
          v_total, round(v_unit, 6), (v_summary ->> 'total')::numeric, (v_summary ->> 'unit_cost')::numeric, v_price);

  insert into public.production_logs (organization_id, production_order_id, log_type, quantity_good, quantity_rejected, message)
  values (o.organization_id, p_order, 'output', coalesce(p_good, 0), coalesce(p_rejected, 0), coalesce(p_note, 'Final output recorded'));
  perform app.po_set(p_order, 'completed', format('Completed: %s accepted, %s rejected', trim_scale(coalesce(p_good, 0)), trim_scale(coalesce(p_rejected, 0))));
  perform app.audit(o.organization_id, 'complete', 'production_orders', p_order, 'Production order ' || o.number || ' completed', null,
    jsonb_build_object('good', p_good, 'rejected', p_rejected, 'material', a_mat, 'labour', a_lab, 'machine', a_mach, 'overhead', a_ovh, 'other', a_other, 'total', v_total, 'unit_cost', v_unit));
  if o.manager_id is not null then
    perform app.notify_user(o.organization_id, o.manager_id, 'order_completed', 'success', o.number || ' completed',
      trim_scale(coalesce(p_good, 0)) || ' accepted units added to stock', '/operations/production-orders/' || p_order, 'production_orders', p_order);
  end if;
  return v_out;
end $$;

-- Estimate only, without permission checks: used internally when snapshotting at completion.
create or replace function public.production_cost_summary_internal(p_order uuid) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare o public.production_orders; v_lab_rate numeric; v_std_min numeric; e_mat numeric; e_lab_h numeric; e_mach numeric; e_ovh numeric; e_lab numeric;
begin
  select * into o from public.production_orders where id = p_order;
  select rate into v_lab_rate from public.cost_rates where organization_id = o.organization_id and kind = 'labour' and is_default and is_active;
  select standard_minutes_per_unit into v_std_min from public.products where id = o.product_id;
  select coalesce(sum(quantity_required * estimated_unit_cost), 0) into e_mat from public.production_order_materials where production_order_id = p_order;
  select coalesce(sum(coalesce(op.standard_minutes_per_unit, 0) * o.quantity_planned / 60), 0),
         coalesce(sum(coalesce(op.standard_minutes_per_unit, 0) * o.quantity_planned / 60 * coalesce(w.hourly_cost, 0)), 0)
    into e_lab_h, e_mach
  from public.production_operations op left join public.work_centres w on w.id = op.work_centre_id where op.production_order_id = p_order and op.status <> 'skipped';
  if e_lab_h = 0 and coalesce(v_std_min, 0) > 0 then e_lab_h := v_std_min * o.quantity_planned / 60; end if;
  e_lab := round(e_lab_h * coalesce(v_lab_rate, 0), 2);
  select coalesce(sum(amount), 0) into e_ovh from app.allocate_overhead(o.organization_id, e_mat, o.quantity_planned, e_lab_h);
  return jsonb_build_object('total', round(e_mat + e_lab + e_mach + e_ovh, 2), 'unit_cost', round((e_mat + e_lab + e_mach + e_ovh) / o.quantity_planned, 6));
end $$;
revoke execute on function public.production_cost_summary_internal(uuid) from public, anon, authenticated;
