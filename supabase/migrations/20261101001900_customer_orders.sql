-- Customer orders: customers → sales orders → finished-goods allocation → production for shortfalls
-- → dispatch (stock leaves) → delivery confirmation; payments recorded against orders.

-- Permissions & roles ---------------------------------------------------------------
insert into public.permissions (key, module, action, description) values
  ('customers.read', 'customers', 'read', 'View customers'),
  ('customers.manage', 'customers', 'manage', 'Create and edit customers'),
  ('sales_orders.read', 'sales_orders', 'read', 'View customer orders, dispatches and payments'),
  ('sales_orders.create', 'sales_orders', 'create', 'Create and confirm customer orders, record payments'),
  ('sales_orders.manage', 'sales_orders', 'manage', 'Cancel and close customer orders, void payments'),
  ('sales_orders.dispatch', 'sales_orders', 'dispatch', 'Dispatch goods and confirm delivery')
on conflict (key) do nothing;

insert into app.role_templates (role_key, name, description, sort, is_owner) values
  ('sales_coordinator', 'Sales Coordinator', 'Manage customers and customer orders, follow production and record payments.', 10, false)
on conflict do nothing;

insert into app.role_template_permissions (role_key, permission_key)
select r.role_key, p.key from (values
  ('administrator', array['customers.read', 'customers.manage', 'sales_orders.read', 'sales_orders.create', 'sales_orders.manage', 'sales_orders.dispatch']),
  ('production_manager', array['customers.read', 'sales_orders.read']),
  ('inventory_manager', array['customers.read', 'sales_orders.read', 'sales_orders.dispatch']),
  ('supervisor', array['sales_orders.read']),
  ('finance_analyst', array['customers.read', 'sales_orders.read']),
  ('sales_coordinator', array['dashboard.read', 'customers.read', 'customers.manage', 'sales_orders.read', 'sales_orders.create', 'sales_orders.manage',
                              'products.read', 'inventory.read', 'production_orders.read', 'reports.read', 'reports.export', 'costing.read'])
) as r(role_key, perms)
cross join lateral unnest(r.perms) as p(key)
on conflict do nothing;

-- Existing organisations get the new role and the new permissions on their default roles.
insert into public.roles (organization_id, key, name, description, is_system, is_owner)
select o.id, t.role_key, t.name, t.description, true, false
from public.organizations o cross join app.role_templates t where t.role_key = 'sales_coordinator'
on conflict (organization_id, key) do nothing;
insert into public.role_permissions (role_id, permission_key, organization_id)
select ro.id, tp.permission_key, ro.organization_id
from public.roles ro join app.role_template_permissions tp on tp.role_key = ro.key
where ro.is_system and not ro.is_owner
  and (ro.key = 'sales_coordinator' or tp.permission_key like 'customers.%' or tp.permission_key like 'sales_orders.%')
on conflict do nothing;

-- Stock leaving for a customer is its own movement type.
alter table public.inventory_transactions drop constraint inventory_transactions_txn_type_check;
alter table public.inventory_transactions add constraint inventory_transactions_txn_type_check check (txn_type in (
  'opening_balance', 'goods_receipt', 'production_issue', 'production_return',
  'finished_goods_receipt', 'transfer_out', 'transfer_in', 'adjustment',
  'damaged', 'wastage', 'stock_count_correction', 'reversal', 'sales_dispatch'));

-- Tables -------------------------------------------------------------------------------
create table public.customers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  code text not null check (code ~ '^[A-Z0-9][A-Z0-9_-]{0,23}$'),
  name text not null check (length(trim(name)) between 2 and 160),
  customer_type text not null default 'business' check (customer_type in ('business', 'individual', 'retailer', 'distributor')),
  contact_name text,
  email text,
  phone text,
  billing_address text,
  shipping_address text,
  tax_id text,
  payment_terms text,
  credit_limit numeric(18, 2) check (credit_limit is null or credit_limit >= 0),
  notes text,
  is_active boolean not null default true,
  created_by uuid references public.profiles (id) default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid,
  deleted_at timestamptz,
  unique (organization_id, code),
  unique (organization_id, id)
);
create trigger customers_touch before update on public.customers for each row execute function app.tg_touch();
create trigger customers_audit after insert or update or delete on public.customers for each row execute function app.tg_audit_row();

