-- Production orders, operations, job cards, reservations and execution records.

create table public.production_orders (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  number text not null,
  factory_id uuid not null,
  product_id uuid not null,
  variant_id uuid not null,
  bom_id uuid references public.bills_of_materials (id),
  bom_version integer,
  bom_snapshot jsonb,
  routing_id uuid references public.routing_templates (id) on delete set null,
  source text not null default 'manual' check (source in ('manual', 'customer_order', 'replenishment')),
  source_reference text,
  quantity_planned numeric(18, 4) not null check (quantity_planned > 0),
  quantity_completed numeric(18, 4) not null default 0 check (quantity_completed >= 0),
  quantity_rejected numeric(18, 4) not null default 0 check (quantity_rejected >= 0),
  priority text not null default 'normal' check (priority in ('low', 'normal', 'high', 'urgent')),
  status text not null default 'draft' check (status in (
    'draft', 'awaiting_approval', 'approved', 'materials_pending', 'ready_to_start',
    'in_progress', 'paused', 'quality_inspection', 'completed', 'cancelled')),
  planned_start_date date,
  due_date date,
  actual_start_at timestamptz,
  actual_end_at timestamptz,
  manager_id uuid references auth.users (id),
  material_warehouse_id uuid not null,
  output_warehouse_id uuid not null,
  notes text,
  cancel_reason text,
  approved_by uuid references auth.users (id),
  approved_at timestamptz,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid,
  unique (organization_id, number),
  unique (organization_id, id),
  check (due_date is null or planned_start_date is null or due_date >= planned_start_date),
  foreign key (organization_id, factory_id) references public.factories (organization_id, id),
  foreign key (organization_id, product_id) references public.products (organization_id, id),
  foreign key (organization_id, variant_id) references public.product_variants (organization_id, id),
  foreign key (organization_id, material_warehouse_id) references public.warehouses (organization_id, id),
  foreign key (organization_id, output_warehouse_id) references public.warehouses (organization_id, id)
);
create index production_orders_status_idx on public.production_orders (organization_id, status);
create index production_orders_due_idx on public.production_orders (organization_id, due_date) where status not in ('completed', 'cancelled');
create trigger production_orders_touch before update on public.production_orders for each row execute function app.tg_touch();

-- Status, quantities and BOM snapshot are owned by workflow functions.
create or replace function app.tg_production_orders_guard() returns trigger
language plpgsql as $$
begin
  if current_user = 'authenticated' and coalesce(current_setting('app.po_workflow', true), '') <> 'on' then
    if new.status is distinct from old.status or new.quantity_completed is distinct from old.quantity_completed
       or new.quantity_rejected is distinct from old.quantity_rejected or new.bom_snapshot is distinct from old.bom_snapshot
       or new.bom_id is distinct from old.bom_id or new.number is distinct from old.number
       or new.approved_by is distinct from old.approved_by then
      raise exception 'Use production workflow actions to change status, quantities or BOM' using errcode = '42501';
    end if;
    if old.status not in ('draft', 'awaiting_approval') and (
       new.quantity_planned is distinct from old.quantity_planned or new.product_id is distinct from old.product_id
       or new.variant_id is distinct from old.variant_id or new.material_warehouse_id is distinct from old.material_warehouse_id
       or new.factory_id is distinct from old.factory_id) then
      raise exception 'Product, quantity, factory and warehouse are locked once an order is approved' using errcode = 'P0001';
    end if;
  end if;
  return new;
end $$;
create trigger production_orders_guard before update on public.production_orders
  for each row execute function app.tg_production_orders_guard();

create table public.production_order_status_history (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  production_order_id uuid not null references public.production_orders (id) on delete cascade,
  from_status text,
  to_status text not null,
  note text,
  changed_by uuid references auth.users (id) default auth.uid(),
  changed_at timestamptz not null default now()
);
create index po_status_history_idx on public.production_order_status_history (production_order_id, changed_at);
create trigger po_status_history_immutable before update or delete on public.production_order_status_history
  for each row execute function app.tg_immutable();

-- Material requirement snapshot taken from the BOM at order creation.
create table public.production_order_materials (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  production_order_id uuid not null references public.production_orders (id) on delete cascade,
  line_no integer not null,
  bom_item_id uuid references public.bom_items (id) on delete set null,
  stock_item_id uuid not null,
  quantity_per_unit numeric(18, 6) not null check (quantity_per_unit > 0),
  wastage_pct numeric(6, 3) not null default 0,
  quantity_required numeric(18, 4) not null check (quantity_required > 0),
  quantity_reserved numeric(18, 4) not null default 0 check (quantity_reserved >= 0),
  quantity_issued numeric(18, 4) not null default 0 check (quantity_issued >= 0),
  quantity_returned numeric(18, 4) not null default 0 check (quantity_returned >= 0),
  quantity_wasted numeric(18, 4) not null default 0 check (quantity_wasted >= 0),
  issued_cost numeric(18, 4) not null default 0,
  returned_cost numeric(18, 4) not null default 0,
  estimated_unit_cost numeric(18, 6) not null default 0,
  unique (production_order_id, line_no),
  unique (production_order_id, stock_item_id),
  check (quantity_returned <= quantity_issued),
  foreign key (organization_id, stock_item_id) references public.stock_items (organization_id, id)
);

create table public.material_reservations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  production_order_id uuid not null references public.production_orders (id) on delete cascade,
  production_order_material_id uuid not null references public.production_order_materials (id) on delete cascade,
  stock_item_id uuid not null,
  warehouse_id uuid not null,
  quantity numeric(18, 4) not null check (quantity >= 0),
  status text not null default 'active' check (status in ('active', 'released', 'fulfilled')),
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (production_order_material_id, warehouse_id),
  foreign key (organization_id, stock_item_id) references public.stock_items (organization_id, id),
  foreign key (organization_id, warehouse_id) references public.warehouses (organization_id, id)
);
create index material_reservations_item_idx on public.material_reservations (stock_item_id, warehouse_id) where status = 'active';

