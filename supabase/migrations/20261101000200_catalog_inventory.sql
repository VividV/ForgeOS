-- Product catalogue, materials, BOM, routing and the inventory ledger.
create extension if not exists pg_trgm with schema extensions;

-- ---------------------------------------------------------------------------
-- Units of measure
-- ---------------------------------------------------------------------------
create table public.units_of_measure (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  code text not null check (code ~ '^[a-z][a-z0-9_]{0,15}$'),
  name text not null,
  kind text not null default 'count' check (kind in ('count', 'length', 'mass', 'volume', 'area', 'time', 'other')),
  decimals smallint not null default 2 check (decimals between 0 and 6),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (organization_id, code),
  unique (organization_id, id)
);

-- ---------------------------------------------------------------------------
-- Suppliers (minimal master record; procurement workflow builds on this in P1)
-- ---------------------------------------------------------------------------
create table public.suppliers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  code text not null check (code ~ '^[A-Z0-9][A-Z0-9_-]{0,23}$'),
  name text not null,
  contact_name text,
  email text,
  phone text,
  address text,
  payment_terms text,
  lead_time_days integer check (lead_time_days is null or lead_time_days >= 0),
  notes text,
  is_active boolean not null default true,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid,
  deleted_at timestamptz,
  unique (organization_id, code),
  unique (organization_id, id)
);
create trigger suppliers_touch before update on public.suppliers for each row execute function app.tg_touch();

-- ---------------------------------------------------------------------------
-- Warehouses
-- ---------------------------------------------------------------------------
create table public.warehouses (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  factory_id uuid references public.factories (id) on delete set null,
  code text not null check (code ~ '^[A-Z0-9][A-Z0-9_-]{0,19}$'),
  name text not null,
  address text,
  is_active boolean not null default true,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid,
  deleted_at timestamptz,
  unique (organization_id, code),
  unique (organization_id, id)
);
create trigger warehouses_touch before update on public.warehouses for each row execute function app.tg_touch();

alter table public.factories
  add constraint factories_default_warehouse_fk foreign key (default_warehouse_id) references public.warehouses (id) on delete set null;

create table public.warehouse_locations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  warehouse_id uuid not null,
  code text not null,
  name text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (warehouse_id, code),
  foreign key (organization_id, warehouse_id) references public.warehouses (organization_id, id) on delete cascade
);