create table public.sales_orders (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  number text not null,
  customer_id uuid not null,
  status text not null default 'draft' check (status in ('draft', 'confirmed', 'partially_dispatched', 'dispatched', 'delivered', 'closed', 'cancelled')),
  order_date date not null default current_date,
  requested_date date,
  customer_reference text,
  warehouse_id uuid not null,
  currency text not null default 'NGN' check (currency in ('NGN', 'USD', 'GBP', 'EUR')),
  payment_terms text,
  shipping_address text,
  notes text,
  shipping_charge numeric(18, 2) not null default 0 check (shipping_charge >= 0),
  subtotal numeric(18, 2) not null default 0,
  discount_total numeric(18, 2) not null default 0,
  tax_total numeric(18, 2) not null default 0,
  total numeric(18, 2) not null default 0,
  amount_paid numeric(18, 2) not null default 0,
  confirmed_by uuid references public.profiles (id),
  confirmed_at timestamptz,
  cancel_reason text,
  created_by uuid references public.profiles (id) default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid,
  unique (organization_id, number),
  unique (organization_id, id),
  check (requested_date is null or requested_date >= order_date),
  foreign key (organization_id, customer_id) references public.customers (organization_id, id),
  foreign key (organization_id, warehouse_id) references public.warehouses (organization_id, id)
);
create index sales_orders_status_idx on public.sales_orders (organization_id, status);
create index sales_orders_customer_idx on public.sales_orders (customer_id);
create trigger sales_orders_touch before update on public.sales_orders for each row execute function app.tg_touch();

create table public.sales_order_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  sales_order_id uuid not null,
  line_no integer not null,
  stock_item_id uuid not null,
  description text,
  quantity numeric(18, 4) not null check (quantity > 0),
  unit_price numeric(18, 4) not null check (unit_price >= 0),
  discount_pct numeric(6, 3) not null default 0 check (discount_pct >= 0 and discount_pct <= 100),
  tax_pct numeric(6, 3) not null default 0 check (tax_pct >= 0 and tax_pct <= 100),
  line_total numeric(18, 2) generated always as (round(quantity * unit_price * (1 - discount_pct / 100) * (1 + tax_pct / 100), 2)) stored,
  quantity_allocated numeric(18, 4) not null default 0 check (quantity_allocated >= 0),
  quantity_dispatched numeric(18, 4) not null default 0 check (quantity_dispatched >= 0),
  unique (sales_order_id, line_no),
  unique (organization_id, id),
  check (quantity_allocated + quantity_dispatched <= quantity),
  foreign key (organization_id, sales_order_id) references public.sales_orders (organization_id, id) on delete cascade,
  foreign key (organization_id, stock_item_id) references public.stock_items (organization_id, id)
);
create index sales_order_items_item_idx on public.sales_order_items (stock_item_id);

-- Finished goods held for a customer order (reduces available stock, like material reservations).
create table public.sales_allocations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  sales_order_id uuid not null references public.sales_orders (id) on delete cascade,
  sales_order_item_id uuid not null references public.sales_order_items (id) on delete cascade,
  stock_item_id uuid not null,
  warehouse_id uuid not null,
  quantity numeric(18, 4) not null check (quantity >= 0),
  status text not null default 'active' check (status in ('active', 'released', 'fulfilled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (sales_order_item_id, warehouse_id),
  foreign key (organization_id, stock_item_id) references public.stock_items (organization_id, id),
  foreign key (organization_id, warehouse_id) references public.warehouses (organization_id, id)
);
create index sales_allocations_item_idx on public.sales_allocations (stock_item_id, warehouse_id) where status = 'active';

-- Production made for a specific customer-order line.
alter table public.production_orders add column sales_order_item_id uuid references public.sales_order_items (id) on delete set null;
create index production_orders_so_item_idx on public.production_orders (sales_order_item_id) where sales_order_item_id is not null;
create or replace function app.tg_po_link_guard() returns trigger language plpgsql as $$
begin
  if current_user = 'authenticated' and new.sales_order_item_id is distinct from old.sales_order_item_id then
    raise exception 'The customer-order link is set by the workflow' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger production_orders_link_guard before update on public.production_orders for each row execute function app.tg_po_link_guard();

create table public.dispatches (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  number text not null,
  sales_order_id uuid not null,
  warehouse_id uuid not null,
  dispatched_at timestamptz not null default now(),
  carrier text,
  vehicle text,
  driver_name text,
  tracking_reference text,
  notes text,
  status text not null default 'dispatched' check (status in ('dispatched', 'delivered')),
  delivered_at timestamptz,
  received_by text,
  delivery_notes text,
  idempotency_key text,
  dispatched_by uuid references public.profiles (id) default auth.uid(),
  delivery_confirmed_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  unique (organization_id, number),
  unique (organization_id, id),
  unique (organization_id, idempotency_key),
  foreign key (organization_id, sales_order_id) references public.sales_orders (organization_id, id),
  foreign key (organization_id, warehouse_id) references public.warehouses (organization_id, id)
);
create index dispatches_order_idx on public.dispatches (sales_order_id);
-- A dispatch can't be edited or deleted; only its delivery confirmation is filled in once.
create or replace function app.tg_dispatch_guard() returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then raise exception 'Dispatches are permanent records' using errcode = '42501'; end if;
  if (to_jsonb(new) - array['status', 'delivered_at', 'received_by', 'delivery_notes', 'delivery_confirmed_by'])
     is distinct from (to_jsonb(old) - array['status', 'delivered_at', 'received_by', 'delivery_notes', 'delivery_confirmed_by'])
     or old.status = 'delivered' then
    raise exception 'Dispatches are permanent records' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger dispatches_guard before update or delete on public.dispatches for each row execute function app.tg_dispatch_guard();

create table public.dispatch_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  dispatch_id uuid not null,
  sales_order_item_id uuid not null references public.sales_order_items (id),
  stock_item_id uuid not null references public.stock_items (id),
  quantity numeric(18, 4) not null check (quantity > 0),
  unit_cost numeric(18, 6) not null default 0,
  inventory_transaction_id uuid references public.inventory_transactions (id),
  foreign key (organization_id, dispatch_id) references public.dispatches (organization_id, id)
);
create trigger dispatch_items_immutable before update or delete on public.dispatch_items for each row execute function app.tg_immutable();