create table public.production_operations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  production_order_id uuid not null references public.production_orders (id) on delete cascade,
  sequence integer not null,
  stage_id uuid not null,
  work_centre_id uuid references public.work_centres (id) on delete set null,
  name text not null,
  instructions text,
  requires_quality_check boolean not null default false,
  standard_minutes_per_unit numeric(12, 2),
  status text not null default 'pending' check (status in ('pending', 'in_progress', 'paused', 'completed', 'skipped')),
  quantity_completed numeric(18, 4) not null default 0 check (quantity_completed >= 0),
  quantity_rejected numeric(18, 4) not null default 0 check (quantity_rejected >= 0),
  planned_start timestamptz,
  planned_end timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (production_order_id, sequence),
  unique (organization_id, id),
  foreign key (organization_id, stage_id) references public.production_stages (organization_id, id)
);
create index production_operations_stage_idx on public.production_operations (organization_id, stage_id, status);

create table public.job_cards (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  code text not null,
  production_order_id uuid not null references public.production_orders (id) on delete cascade,
  operation_id uuid not null,
  assigned_user_id uuid references auth.users (id),
  assigned_team text,
  target_quantity numeric(18, 4) not null check (target_quantity > 0),
  quantity_completed numeric(18, 4) not null default 0 check (quantity_completed >= 0),
  quantity_rejected numeric(18, 4) not null default 0 check (quantity_rejected >= 0),
  status text not null default 'open' check (status in ('open', 'in_progress', 'paused', 'completed', 'cancelled')),
  instructions text,
  issued_by uuid references auth.users (id) default auth.uid(),
  issued_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (organization_id, code),
  check (assigned_user_id is not null or assigned_team is not null),
  foreign key (organization_id, operation_id) references public.production_operations (organization_id, id) on delete cascade
);
create index job_cards_assignee_idx on public.job_cards (assigned_user_id, status);
create index job_cards_order_idx on public.job_cards (production_order_id);

create table public.production_logs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  production_order_id uuid not null references public.production_orders (id) on delete cascade,
  operation_id uuid references public.production_operations (id) on delete set null,
  job_card_id uuid references public.job_cards (id) on delete set null,
  log_type text not null check (log_type in (
    'progress', 'note', 'defect', 'shortage', 'downtime', 'start', 'pause', 'resume', 'complete',
    'material_issue', 'material_return', 'wastage', 'transfer', 'output', 'status')),
  quantity_good numeric(18, 4) check (quantity_good is null or quantity_good >= 0),
  quantity_rejected numeric(18, 4) check (quantity_rejected is null or quantity_rejected >= 0),
  message text,
  metadata jsonb not null default '{}'::jsonb,
  client_ref text,
  occurred_at timestamptz not null default now(),
  created_by uuid references auth.users (id) default auth.uid(),
  created_at timestamptz not null default now()
);
create unique index production_logs_client_ref on public.production_logs (organization_id, client_ref) where client_ref is not null;
create index production_logs_order_idx on public.production_logs (production_order_id, occurred_at desc);
create index production_logs_org_time_idx on public.production_logs (organization_id, occurred_at desc);
create trigger production_logs_immutable before update or delete on public.production_logs
  for each row execute function app.tg_immutable();

create table public.downtime_logs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  production_order_id uuid references public.production_orders (id) on delete cascade,
  operation_id uuid references public.production_operations (id) on delete set null,
  work_centre_id uuid references public.work_centres (id) on delete set null,
  reason text not null,
  minutes integer not null check (minutes > 0 and minutes <= 1440 * 7),
  started_at timestamptz not null default now(),
  created_by uuid references auth.users (id) default auth.uid(),
  created_at timestamptz not null default now()
);
create index downtime_logs_org_idx on public.downtime_logs (organization_id, started_at desc);

-- Recorded material wastage (material was already issued; this classifies it).
create table public.production_scrap (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  production_order_id uuid not null references public.production_orders (id) on delete cascade,
  production_order_material_id uuid references public.production_order_materials (id) on delete set null,
  operation_id uuid references public.production_operations (id) on delete set null,
  stock_item_id uuid references public.stock_items (id),
  quantity numeric(18, 4) not null check (quantity > 0),
  reason text not null,
  created_by uuid references auth.users (id) default auth.uid(),
  created_at timestamptz not null default now()
);
create index production_scrap_order_idx on public.production_scrap (production_order_id);

create table public.production_outputs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  production_order_id uuid not null references public.production_orders (id) on delete cascade,
  quantity_good numeric(18, 4) not null check (quantity_good >= 0),
  quantity_rejected numeric(18, 4) not null default 0 check (quantity_rejected >= 0),
  warehouse_id uuid not null,
  unit_cost numeric(18, 6) not null default 0,
  material_cost numeric(18, 4) not null default 0,
  inventory_transaction_id uuid references public.inventory_transactions (id),
  recorded_by uuid references auth.users (id) default auth.uid(),
  recorded_at timestamptz not null default now(),
  check (quantity_good + quantity_rejected > 0),
  foreign key (organization_id, warehouse_id) references public.warehouses (organization_id, id)
);
create index production_outputs_org_idx on public.production_outputs (organization_id, recorded_at desc);
create trigger production_outputs_immutable before update or delete on public.production_outputs
  for each row execute function app.tg_immutable();