-- ---------------------------------------------------------------------------
-- Products
-- ---------------------------------------------------------------------------
create table public.product_categories (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name text not null,
  parent_id uuid references public.product_categories (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (organization_id, name)
);

create table public.products (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  code text not null check (code ~ '^[A-Z0-9][A-Z0-9_./-]{0,31}$'),
  name text not null check (length(trim(name)) between 1 and 160),
  sku text,
  category_id uuid references public.product_categories (id) on delete set null,
  description text,
  uom_id uuid not null,
  standard_minutes_per_unit numeric(12, 2) check (standard_minutes_per_unit is null or standard_minutes_per_unit >= 0),
  target_cost numeric(18, 4) check (target_cost is null or target_cost >= 0),
  selling_price numeric(18, 4) check (selling_price is null or selling_price >= 0),
  status text not null default 'active' check (status in ('draft', 'active', 'discontinued')),
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid,
  deleted_at timestamptz,
  unique (organization_id, code),
  unique (organization_id, id),
  foreign key (organization_id, uom_id) references public.units_of_measure (organization_id, id)
);
create unique index products_sku_unique on public.products (organization_id, lower(sku)) where sku is not null and deleted_at is null;
create index products_name_trgm on public.products using gin (name extensions.gin_trgm_ops);
create trigger products_touch before update on public.products for each row execute function app.tg_touch();

create table public.product_variants (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  product_id uuid not null,
  sku text,
  name text not null default 'Standard',
  size text,
  colour text,
  attributes jsonb not null default '{}'::jsonb,
  selling_price numeric(18, 4) check (selling_price is null or selling_price >= 0),
  is_default boolean not null default false,
  is_active boolean not null default true,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid,
  unique (organization_id, id),
  foreign key (organization_id, product_id) references public.products (organization_id, id) on delete cascade
);
create unique index product_variants_sku_unique on public.product_variants (organization_id, lower(sku)) where sku is not null;
create unique index product_variants_one_default on public.product_variants (product_id) where is_default;
create trigger product_variants_touch before update on public.product_variants for each row execute function app.tg_touch();

-- ---------------------------------------------------------------------------
-- Materials
-- ---------------------------------------------------------------------------
create table public.material_categories (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  unique (organization_id, name),
  unique (organization_id, id)
);

create table public.materials (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  code text not null check (code ~ '^[A-Z0-9][A-Z0-9_./-]{0,31}$'),
  name text not null check (length(trim(name)) between 1 and 160),
  description text,
  kind text not null default 'raw_material' check (kind in ('raw_material', 'consumable', 'packaging')),
  category_id uuid references public.material_categories (id) on delete set null,
  sku text,
  stock_uom_id uuid not null,
  purchase_uom_id uuid,
  purchase_conversion_factor numeric(18, 6) not null default 1 check (purchase_conversion_factor > 0),
  standard_cost numeric(18, 4) check (standard_cost is null or standard_cost >= 0),
  preferred_supplier_id uuid references public.suppliers (id) on delete set null,
  min_stock numeric(18, 4) not null default 0 check (min_stock >= 0),
  reorder_level numeric(18, 4) not null default 0 check (reorder_level >= 0),
  reorder_quantity numeric(18, 4) check (reorder_quantity is null or reorder_quantity > 0),
  max_stock numeric(18, 4) check (max_stock is null or max_stock >= 0),
  default_warehouse_id uuid references public.warehouses (id) on delete set null,
  storage_location text,
  is_active boolean not null default true,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid,
  deleted_at timestamptz,
  unique (organization_id, code),
  unique (organization_id, id),
  check (max_stock is null or max_stock >= reorder_level),
  foreign key (organization_id, stock_uom_id) references public.units_of_measure (organization_id, id),
  foreign key (organization_id, purchase_uom_id) references public.units_of_measure (organization_id, id)
);
create unique index materials_sku_unique on public.materials (organization_id, lower(sku)) where sku is not null and deleted_at is null;
create index materials_name_trgm on public.materials using gin (name extensions.gin_trgm_ops);
create trigger materials_touch before update on public.materials for each row execute function app.tg_touch();

-- ---------------------------------------------------------------------------
-- Stock items: the single thing the inventory ledger tracks. Every material and
-- every product variant has exactly one stock item. This lets BOMs reference
-- either a material or a sub-assembly product (nested BOMs).
-- ---------------------------------------------------------------------------
create table public.stock_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  kind text not null check (kind in ('raw_material', 'consumable', 'packaging', 'finished_good')),
  material_id uuid unique references public.materials (id) on delete cascade,
  product_variant_id uuid unique references public.product_variants (id) on delete cascade,
  uom_id uuid not null,
  average_cost numeric(18, 6) not null default 0 check (average_cost >= 0),
  created_at timestamptz not null default now(),
  unique (organization_id, id),
  check ((material_id is not null)::int + (product_variant_id is not null)::int = 1),
  foreign key (organization_id, uom_id) references public.units_of_measure (organization_id, id)
);

create or replace function app.tg_material_stock_item() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if tg_op = 'INSERT' then
    insert into public.stock_items (organization_id, kind, material_id, uom_id, average_cost)
    values (new.organization_id, new.kind, new.id, new.stock_uom_id, coalesce(new.standard_cost, 0));
  elsif new.kind is distinct from old.kind or new.stock_uom_id is distinct from old.stock_uom_id then
    if new.stock_uom_id is distinct from old.stock_uom_id and exists (
      select 1 from public.inventory_transactions t join public.stock_items s on s.id = t.stock_item_id
      where s.material_id = new.id) then
      raise exception 'The stock unit cannot change after stock movements exist' using errcode = 'P0001';
    end if;
    update public.stock_items set kind = new.kind, uom_id = new.stock_uom_id where material_id = new.id;
  end if;
  return new;
end $$;

create or replace function app.tg_variant_stock_item() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uom uuid;
begin
  select uom_id into v_uom from public.products where id = new.product_id;
  insert into public.stock_items (organization_id, kind, product_variant_id, uom_id)
  values (new.organization_id, 'finished_good', new.id, v_uom);
  return new;
end $$;

create or replace function app.tg_product_default_variant() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  insert into public.product_variants (organization_id, product_id, sku, name, is_default, created_by)
  values (new.organization_id, new.id, new.sku, 'Standard', true, new.created_by);
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- Inventory ledger
-- ---------------------------------------------------------------------------
create table public.inventory_balances (
  organization_id uuid not null references public.organizations (id) on delete cascade,
  stock_item_id uuid not null,
  warehouse_id uuid not null,
  on_hand numeric(18, 4) not null default 0,
  reserved numeric(18, 4) not null default 0 check (reserved >= 0),
  available numeric(18, 4) generated always as (on_hand - reserved) stored,
  last_movement_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (stock_item_id, warehouse_id),
  foreign key (organization_id, stock_item_id) references public.stock_items (organization_id, id) on delete cascade,
  foreign key (organization_id, warehouse_id) references public.warehouses (organization_id, id) on delete cascade
);
create index inventory_balances_org_idx on public.inventory_balances (organization_id, warehouse_id);