create table public.customer_payments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  sales_order_id uuid not null,
  customer_id uuid not null,
  amount numeric(18, 2) not null check (amount > 0),
  paid_on date not null default current_date,
  method text not null default 'bank_transfer' check (method in ('cash', 'bank_transfer', 'card', 'pos', 'cheque', 'mobile_money', 'other')),
  reference text,
  notes text,
  recorded_by uuid references public.profiles (id) default auth.uid(),
  created_at timestamptz not null default now(),
  voided_at timestamptz,
  voided_by uuid references public.profiles (id),
  void_reason text,
  foreign key (organization_id, sales_order_id) references public.sales_orders (organization_id, id),
  foreign key (organization_id, customer_id) references public.customers (organization_id, id)
);
create index customer_payments_order_idx on public.customer_payments (sales_order_id);

-- RLS ------------------------------------------------------------------------------------
alter table public.customers enable row level security;
alter table public.sales_orders enable row level security;
alter table public.sales_order_items enable row level security;
alter table public.sales_allocations enable row level security;
alter table public.dispatches enable row level security;
alter table public.dispatch_items enable row level security;
alter table public.customer_payments enable row level security;
revoke all on public.customers, public.sales_orders, public.sales_order_items, public.sales_allocations, public.dispatches,
  public.dispatch_items, public.customer_payments from anon;

create policy customers_select on public.customers for select to authenticated using (app.has_any(organization_id, array['customers.read', 'sales_orders.read']));
create policy customers_insert on public.customers for insert to authenticated with check (app.has_permission(organization_id, 'customers.manage'));
create policy customers_update on public.customers for update to authenticated
  using (app.has_permission(organization_id, 'customers.manage')) with check (app.has_permission(organization_id, 'customers.manage'));
revoke delete on public.customers from authenticated;
create trigger customers_org_immutable before update on public.customers for each row execute function app.tg_org_immutable();

create policy so_select on public.sales_orders for select to authenticated using (app.has_permission(organization_id, 'sales_orders.read'));
create policy so_items_select on public.sales_order_items for select to authenticated using (app.has_permission(organization_id, 'sales_orders.read'));
create policy so_alloc_select on public.sales_allocations for select to authenticated using (app.has_any(organization_id, array['sales_orders.read', 'inventory.read']));
create policy dispatches_select on public.dispatches for select to authenticated using (app.has_any(organization_id, array['sales_orders.read', 'inventory.read']));
create policy dispatch_items_select on public.dispatch_items for select to authenticated using (app.has_any(organization_id, array['sales_orders.read', 'inventory.read']));
create policy payments_select on public.customer_payments for select to authenticated using (app.has_permission(organization_id, 'sales_orders.read'));
revoke insert, update, delete on public.sales_orders, public.sales_order_items, public.sales_allocations, public.dispatches,
  public.dispatch_items, public.customer_payments from authenticated;

-- Functions ------------------------------------------------------------------------------
create or replace function app.so_recalc(p_so uuid) returns void
language sql security definer set search_path = public, pg_temp as $$
  update public.sales_orders so set
    subtotal = coalesce(x.sub, 0), discount_total = coalesce(x.disc, 0), tax_total = coalesce(x.tax, 0),
    total = coalesce(x.tot, 0) + so.shipping_charge
  from (select round(sum(quantity * unit_price), 2) sub,
               round(sum(quantity * unit_price * discount_pct / 100), 2) disc,
               round(sum(quantity * unit_price * (1 - discount_pct / 100) * tax_pct / 100), 2) tax,
               sum(line_total) tot
        from public.sales_order_items where sales_order_id = p_so) x
  where so.id = p_so
$$;

create or replace function app.so_paid_recalc(p_so uuid) returns void
language sql security definer set search_path = public, pg_temp as $$
  update public.sales_orders set amount_paid = coalesce((select sum(amount) from public.customer_payments where sales_order_id = p_so and voided_at is null), 0)
  where id = p_so
$$;

-- p: {customer_id, warehouse_id, requested_date, customer_reference, payment_terms, shipping_address, notes, shipping_charge,
--     lines: [{stock_item_id, quantity, unit_price, discount_pct, tax_pct, description}]}
create or replace function public.sales_order_save(p_org uuid, p_so uuid, p jsonb) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_id uuid := p_so; v_so public.sales_orders; l jsonb; n int := 0; v_cur text; v_cust public.customers;
begin
  perform app.require_permission(p_org, 'sales_orders.create');
  select * into v_cust from public.customers where id = nullif(p ->> 'customer_id', '')::uuid and organization_id = p_org and deleted_at is null;
  if v_cust.id is null then raise exception 'Customer not found' using errcode = 'P0002'; end if;
  if not exists (select 1 from public.warehouses where id = nullif(p ->> 'warehouse_id', '')::uuid and organization_id = p_org and deleted_at is null) then
    raise exception 'Warehouse not found' using errcode = 'P0002';
  end if;
  if jsonb_typeof(p -> 'lines') <> 'array' or jsonb_array_length(p -> 'lines') = 0 then perform app.raise_rule('Add at least one product'); end if;
  select currency into v_cur from public.organization_settings where organization_id = p_org;
  if v_id is not null then
    select * into v_so from public.sales_orders where id = v_id and organization_id = p_org for update;
    if v_so.id is null then raise exception 'Customer order not found' using errcode = 'P0002'; end if;
    if v_so.status <> 'draft' then perform app.raise_rule('Only draft orders can be edited. Cancel and re-create a confirmed order instead.'); end if;
    update public.sales_orders set customer_id = v_cust.id, warehouse_id = (p ->> 'warehouse_id')::uuid,
      requested_date = nullif(p ->> 'requested_date', '')::date, customer_reference = nullif(p ->> 'customer_reference', ''),
      payment_terms = coalesce(nullif(p ->> 'payment_terms', ''), v_cust.payment_terms),
      shipping_address = coalesce(nullif(p ->> 'shipping_address', ''), v_cust.shipping_address, v_cust.billing_address),
      notes = nullif(p ->> 'notes', ''), shipping_charge = coalesce(nullif(p ->> 'shipping_charge', '')::numeric, 0)
    where id = v_id;
    delete from public.sales_order_items where sales_order_id = v_id;
  else
    insert into public.sales_orders (organization_id, number, customer_id, warehouse_id, requested_date, customer_reference, payment_terms,
      shipping_address, notes, shipping_charge, currency)
    values (p_org, app.next_doc_number(p_org, 'sales_order', 'SO-'), v_cust.id, (p ->> 'warehouse_id')::uuid,
      nullif(p ->> 'requested_date', '')::date, nullif(p ->> 'customer_reference', ''), coalesce(nullif(p ->> 'payment_terms', ''), v_cust.payment_terms),
      coalesce(nullif(p ->> 'shipping_address', ''), v_cust.shipping_address, v_cust.billing_address), nullif(p ->> 'notes', ''),
      coalesce(nullif(p ->> 'shipping_charge', '')::numeric, 0), v_cur)
    returning id into v_id;
  end if;
  for l in select * from jsonb_array_elements(p -> 'lines') loop
    n := n + 1;
    if not exists (select 1 from public.stock_items where id = nullif(l ->> 'stock_item_id', '')::uuid and organization_id = p_org and product_variant_id is not null) then
      perform app.raise_rule('Line ' || n || ': choose a product');
    end if;
    if coalesce((l ->> 'quantity')::numeric, 0) <= 0 then perform app.raise_rule('Line ' || n || ': quantity must be greater than zero'); end if;
    if coalesce((l ->> 'unit_price')::numeric, -1) < 0 then perform app.raise_rule('Line ' || n || ': enter a unit price'); end if;
    insert into public.sales_order_items (organization_id, sales_order_id, line_no, stock_item_id, description, quantity, unit_price, discount_pct, tax_pct)
    values (p_org, v_id, n, (l ->> 'stock_item_id')::uuid, nullif(l ->> 'description', ''), (l ->> 'quantity')::numeric, (l ->> 'unit_price')::numeric,
            coalesce(nullif(l ->> 'discount_pct', '')::numeric, 0), coalesce(nullif(l ->> 'tax_pct', '')::numeric, 0));
  end loop;
  perform app.so_recalc(v_id);
  perform app.audit(p_org, case when p_so is null then 'create' else 'update' end, 'sales_orders', v_id, 'Customer order saved');
  return v_id;
end $$;