create table public.inventory_transactions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  stock_item_id uuid not null,
  warehouse_id uuid not null,
  txn_type text not null check (txn_type in (
    'opening_balance', 'goods_receipt', 'production_issue', 'production_return',
    'finished_goods_receipt', 'transfer_out', 'transfer_in', 'adjustment',
    'damaged', 'wastage', 'stock_count_correction', 'reversal')),
  quantity numeric(18, 4) not null check (quantity <> 0),
  unit_cost numeric(18, 6) not null default 0 check (unit_cost >= 0),
  total_cost numeric(18, 4) not null,
  balance_after numeric(18, 4) not null,
  reference_type text,
  reference_id uuid,
  production_order_id uuid,
  production_operation_id uuid,
  transfer_group_id uuid,
  reversal_of_id uuid unique references public.inventory_transactions (id),
  reason text,
  notes text,
  negative_override boolean not null default false,
  idempotency_key text,
  occurred_at timestamptz not null default now(),
  created_by uuid references auth.users (id) default auth.uid(),
  created_at timestamptz not null default now(),
  foreign key (organization_id, stock_item_id) references public.stock_items (organization_id, id),
  foreign key (organization_id, warehouse_id) references public.warehouses (organization_id, id)
);
create unique index inventory_transactions_idem on public.inventory_transactions (organization_id, idempotency_key) where idempotency_key is not null;
create index inventory_transactions_item_idx on public.inventory_transactions (stock_item_id, occurred_at desc);
create index inventory_transactions_org_idx on public.inventory_transactions (organization_id, occurred_at desc);
create index inventory_transactions_po_idx on public.inventory_transactions (production_order_id) where production_order_id is not null;
create trigger inventory_transactions_immutable before update or delete on public.inventory_transactions
  for each row execute function app.tg_immutable();

create table public.stock_adjustments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  number text not null,
  warehouse_id uuid not null,
  reason text not null check (reason in ('count_correction', 'damaged', 'wastage', 'found', 'expired', 'other')),
  notes text,
  created_by uuid references auth.users (id) default auth.uid(),
  created_at timestamptz not null default now(),
  unique (organization_id, number),
  foreign key (organization_id, warehouse_id) references public.warehouses (organization_id, id)
);
create trigger stock_adjustments_immutable before update or delete on public.stock_adjustments
  for each row execute function app.tg_immutable();

-- ---------------------------------------------------------------------------
-- Bills of materials
-- ---------------------------------------------------------------------------
create table public.bills_of_materials (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  product_id uuid not null,
  variant_id uuid references public.product_variants (id) on delete cascade,
  version integer not null check (version > 0),
  name text,
  status text not null default 'draft' check (status in ('draft', 'pending_approval', 'approved', 'superseded', 'archived')),
  output_quantity numeric(18, 4) not null default 1 check (output_quantity > 0),
  effective_from date,
  notes text,
  based_on_id uuid references public.bills_of_materials (id) on delete set null,
  submitted_by uuid references auth.users (id),
  submitted_at timestamptz,
  approved_by uuid references auth.users (id),
  approved_at timestamptz,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid,
  unique (organization_id, id),
  unique (product_id, variant_id, version),
  foreign key (organization_id, product_id) references public.products (organization_id, id) on delete cascade
);
create unique index boms_one_approved on public.bills_of_materials
  (product_id, coalesce(variant_id, '00000000-0000-0000-0000-000000000000'::uuid)) where status = 'approved';
create trigger boms_touch before update on public.bills_of_materials for each row execute function app.tg_touch();

create table public.bom_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  bom_id uuid not null,
  line_no integer not null,
  stock_item_id uuid not null,
  quantity numeric(18, 6) not null check (quantity > 0),
  wastage_pct numeric(6, 3) not null default 0 check (wastage_pct >= 0 and wastage_pct < 100),
  notes text,
  created_at timestamptz not null default now(),
  unique (bom_id, line_no),
  unique (bom_id, stock_item_id),
  foreign key (organization_id, bom_id) references public.bills_of_materials (organization_id, id) on delete cascade,
  foreign key (organization_id, stock_item_id) references public.stock_items (organization_id, id)
);

-- BOM lines may only change while the BOM is a draft.
create or replace function app.tg_bom_items_guard() returns trigger
language plpgsql as $$
declare v_status text; v_product uuid; v_component_product uuid;
begin
  select status, product_id into v_status, v_product from public.bills_of_materials
  where id = coalesce(new.bom_id, old.bom_id);
  if v_status is not null and v_status <> 'draft' then
    raise exception 'Only draft BOMs can be edited. Create a new version instead.' using errcode = 'P0001';
  end if;
  if tg_op <> 'DELETE' then
    select pv.product_id into v_component_product
    from public.stock_items s join public.product_variants pv on pv.id = s.product_variant_id
    where s.id = new.stock_item_id;
    if v_component_product = v_product then
      raise exception 'A product cannot be a component of its own BOM' using errcode = 'P0001';
    end if;
  end if;
  return coalesce(new, old);