-- Allocate available finished goods to open lines (no permission check; callers check).
create or replace function app.so_allocate(p_so uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare so public.sales_orders; it public.sales_order_items; b public.inventory_balances; v_need numeric; v_take numeric;
begin
  select * into so from public.sales_orders where id = p_so for update;
  if so.status not in ('confirmed', 'partially_dispatched') then return; end if;
  for it in select * from public.sales_order_items where sales_order_id = p_so order by stock_item_id, line_no for update loop
    v_need := it.quantity - it.quantity_dispatched - it.quantity_allocated;
    if v_need > 0 then
      b := app.lock_balance(so.organization_id, it.stock_item_id, so.warehouse_id);
      v_take := least(v_need, greatest(b.available, 0));
      if v_take > 0 then
        update public.inventory_balances set reserved = reserved + v_take, updated_at = now()
        where stock_item_id = it.stock_item_id and warehouse_id = so.warehouse_id;
        insert into public.sales_allocations (organization_id, sales_order_id, sales_order_item_id, stock_item_id, warehouse_id, quantity)
        values (so.organization_id, p_so, it.id, it.stock_item_id, so.warehouse_id, v_take)
        on conflict (sales_order_item_id, warehouse_id)
        do update set quantity = sales_allocations.quantity + excluded.quantity, status = 'active', updated_at = now();
        update public.sales_order_items set quantity_allocated = quantity_allocated + v_take where id = it.id;
      end if;
    end if;
  end loop;
end $$;

create or replace function app.so_release(p_so uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare a public.sales_allocations;
begin
  for a in select * from public.sales_allocations where sales_order_id = p_so and status = 'active' and quantity > 0
           order by stock_item_id, warehouse_id for update loop
    perform app.lock_balance(a.organization_id, a.stock_item_id, a.warehouse_id);
    update public.inventory_balances set reserved = greatest(reserved - a.quantity, 0), updated_at = now()
    where stock_item_id = a.stock_item_id and warehouse_id = a.warehouse_id;
    update public.sales_allocations set quantity = 0, status = 'released', updated_at = now() where id = a.id;
    update public.sales_order_items set quantity_allocated = greatest(quantity_allocated - a.quantity, 0) where id = a.sales_order_item_id;
  end loop;
end $$;

create or replace function public.sales_order_allocate(p_so uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_org uuid;
begin
  select organization_id into v_org from public.sales_orders where id = p_so;
  if v_org is null then raise exception 'Customer order not found' using errcode = 'P0002'; end if;
  if not app.has_any(v_org, array['sales_orders.create', 'sales_orders.manage', 'sales_orders.dispatch']) then
    raise exception 'missing permission: sales_orders.create' using errcode = '42501';
  end if;
  perform app.so_allocate(p_so);
end $$;

create or replace function public.sales_order_transition(p_so uuid, p_action text, p_note text default null) returns text
language plpgsql security definer set search_path = public, pg_temp as $$
declare so public.sales_orders; v_new text;
begin
  select * into so from public.sales_orders where id = p_so for update;
  if so.id is null then raise exception 'Customer order not found' using errcode = 'P0002'; end if;
  if p_action = 'confirm' then
    perform app.require_permission(so.organization_id, 'sales_orders.create');
    if so.status <> 'draft' then perform app.raise_rule('Only draft orders can be confirmed'); end if;
    v_new := 'confirmed';
    update public.sales_orders set status = v_new, confirmed_by = auth.uid(), confirmed_at = now() where id = p_so;
    perform app.so_allocate(p_so);
    if exists (select 1 from public.sales_order_items where sales_order_id = p_so and quantity_allocated < quantity) then
      perform app.notify_permission(so.organization_id, 'production_orders.create', 'sales_shortage', 'warning',
        so.number || ' needs production', 'Not enough finished goods in stock for this customer order.',
        '/commerce/customer-orders/' || p_so, 'sales_orders', p_so);
    end if;
  elsif p_action = 'cancel' then
    perform app.require_permission(so.organization_id, 'sales_orders.manage');
    if so.status not in ('draft', 'confirmed') then perform app.raise_rule('Orders that have started dispatching can be closed, not cancelled'); end if;
    if coalesce(trim(p_note), '') = '' then perform app.raise_rule('Give a reason for cancelling'); end if;
    perform app.so_release(p_so);
    v_new := 'cancelled';
    update public.sales_orders set status = v_new, cancel_reason = p_note where id = p_so;
  elsif p_action = 'close' then
    perform app.require_permission(so.organization_id, 'sales_orders.manage');
    if so.status not in ('partially_dispatched', 'dispatched', 'delivered') then perform app.raise_rule('Only orders with dispatches can be closed'); end if;
    perform app.so_release(p_so);
    v_new := 'closed';
    update public.sales_orders set status = v_new, cancel_reason = coalesce(nullif(trim(p_note), ''), cancel_reason) where id = p_so;
  else
    perform app.raise_rule('Unknown action');
  end if;
  perform app.audit(so.organization_id, 'sales_order_' || p_action, 'sales_orders', p_so, so.number || ' → ' || v_new || coalesce(': ' || nullif(p_note, ''), ''));
  return v_new;
end $$;

-- Shortfall per line = ordered − dispatched − allocated − still in open production for that line.
create or replace function public.sales_order_lines(p_so uuid)
returns table (id uuid, line_no int, stock_item_id uuid, product_id uuid, name text, code text, uom_code text, quantity numeric,
               unit_price numeric, discount_pct numeric, tax_pct numeric, line_total numeric, allocated numeric, dispatched numeric,
               in_production numeric, available numeric, shortfall numeric, production_orders jsonb)
language sql stable security definer set search_path = public, pg_temp as $$
  select i.id, i.line_no, i.stock_item_id, d.product_id, d.name, d.code, d.uom_code, i.quantity, i.unit_price, i.discount_pct, i.tax_pct, i.line_total,
         i.quantity_allocated, i.quantity_dispatched,
         coalesce(pr.open_qty, 0),
         coalesce(b.available, 0),
         case when so.status in ('confirmed', 'partially_dispatched')
              then greatest(i.quantity - i.quantity_dispatched - i.quantity_allocated - coalesce(pr.open_qty, 0), 0) else 0 end,
         coalesce(pr.orders, '[]'::jsonb)
  from public.sales_order_items i
  join public.sales_orders so on so.id = i.sales_order_id
  join public.stock_item_details d on d.id = i.stock_item_id
  left join public.inventory_balances b on b.stock_item_id = i.stock_item_id and b.warehouse_id = so.warehouse_id
  left join lateral (
    select sum(case when o.status not in ('completed', 'cancelled') then greatest(o.quantity_planned - o.quantity_completed, 0) else 0 end) open_qty,
           jsonb_agg(jsonb_build_object('id', o.id, 'number', o.number, 'status', o.status, 'quantity', o.quantity_planned, 'completed', o.quantity_completed, 'due_date', o.due_date) order by o.created_at) orders
    from public.production_orders o where o.sales_order_item_id = i.id
  ) pr on true
  where i.sales_order_id = p_so and app.has_permission(so.organization_id, 'sales_orders.read')
  order by i.line_no
$$;

-- Create a production order for a customer-order line (defaults to its shortfall).
-- p: {factory_id, quantity, due_date, priority, submit}
create or replace function public.sales_order_make(p_item uuid, p jsonb) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare it public.sales_order_items; so public.sales_orders; v_short numeric; v_qty numeric; v_order uuid; v_product uuid; v_variant uuid;
begin
  select * into it from public.sales_order_items where id = p_item;
  if it.id is null then raise exception 'Order line not found' using errcode = 'P0002'; end if;
  select * into so from public.sales_orders where id = it.sales_order_id for update;
  perform app.require_permission(so.organization_id, 'production_orders.create');
  perform app.require_permission(so.organization_id, 'sales_orders.read');
  if so.status not in ('confirmed', 'partially_dispatched') then perform app.raise_rule('Confirm the customer order before planning production'); end if;
  select l.shortfall into v_short from public.sales_order_lines(so.id) l where l.id = p_item;
  v_qty := coalesce(nullif(p ->> 'quantity', '')::numeric, v_short);
  if coalesce(v_qty, 0) <= 0 then perform app.raise_rule('Nothing left to produce for this line'); end if;
  select v.product_id, v.id into v_product, v_variant from public.stock_items s join public.product_variants v on v.id = s.product_variant_id where s.id = it.stock_item_id;
  v_order := public.production_order_create(so.organization_id, jsonb_build_object(
    'product_id', v_product, 'variant_id', v_variant, 'factory_id', p ->> 'factory_id', 'quantity', v_qty,
    'due_date', coalesce(nullif(p ->> 'due_date', ''), so.requested_date::text), 'priority', coalesce(nullif(p ->> 'priority', ''), 'normal'),
    'source', 'customer_order', 'source_reference', so.number, 'output_warehouse_id', so.warehouse_id,
    'notes', 'For customer order ' || so.number, 'submit', coalesce((p ->> 'submit')::boolean, true)));
  update public.production_orders set sales_order_item_id = p_item where id = v_order;
  perform app.audit(so.organization_id, 'sales_order_production', 'sales_orders', so.id, 'Production planned for line ' || it.line_no, null, jsonb_build_object('production_order_id', v_order, 'quantity', v_qty));
  return v_order;
end $$;

-- When production for a customer order completes, allocate the new finished goods to it.
create or replace function app.tg_po_completed_allocate() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_so uuid;
begin
  if new.status = 'completed' and old.status is distinct from 'completed' and new.sales_order_item_id is not null then
    select sales_order_id into v_so from public.sales_order_items where id = new.sales_order_item_id;
    if v_so is not null then
      perform app.so_allocate(v_so);
      perform app.notify_permission(new.organization_id, 'sales_orders.dispatch', 'sales_ready', 'info',
        'Stock ready for ' || (select number from public.sales_orders where id = v_so),
        new.number || ' completed; finished goods allocated to the customer order.', '/commerce/customer-orders/' || v_so, 'sales_orders', v_so);
    end if;
  end if;
  return null;
end $$;
create trigger production_orders_completed_allocate after update of status on public.production_orders
  for each row execute function app.tg_po_completed_allocate();

-- p: {dispatched_at, carrier, vehicle, driver_name, tracking_reference, notes, lines: [{so_item_id, quantity}]}
create or replace function public.dispatch_post(p_so uuid, p jsonb, p_idem text default null) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare so public.sales_orders; it public.sales_order_items; l jsonb; v_id uuid; v_qty numeric; v_from_alloc numeric; v_txn public.inventory_transactions;
        v_number text; v_any boolean := false; v_status text;
begin
  select * into so from public.sales_orders where id = p_so for update;
  if so.id is null then raise exception 'Customer order not found' using errcode = 'P0002'; end if;
  perform app.require_permission(so.organization_id, 'sales_orders.dispatch');
  if p_idem is not null then
    select id into v_id from public.dispatches where organization_id = so.organization_id and idempotency_key = p_idem;
    if v_id is not null then return v_id; end if;
  end if;
  if so.status not in ('confirmed', 'partially_dispatched') then perform app.raise_rule('Only confirmed orders can be dispatched'); end if;
  v_number := app.next_doc_number(so.organization_id, 'dispatch', 'DSP-');
  insert into public.dispatches (organization_id, number, sales_order_id, warehouse_id, dispatched_at, carrier, vehicle, driver_name, tracking_reference, notes, idempotency_key)
  values (so.organization_id, v_number, p_so, so.warehouse_id, coalesce(nullif(p ->> 'dispatched_at', '')::timestamptz, now()),
          nullif(p ->> 'carrier', ''), nullif(p ->> 'vehicle', ''), nullif(p ->> 'driver_name', ''), nullif(p ->> 'tracking_reference', ''),
          nullif(p ->> 'notes', ''), p_idem)
  returning id into v_id;
  for l in select * from jsonb_array_elements(coalesce(p -> 'lines', '[]'::jsonb)) loop
    v_qty := coalesce(nullif(l ->> 'quantity', '')::numeric, 0);
    if v_qty < 0 then perform app.raise_rule('Quantities cannot be negative'); end if;
    continue when v_qty = 0;
    select * into it from public.sales_order_items where id = (l ->> 'so_item_id')::uuid and sales_order_id = p_so for update;
    if it.id is null then raise exception 'Order line not found' using errcode = 'P0002'; end if;
    if v_qty > it.quantity - it.quantity_dispatched + 0.00005 then
      perform app.raise_rule('Line ' || it.line_no || ': only ' || trim_scale(it.quantity - it.quantity_dispatched) || ' left to dispatch');
    end if;
    -- consume this line's allocation first, then free stock
    v_from_alloc := least(v_qty, it.quantity_allocated);
    if v_from_alloc > 0 then
      perform app.lock_balance(so.organization_id, it.stock_item_id, so.warehouse_id);
      update public.inventory_balances set reserved = greatest(reserved - v_from_alloc, 0), updated_at = now()
      where stock_item_id = it.stock_item_id and warehouse_id = so.warehouse_id;
      update public.sales_allocations set quantity = quantity - v_from_alloc,
        status = case when quantity - v_from_alloc <= 0 then 'fulfilled' else 'active' end, updated_at = now()
      where sales_order_item_id = it.id and warehouse_id = so.warehouse_id;
    end if;
    v_txn := app.post_inventory_txn(so.organization_id, it.stock_item_id, so.warehouse_id, 'sales_dispatch', -v_qty, null, 'average', 'available', false,
      'dispatch', v_id, null, null, null, null, so.number || ' / ' || v_number, null,
      case when p_idem is null then null else p_idem || ':' || it.line_no end);
    insert into public.dispatch_items (organization_id, dispatch_id, sales_order_item_id, stock_item_id, quantity, unit_cost, inventory_transaction_id)
    values (so.organization_id, v_id, it.id, it.stock_item_id, v_qty, v_txn.unit_cost, v_txn.id);
    update public.sales_order_items set quantity_dispatched = quantity_dispatched + v_qty, quantity_allocated = quantity_allocated - v_from_alloc where id = it.id;
    v_any := true;
  end loop;
  if not v_any then perform app.raise_rule('Enter a quantity to dispatch'); end if;
  v_status := case when exists (select 1 from public.sales_order_items where sales_order_id = p_so and quantity_dispatched < quantity)
                   then 'partially_dispatched' else 'dispatched' end;
  update public.sales_orders set status = v_status where id = p_so;
  perform app.audit(so.organization_id, 'dispatch', 'sales_orders', p_so, 'Dispatch ' || v_number || ' for ' || so.number);
  return v_id;
end $$;

create or replace function public.dispatch_confirm_delivery(p_dispatch uuid, p_received_by text, p_notes text default null, p_delivered_at timestamptz default null)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare d public.dispatches; so public.sales_orders;
begin
  select * into d from public.dispatches where id = p_dispatch for update;
  if d.id is null then raise exception 'Dispatch not found' using errcode = 'P0002'; end if;
  perform app.require_permission(d.organization_id, 'sales_orders.dispatch');
  if d.status = 'delivered' then perform app.raise_rule('Delivery is already confirmed'); end if;
  if coalesce(trim(p_received_by), '') = '' then perform app.raise_rule('Enter who received the goods'); end if;
  update public.dispatches set status = 'delivered', delivered_at = coalesce(p_delivered_at, now()), received_by = trim(p_received_by),
    delivery_notes = nullif(trim(p_notes), ''), delivery_confirmed_by = auth.uid()
  where id = p_dispatch;
  select * into so from public.sales_orders where id = d.sales_order_id for update;
  if so.status = 'dispatched' and not exists (select 1 from public.dispatches where sales_order_id = so.id and status <> 'delivered') then
    update public.sales_orders set status = 'delivered' where id = so.id;
  end if;
  perform app.audit(d.organization_id, 'delivery_confirmed', 'dispatches', p_dispatch, d.number || ' received by ' || trim(p_received_by));
end $$;

-- p: {amount, paid_on, method, reference, notes}
create or replace function public.payment_record(p_so uuid, p jsonb) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare so public.sales_orders; v_amt numeric := nullif(p ->> 'amount', '')::numeric; v_id uuid;
begin
  select * into so from public.sales_orders where id = p_so for update;
  if so.id is null then raise exception 'Customer order not found' using errcode = 'P0002'; end if;
  perform app.require_permission(so.organization_id, 'sales_orders.create');
  if so.status = 'cancelled' then perform app.raise_rule('Cancelled orders cannot take payments'); end if;
  if coalesce(v_amt, 0) <= 0 then perform app.raise_rule('Enter an amount greater than zero'); end if;
  if so.amount_paid + v_amt > so.total + 0.005 then
    perform app.raise_rule('Payment exceeds the balance due (' || to_char(so.total - so.amount_paid, 'FM999,999,999,990.00') || ')');
  end if;
  insert into public.customer_payments (organization_id, sales_order_id, customer_id, amount, paid_on, method, reference, notes)
  values (so.organization_id, p_so, so.customer_id, round(v_amt, 2), coalesce(nullif(p ->> 'paid_on', '')::date, current_date),
          coalesce(nullif(p ->> 'method', ''), 'bank_transfer'), nullif(p ->> 'reference', ''), nullif(p ->> 'notes', ''))
  returning id into v_id;
  perform app.so_paid_recalc(p_so);
  perform app.audit(so.organization_id, 'payment', 'sales_orders', p_so, 'Payment of ' || to_char(v_amt, 'FM999,999,999,990.00') || ' recorded on ' || so.number);
  return v_id;
end $$;

create or replace function public.payment_void(p_payment uuid, p_reason text) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare pm public.customer_payments;
begin
  select * into pm from public.customer_payments where id = p_payment for update;
  if pm.id is null then raise exception 'Payment not found' using errcode = 'P0002'; end if;
  perform app.require_permission(pm.organization_id, 'sales_orders.manage');
  if pm.voided_at is not null then perform app.raise_rule('Payment is already voided'); end if;
  if coalesce(trim(p_reason), '') = '' then perform app.raise_rule('Give a reason for voiding'); end if;
  update public.customer_payments set voided_at = now(), voided_by = auth.uid(), void_reason = trim(p_reason) where id = p_payment;
  perform app.so_paid_recalc(pm.sales_order_id);
  perform app.audit(pm.organization_id, 'payment_void', 'sales_orders', pm.sales_order_id, 'Payment voided: ' || p_reason, to_jsonb(pm));
end $$;

-- Customer balances (orders not cancelled).
create or replace view public.customer_balances with (security_invoker = true) as
select c.id as customer_id, c.organization_id,
       count(so.id) filter (where so.status not in ('cancelled', 'draft')) as orders,
       coalesce(sum(so.total) filter (where so.status not in ('cancelled', 'draft')), 0) as ordered_value,
       coalesce(sum(so.amount_paid) filter (where so.status <> 'cancelled'), 0) as paid,
       coalesce(sum(so.total - so.amount_paid) filter (where so.status not in ('cancelled', 'draft')), 0) as balance_due,
       count(so.id) filter (where so.status in ('confirmed', 'partially_dispatched')) as open_orders,
       max(so.order_date) as last_order_date
from public.customers c left join public.sales_orders so on so.customer_id = c.id
group by c.id, c.organization_id;

-- Goods-receipt and dispatch movements are corrected from their documents, not by reversing the ledger entry
-- (reversing would leave the purchase/customer order quantities wrong).
create or replace function app.tg_block_document_reversal() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare t public.inventory_transactions;
begin
  if new.txn_type = 'reversal' and new.reversal_of_id is not null then
    select * into t from public.inventory_transactions where id = new.reversal_of_id;
    if t.reference_type in ('goods_receipt', 'dispatch') then
      raise exception '% movements are corrected from the % (use a stock adjustment for counting errors)',
        case t.reference_type when 'goods_receipt' then 'Goods-receipt' else 'Dispatch' end,
        case t.reference_type when 'goods_receipt' then 'purchase order' else 'customer order' end using errcode = 'P0001';
    end if;
  end if;
  return new;
end $$;
create trigger inventory_transactions_block_document_reversal before insert on public.inventory_transactions
  for each row execute function app.tg_block_document_reversal();

revoke all on function app.so_allocate(uuid), app.so_release(uuid), app.so_recalc(uuid), app.so_paid_recalc(uuid) from public, anon, authenticated;
grant execute on function public.sales_order_save(uuid, uuid, jsonb), public.sales_order_allocate(uuid), public.sales_order_transition(uuid, text, text),
  public.sales_order_lines(uuid), public.sales_order_make(uuid, jsonb), public.dispatch_post(uuid, jsonb, text),
  public.dispatch_confirm_delivery(uuid, text, text, timestamptz), public.payment_record(uuid, jsonb), public.payment_void(uuid, text) to authenticated;