end $$;
create trigger bom_items_guard before insert or update or delete on public.bom_items
  for each row execute function app.tg_bom_items_guard();

create or replace function app.tg_boms_guard() returns trigger
language plpgsql as $$
begin
  if old.status in ('approved', 'superseded', 'archived')
     and (new.output_quantity is distinct from old.output_quantity or new.product_id is distinct from old.product_id
          or new.variant_id is distinct from old.variant_id or new.version is distinct from old.version) then
    raise exception 'Approved BOMs are read-only. Create a new version instead.' using errcode = 'P0001';
  end if;
  if new.status is distinct from old.status and current_user = 'authenticated'
     and coalesce(current_setting('app.bom_transition', true), '') <> 'on' then
    raise exception 'Use the BOM workflow actions to change status' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger boms_guard before update on public.bills_of_materials
  for each row execute function app.tg_boms_guard();

-- ---------------------------------------------------------------------------
-- Production stages and routings (configurable per organisation / factory)
-- ---------------------------------------------------------------------------
create table public.production_stages (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name text not null,
  sequence integer not null,
  colour text not null default 'slate',
  is_quality_stage boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (organization_id, name),
  unique (organization_id, id)
);

create table public.routing_templates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name text not null,
  factory_id uuid references public.factories (id) on delete cascade,
  product_id uuid references public.products (id) on delete cascade,
  is_default boolean not null default false,
  is_active boolean not null default true,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid,
  unique (organization_id, id),
  unique (organization_id, name)
);
create unique index routing_one_default on public.routing_templates (organization_id) where is_default;
create trigger routing_templates_touch before update on public.routing_templates for each row execute function app.tg_touch();

create table public.routing_steps (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  routing_id uuid not null,
  sequence integer not null check (sequence > 0),
  stage_id uuid not null,
  work_centre_id uuid references public.work_centres (id) on delete set null,
  name text not null,
  standard_minutes_per_unit numeric(12, 2) check (standard_minutes_per_unit is null or standard_minutes_per_unit >= 0),
  instructions text,
  requires_quality_check boolean not null default false,
  created_at timestamptz not null default now(),
  unique (routing_id, sequence),
  foreign key (organization_id, routing_id) references public.routing_templates (organization_id, id) on delete cascade,
  foreign key (organization_id, stage_id) references public.production_stages (organization_id, id)
);

create trigger materials_stock_item after insert or update of kind, stock_uom_id on public.materials
  for each row execute function app.tg_material_stock_item();
create trigger products_default_variant after insert on public.products
  for each row execute function app.tg_product_default_variant();
create trigger product_variants_stock_item after insert on public.product_variants
  for each row execute function app.tg_variant_stock_item();

-- Product unit cannot change once its stock has moved.
create or replace function app.tg_products_guard() returns trigger
language plpgsql as $$
begin
  if new.uom_id is distinct from old.uom_id then
    if exists (select 1 from public.inventory_transactions t join public.stock_items s on s.id = t.stock_item_id
               join public.product_variants v on v.id = s.product_variant_id where v.product_id = new.id) then
      raise exception 'The product unit cannot change after stock movements exist' using errcode = 'P0001';
    end if;
    update public.stock_items s set uom_id = new.uom_id
    from public.product_variants v where v.id = s.product_variant_id and v.product_id = new.id;
  end if;
  return new;
end $$;
create trigger products_guard before update of uom_id on public.products
  for each row execute function app.tg_products_guard();

-- Convenience view: every stock item with its display name, code and unit.
create view public.stock_item_details with (security_invoker = true) as
select s.id, s.organization_id, s.kind, s.material_id, s.product_variant_id, s.average_cost, s.uom_id,
       u.code as uom_code,
       coalesce(m.code, p.code) as code,
       case when m.id is not null then m.name
            when v.is_default then p.name
            else p.name || ' — ' || v.name end as name,
       coalesce(m.sku, v.sku, p.sku) as sku,
       pv_product.id as product_id,
       coalesce(m.is_active, p.status = 'active') and m.deleted_at is null and p.deleted_at is null as is_active,
       m.reorder_level, m.min_stock, m.max_stock, m.category_id as material_category_id
from public.stock_items s
join public.units_of_measure u on u.id = s.uom_id
left join public.materials m on m.id = s.material_id
left join public.product_variants v on v.id = s.product_variant_id
left join public.products p on p.id = v.product_id
left join public.products pv_product on pv_product.id = v.product_id;
