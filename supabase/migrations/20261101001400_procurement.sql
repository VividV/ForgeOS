-- Procurement: requisitions → purchase orders → goods received.
-- Only posted goods receipts move stock, and only the accepted quantity.

create table public.supplier_contacts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  supplier_id uuid not null references public.suppliers (id) on delete cascade,
  name text not null,
  role text,
  email text,
  phone text,
  is_primary boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.purchase_requisitions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  number text not null,
  status text not null default 'submitted' check (status in ('submitted', 'approved', 'rejected', 'ordered', 'cancelled')),
  source text not null default 'manual' check (source in ('manual', 'reorder', 'production_shortage', 'ai')),
  production_order_id uuid references public.production_orders (id) on delete set null,
  warehouse_id uuid references public.warehouses (id) on delete set null,
  needed_by date,
  notes text,
  requested_by uuid references public.profiles (id) default auth.uid(),
  decided_by uuid references public.profiles (id),
  decided_at timestamptz,
  decision_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, number),
  unique (organization_id, id)
);
create index purchase_requisitions_status_idx on public.purchase_requisitions (organization_id, status);

create table public.purchase_orders (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  number text not null,
  supplier_id uuid not null,
  requisition_id uuid references public.purchase_requisitions (id) on delete set null,
  status text not null default 'draft' check (status in ('draft', 'pending_approval', 'approved', 'sent', 'partially_received', 'received', 'closed', 'cancelled')),
  order_date date not null default current_date,
  expected_date date,
  warehouse_id uuid not null,
  currency text not null default 'NGN' check (currency in ('NGN', 'USD', 'GBP', 'EUR')),
  payment_terms text,
  notes text,
  shipping_cost numeric(18, 2) not null default 0 check (shipping_cost >= 0),
  subtotal numeric(18, 2) not null default 0,
  discount_total numeric(18, 2) not null default 0,
  tax_total numeric(18, 2) not null default 0,
  total numeric(18, 2) not null default 0,
  approved_by uuid references public.profiles (id),
  approved_at timestamptz,
  sent_at timestamptz,
  cancel_reason text,
  created_by uuid references public.profiles (id) default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid,
  unique (organization_id, number),
  unique (organization_id, id),
  check (expected_date is null or expected_date >= order_date),
  foreign key (organization_id, supplier_id) references public.suppliers (organization_id, id),
  foreign key (organization_id, warehouse_id) references public.warehouses (organization_id, id)
);
create index purchase_orders_status_idx on public.purchase_orders (organization_id, status);
create index purchase_orders_supplier_idx on public.purchase_orders (supplier_id);
create trigger purchase_orders_touch before update on public.purchase_orders for each row execute function app.tg_touch();

create table public.purchase_order_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  purchase_order_id uuid not null,
  line_no integer not null,
  stock_item_id uuid not null,
  description text,
  quantity numeric(18, 4) not null check (quantity > 0),
  unit_price numeric(18, 4) not null check (unit_price >= 0),
  discount_pct numeric(6, 3) not null default 0 check (discount_pct >= 0 and discount_pct <= 100),
  tax_pct numeric(6, 3) not null default 0 check (tax_pct >= 0 and tax_pct <= 100),
  line_total numeric(18, 2) generated always as (round(quantity * unit_price * (1 - discount_pct / 100) * (1 + tax_pct / 100), 2)) stored,
  quantity_received numeric(18, 4) not null default 0 check (quantity_received >= 0),
  quantity_rejected numeric(18, 4) not null default 0 check (quantity_rejected >= 0),
  unique (purchase_order_id, line_no),
  unique (organization_id, id),
  foreign key (organization_id, purchase_order_id) references public.purchase_orders (organization_id, id) on delete cascade,
  foreign key (organization_id, stock_item_id) references public.stock_items (organization_id, id)
);

create table public.purchase_requisition_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  requisition_id uuid not null,
  stock_item_id uuid not null,
  quantity numeric(18, 4) not null check (quantity > 0),
  notes text,
  purchase_order_item_id uuid references public.purchase_order_items (id) on delete set null,
  unique (requisition_id, stock_item_id),
  foreign key (organization_id, requisition_id) references public.purchase_requisitions (organization_id, id) on delete cascade,
  foreign key (organization_id, stock_item_id) references public.stock_items (organization_id, id)
);

create table public.goods_receipts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  number text not null,
  purchase_order_id uuid not null,
  warehouse_id uuid not null,
  received_at timestamptz not null default now(),
  delivery_note text,
  notes text,
  received_by uuid references public.profiles (id) default auth.uid(),
  created_at timestamptz not null default now(),
  unique (organization_id, number),
  unique (organization_id, id),
  foreign key (organization_id, purchase_order_id) references public.purchase_orders (organization_id, id),
  foreign key (organization_id, warehouse_id) references public.warehouses (organization_id, id)
);
create trigger goods_receipts_immutable before update or delete on public.goods_receipts
  for each row execute function app.tg_immutable();

create table public.goods_receipt_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  goods_receipt_id uuid not null,
  purchase_order_item_id uuid not null references public.purchase_order_items (id),
  stock_item_id uuid not null references public.stock_items (id),
  quantity_received numeric(18, 4) not null check (quantity_received >= 0),
  quantity_accepted numeric(18, 4) not null check (quantity_accepted >= 0),
  quantity_rejected numeric(18, 4) not null default 0 check (quantity_rejected >= 0),
  unit_cost numeric(18, 6) not null default 0,
  rejection_reason text,
  discrepancy_note text,
  inventory_transaction_id uuid references public.inventory_transactions (id),
  check (quantity_accepted + quantity_rejected = quantity_received),
  foreign key (organization_id, goods_receipt_id) references public.goods_receipts (organization_id, id)
);
create trigger goods_receipt_items_immutable before update or delete on public.goods_receipt_items
  for each row execute function app.tg_immutable();

-- RLS ---------------------------------------------------------------------------
alter table public.supplier_contacts enable row level security;
alter table public.purchase_requisitions enable row level security;
alter table public.purchase_requisition_items enable row level security;
alter table public.purchase_orders enable row level security;
alter table public.purchase_order_items enable row level security;
alter table public.goods_receipts enable row level security;
alter table public.goods_receipt_items enable row level security;
revoke all on public.supplier_contacts, public.purchase_requisitions, public.purchase_requisition_items, public.purchase_orders,
  public.purchase_order_items, public.goods_receipts, public.goods_receipt_items from anon;

create policy supplier_contacts_select on public.supplier_contacts for select to authenticated using (app.has_any(organization_id, array['suppliers.read', 'procurement.read']));
create policy supplier_contacts_write on public.supplier_contacts for all to authenticated
  using (app.has_permission(organization_id, 'suppliers.manage')) with check (app.has_permission(organization_id, 'suppliers.manage'));
create policy requisitions_select on public.purchase_requisitions for select to authenticated using (
  app.has_permission(organization_id, 'procurement.read') or (requested_by = auth.uid() and app.is_member(organization_id)));
create policy requisition_items_select on public.purchase_requisition_items for select to authenticated using (
  app.has_permission(organization_id, 'procurement.read')
  or exists (select 1 from public.purchase_requisitions r where r.id = requisition_id and r.requested_by = auth.uid()));
create policy po_proc_select on public.purchase_orders for select to authenticated using (app.has_permission(organization_id, 'procurement.read'));
create policy po_items_select on public.purchase_order_items for select to authenticated using (app.has_permission(organization_id, 'procurement.read'));
create policy grn_select on public.goods_receipts for select to authenticated using (app.has_any(organization_id, array['procurement.read', 'inventory.read']));
create policy grn_items_select on public.goods_receipt_items for select to authenticated using (app.has_any(organization_id, array['procurement.read', 'inventory.read']));
revoke insert, update, delete on public.purchase_requisitions, public.purchase_requisition_items, public.purchase_orders,
  public.purchase_order_items, public.goods_receipts, public.goods_receipt_items from authenticated;

do $$
declare t text;
begin
  foreach t in array array['supplier_contacts', 'purchase_requisitions', 'purchase_requisition_items', 'purchase_orders', 'purchase_order_items'] loop
    execute format('create trigger %I before update on public.%I for each row execute function app.tg_org_immutable()', t || '_org_immutable', t);
  end loop;
end $$;

-- Functions -------------------------------------------------------------------------
create or replace function app.check_material_item(p_org uuid, p_item uuid) returns void
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if not exists (select 1 from public.stock_items where id = p_item and organization_id = p_org and material_id is not null) then
    perform app.raise_rule('Only materials can be purchased');
  end if;
end $$;

-- p_lines: [{stock_item_id, quantity, notes}]
create or replace function public.requisition_create(p_org uuid, p jsonb) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_id uuid; v_number text; l jsonb; n int := 0;
begin
  perform app.require_permission(p_org, 'requisitions.create');
  if jsonb_typeof(p -> 'lines') <> 'array' or jsonb_array_length(p -> 'lines') = 0 then perform app.raise_rule('Add at least one material'); end if;
  if nullif(p ->> 'warehouse_id', '') is not null and not exists (select 1 from public.warehouses where id = (p ->> 'warehouse_id')::uuid and organization_id = p_org) then
    raise exception 'Warehouse not found' using errcode = 'P0002';
  end if;
  if nullif(p ->> 'production_order_id', '') is not null and not exists (select 1 from public.production_orders where id = (p ->> 'production_order_id')::uuid and organization_id = p_org) then
    raise exception 'Production order not found' using errcode = 'P0002';
  end if;
  v_number := app.next_doc_number(p_org, 'requisition', 'REQ-');
  insert into public.purchase_requisitions (organization_id, number, source, production_order_id, warehouse_id, needed_by, notes)
  values (p_org, v_number, coalesce(nullif(p ->> 'source', ''), 'manual'), nullif(p ->> 'production_order_id', '')::uuid,
          nullif(p ->> 'warehouse_id', '')::uuid, nullif(p ->> 'needed_by', '')::date, nullif(p ->> 'notes', ''))
  returning id into v_id;
  for l in select * from jsonb_array_elements(p -> 'lines') loop
    n := n + 1;
    perform app.check_material_item(p_org, (l ->> 'stock_item_id')::uuid);
    if coalesce((l ->> 'quantity')::numeric, 0) <= 0 then perform app.raise_rule('Line ' || n || ': quantity must be greater than zero'); end if;
    insert into public.purchase_requisition_items (organization_id, requisition_id, stock_item_id, quantity, notes)
    values (p_org, v_id, (l ->> 'stock_item_id')::uuid, (l ->> 'quantity')::numeric, nullif(l ->> 'notes', ''))
    on conflict (requisition_id, stock_item_id) do update set quantity = purchase_requisition_items.quantity + excluded.quantity;
  end loop;
  perform app.notify_permission(p_org, 'procurement.approve', 'purchase_approval', 'info', 'Requisition ' || v_number || ' needs approval',
    n || ' material line(s)', '/commerce/requisitions/' || v_id, 'purchase_requisitions', v_id);
  perform app.audit(p_org, 'create', 'purchase_requisitions', v_id, 'Requisition ' || v_number || ' created');
  return v_id;
end $$;

create or replace function public.requisition_decide(p_req uuid, p_decision text, p_note text default null) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare r public.purchase_requisitions;
begin
  select * into r from public.purchase_requisitions where id = p_req for update;
  if r.id is null then raise exception 'Requisition not found' using errcode = 'P0002'; end if;
  if p_decision = 'cancel' then
    if not (r.requested_by = auth.uid() or app.has_permission(r.organization_id, 'procurement.approve')) then
      raise exception 'missing permission: procurement.approve' using errcode = '42501';
    end if;
    if r.status not in ('submitted', 'approved') then perform app.raise_rule('Only open requisitions can be cancelled'); end if;
    update public.purchase_requisitions set status = 'cancelled', decided_by = auth.uid(), decided_at = now(), decision_note = p_note, updated_at = now() where id = p_req;
  else
    perform app.require_permission(r.organization_id, 'procurement.approve');
    if r.status <> 'submitted' then perform app.raise_rule('This requisition has already been decided'); end if;
    if p_decision = 'reject' and coalesce(trim(p_note), '') = '' then perform app.raise_rule('Give a reason for rejecting'); end if;
    if p_decision not in ('approve', 'reject') then perform app.raise_rule('Unknown decision'); end if;
    update public.purchase_requisitions set status = case p_decision when 'approve' then 'approved' else 'rejected' end,
      decided_by = auth.uid(), decided_at = now(), decision_note = p_note, updated_at = now() where id = p_req;
    if r.requested_by is not null then
      perform app.notify_user(r.organization_id, r.requested_by, 'purchase_approval', case p_decision when 'approve' then 'success' else 'warning' end,
        r.number || ' ' || case p_decision when 'approve' then 'approved' else 'rejected' end, p_note, '/commerce/requisitions/' || p_req, 'purchase_requisitions', p_req);
    end if;
  end if;
  perform app.audit(r.organization_id, 'requisition_' || p_decision, 'purchase_requisitions', p_req, coalesce(p_note, r.number || ' ' || p_decision));
end $$;

create or replace function app.po_recalc(p_po uuid) returns void
language sql security definer set search_path = public, pg_temp as $$
  update public.purchase_orders po set
    subtotal = coalesce(x.sub, 0), discount_total = coalesce(x.disc, 0), tax_total = coalesce(x.tax, 0),
    total = coalesce(x.tot, 0) + po.shipping_cost
  from (select round(sum(quantity * unit_price), 2) sub,
               round(sum(quantity * unit_price * discount_pct / 100), 2) disc,
               round(sum(quantity * unit_price * (1 - discount_pct / 100) * tax_pct / 100), 2) tax,
               sum(line_total) tot
        from public.purchase_order_items where purchase_order_id = p_po) x
  where po.id = p_po
$$;

-- p: {supplier_id, warehouse_id, expected_date, payment_terms, notes, shipping_cost, currency, requisition_id,
--     lines: [{stock_item_id, quantity, unit_price, discount_pct, tax_pct, description, requisition_item_id}]}
create or replace function public.purchase_order_save(p_org uuid, p_po uuid, p jsonb) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_id uuid := p_po; v_number text; l jsonb; n int := 0; v_po public.purchase_orders; v_item uuid; v_cur text;
begin
  perform app.require_permission(p_org, 'procurement.create');
  if not exists (select 1 from public.suppliers where id = (p ->> 'supplier_id')::uuid and organization_id = p_org and deleted_at is null) then
    raise exception 'Supplier not found' using errcode = 'P0002';
  end if;
  if jsonb_typeof(p -> 'lines') <> 'array' or jsonb_array_length(p -> 'lines') = 0 then perform app.raise_rule('Add at least one line'); end if;
  select currency into v_cur from public.organization_settings where organization_id = p_org;
  if v_id is not null then
    select * into v_po from public.purchase_orders where id = v_id and organization_id = p_org for update;
    if v_po.id is null then raise exception 'Purchase order not found' using errcode = 'P0002'; end if;
    if v_po.status not in ('draft', 'pending_approval') then perform app.raise_rule('Only draft purchase orders can be edited'); end if;
    update public.purchase_orders set supplier_id = (p ->> 'supplier_id')::uuid, warehouse_id = (p ->> 'warehouse_id')::uuid,
      expected_date = nullif(p ->> 'expected_date', '')::date, payment_terms = nullif(p ->> 'payment_terms', ''), notes = nullif(p ->> 'notes', ''),
      shipping_cost = coalesce(nullif(p ->> 'shipping_cost', '')::numeric, 0), currency = coalesce(nullif(p ->> 'currency', ''), v_cur), status = 'draft'
    where id = v_id;
    update public.purchase_requisition_items set purchase_order_item_id = null
    where purchase_order_item_id in (select id from public.purchase_order_items where purchase_order_id = v_id);
    delete from public.purchase_order_items where purchase_order_id = v_id;
  else
    v_number := app.next_doc_number(p_org, 'purchase_order', 'PO-');
    insert into public.purchase_orders (organization_id, number, supplier_id, requisition_id, warehouse_id, expected_date, payment_terms, notes, shipping_cost, currency)
    values (p_org, v_number, (p ->> 'supplier_id')::uuid, nullif(p ->> 'requisition_id', '')::uuid, (p ->> 'warehouse_id')::uuid,
            nullif(p ->> 'expected_date', '')::date, nullif(p ->> 'payment_terms', ''), nullif(p ->> 'notes', ''),
            coalesce(nullif(p ->> 'shipping_cost', '')::numeric, 0), coalesce(nullif(p ->> 'currency', ''), v_cur))
    returning id into v_id;
  end if;
  for l in select * from jsonb_array_elements(p -> 'lines') loop
    n := n + 1;
    perform app.check_material_item(p_org, (l ->> 'stock_item_id')::uuid);
    if coalesce((l ->> 'quantity')::numeric, 0) <= 0 then perform app.raise_rule('Line ' || n || ': quantity must be greater than zero'); end if;
    if coalesce((l ->> 'unit_price')::numeric, -1) < 0 then perform app.raise_rule('Line ' || n || ': enter a unit price'); end if;
    insert into public.purchase_order_items (organization_id, purchase_order_id, line_no, stock_item_id, description, quantity, unit_price, discount_pct, tax_pct)
    values (p_org, v_id, n, (l ->> 'stock_item_id')::uuid, nullif(l ->> 'description', ''), (l ->> 'quantity')::numeric, (l ->> 'unit_price')::numeric,
            coalesce(nullif(l ->> 'discount_pct', '')::numeric, 0), coalesce(nullif(l ->> 'tax_pct', '')::numeric, 0))
    returning id into v_item;
    if nullif(l ->> 'requisition_item_id', '') is not null then
      update public.purchase_requisition_items set purchase_order_item_id = v_item
      where id = (l ->> 'requisition_item_id')::uuid and organization_id = p_org;
    end if;
  end loop;
  perform app.po_recalc(v_id);
  if nullif(p ->> 'requisition_id', '') is not null then
    update public.purchase_requisitions set status = 'ordered', updated_at = now()
    where id = (p ->> 'requisition_id')::uuid and organization_id = p_org and status = 'approved';
  end if;
  perform app.audit(p_org, case when p_po is null then 'create' else 'update' end, 'purchase_orders', v_id, 'Purchase order saved');
  return v_id;
end $$;

create or replace function public.purchase_order_transition(p_po uuid, p_action text, p_note text default null) returns text
language plpgsql security definer set search_path = public, pg_temp as $$
declare po public.purchase_orders; v_threshold numeric; v_new text;
begin
  select * into po from public.purchase_orders where id = p_po for update;
  if po.id is null then raise exception 'Purchase order not found' using errcode = 'P0002'; end if;
  select po_approval_threshold into v_threshold from public.organization_settings where organization_id = po.organization_id;
  if p_action = 'submit' then
    perform app.require_permission(po.organization_id, 'procurement.create');
    if po.status <> 'draft' then perform app.raise_rule('Only drafts can be submitted'); end if;
    if po.total <= v_threshold and v_threshold > 0 then
      v_new := 'approved';
      update public.purchase_orders set status = v_new, approved_at = now(), approved_by = auth.uid() where id = p_po;
    else
      v_new := 'pending_approval';
      update public.purchase_orders set status = v_new where id = p_po;
      perform app.notify_permission(po.organization_id, 'procurement.approve', 'purchase_approval', 'info', po.number || ' needs approval',
        'Total ' || po.currency || ' ' || to_char(po.total, 'FM999,999,999,990.00'), '/commerce/purchase-orders/' || p_po, 'purchase_orders', p_po);
    end if;
  elsif p_action = 'approve' then
    perform app.require_permission(po.organization_id, 'procurement.approve');
    if po.status not in ('pending_approval', 'draft') then perform app.raise_rule('This purchase order is not awaiting approval'); end if;
    v_new := 'approved';
    update public.purchase_orders set status = v_new, approved_by = auth.uid(), approved_at = now() where id = p_po;
  elsif p_action = 'reject' then
    perform app.require_permission(po.organization_id, 'procurement.approve');
    if po.status <> 'pending_approval' then perform app.raise_rule('This purchase order is not awaiting approval'); end if;
    v_new := 'draft';
    update public.purchase_orders set status = v_new where id = p_po;
  elsif p_action = 'send' then
    perform app.require_permission(po.organization_id, 'procurement.manage');
    if po.status <> 'approved' then perform app.raise_rule('Approve the purchase order before sending it'); end if;
    v_new := 'sent';
    update public.purchase_orders set status = v_new, sent_at = now() where id = p_po;
  elsif p_action = 'close' then
    perform app.require_permission(po.organization_id, 'procurement.manage');
    if po.status not in ('partially_received', 'received', 'sent', 'approved') then perform app.raise_rule('This purchase order cannot be closed'); end if;
    v_new := 'closed';
    update public.purchase_orders set status = v_new where id = p_po;
  elsif p_action = 'cancel' then
    perform app.require_permission(po.organization_id, 'procurement.manage');
    if coalesce(trim(p_note), '') = '' then perform app.raise_rule('Give a reason for cancelling'); end if;
    if exists (select 1 from public.purchase_order_items where purchase_order_id = p_po and quantity_received > 0) then
      perform app.raise_rule('Goods have been received against this order. Close it instead of cancelling.');
    end if;
    if po.status in ('closed', 'cancelled', 'received') then perform app.raise_rule('This purchase order is already finished'); end if;
    v_new := 'cancelled';
    update public.purchase_orders set status = v_new, cancel_reason = p_note where id = p_po;
  else
    perform app.raise_rule('Unknown action');
  end if;
  perform app.audit(po.organization_id, 'po_' || p_action, 'purchase_orders', p_po, coalesce(p_note, po.number || ': ' || p_action),
    jsonb_build_object('status', po.status), jsonb_build_object('status', v_new));
  return v_new;
end $$;

-- Posts a goods receipt. p_lines: [{po_item_id, received, rejected, rejection_reason, discrepancy_note}]
-- Accepted = received − rejected goes into stock at the line's net unit price.
create or replace function public.goods_receipt_post(p_po uuid, p jsonb, p_idem text default null) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  po public.purchase_orders; v_grn uuid; v_number text; l jsonb; it public.purchase_order_items; v_recv numeric; v_rej numeric; v_acc numeric;
  v_cost numeric; v_txn public.inventory_transactions; v_disc boolean := false; n int := 0; v_wh uuid; v_open numeric;
begin
  select * into po from public.purchase_orders where id = p_po for update;
  if po.id is null then raise exception 'Purchase order not found' using errcode = 'P0002'; end if;
  perform app.require_permission(po.organization_id, 'procurement.create');
  perform app.require_permission(po.organization_id, 'inventory.create');
  if po.status not in ('approved', 'sent', 'partially_received') then
    perform app.raise_rule('Goods can only be received against approved or sent purchase orders');
  end if;
  if p_idem is not null then
    select reference_id into v_grn from public.inventory_transactions where organization_id = po.organization_id and idempotency_key like p_idem || ':%' limit 1;
    if v_grn is not null then return v_grn; end if;
  end if;
  v_wh := coalesce(nullif(p ->> 'warehouse_id', '')::uuid, po.warehouse_id);
  v_number := app.next_doc_number(po.organization_id, 'goods_receipt', 'GRN-');
  insert into public.goods_receipts (organization_id, number, purchase_order_id, warehouse_id, delivery_note, notes, received_at)
  values (po.organization_id, v_number, p_po, v_wh, nullif(p ->> 'delivery_note', ''), nullif(p ->> 'notes', ''),
          coalesce(nullif(p ->> 'received_at', '')::timestamptz, now()))
  returning id into v_grn;

  for l in select * from jsonb_array_elements(p -> 'lines') loop
    v_recv := coalesce(nullif(l ->> 'received', '')::numeric, 0);
    v_rej := coalesce(nullif(l ->> 'rejected', '')::numeric, 0);
    continue when v_recv = 0 and v_rej = 0;
    select * into it from public.purchase_order_items where id = (l ->> 'po_item_id')::uuid and purchase_order_id = p_po for update;
    if it.id is null then raise exception 'Purchase order line not found' using errcode = 'P0002'; end if;
    n := n + 1;
    if v_recv < 0 or v_rej < 0 or v_rej > v_recv then perform app.raise_rule('Line ' || it.line_no || ': rejected cannot exceed received'); end if;
    if v_rej > 0 and coalesce(trim(l ->> 'rejection_reason'), '') = '' then perform app.raise_rule('Line ' || it.line_no || ': give a reason for the rejected quantity'); end if;
    v_acc := v_recv - v_rej;
    v_open := it.quantity - (it.quantity_received - it.quantity_rejected);
    if v_acc > v_open + 0.0001 then
      perform app.raise_rule(format('Line %s: accepting %s would exceed the %s still outstanding on the order', it.line_no, round(v_acc, 2), round(v_open, 2)));
    end if;
    if v_rej > 0 or nullif(trim(l ->> 'discrepancy_note'), '') is not null then v_disc := true; end if;
    v_cost := it.unit_price * (1 - it.discount_pct / 100);
    v_txn := null;
    if v_acc > 0 then
      v_txn := app.post_inventory_txn(po.organization_id, it.stock_item_id, v_wh, 'goods_receipt', v_acc, v_cost, 'given', 'none', false,
        'goods_receipt', v_grn, null, null, null, null, po.number || ' / ' || v_number, nullif(l ->> 'discrepancy_note', ''),
        case when p_idem is null then null else p_idem || ':' || it.line_no end);
    end if;
    insert into public.goods_receipt_items (organization_id, goods_receipt_id, purchase_order_item_id, stock_item_id, quantity_received,
      quantity_accepted, quantity_rejected, unit_cost, rejection_reason, discrepancy_note, inventory_transaction_id)
    values (po.organization_id, v_grn, it.id, it.stock_item_id, v_recv, v_acc, v_rej, v_cost, nullif(l ->> 'rejection_reason', ''),
            nullif(l ->> 'discrepancy_note', ''), v_txn.id);
    update public.purchase_order_items set quantity_received = quantity_received + v_recv, quantity_rejected = quantity_rejected + v_rej where id = it.id;
  end loop;
  if n = 0 then perform app.raise_rule('Enter the quantity received for at least one line'); end if;
  if v_disc then
    perform app.notify_permission(po.organization_id, 'procurement.manage', 'goods_received', 'warning', 'Discrepancy on ' || v_number,
      'Some items on ' || po.number || ' were rejected or did not match', '/commerce/goods-received/' || v_grn, 'goods_receipts', v_grn);
  end if;
  update public.purchase_orders set status = case
      when exists (select 1 from public.purchase_order_items where purchase_order_id = p_po and quantity_received - quantity_rejected < quantity - 0.0001) then 'partially_received'
      else 'received' end
  where id = p_po;
  perform app.notify_permission(po.organization_id, 'inventory.read', 'goods_received', 'success', 'Goods received: ' || v_number,
    po.number, '/commerce/goods-received/' || v_grn, 'goods_receipts', v_grn);
  perform app.audit(po.organization_id, 'goods_receipt', 'goods_receipts', v_grn, 'Goods receipt ' || v_number || ' posted for ' || po.number,
    null, jsonb_build_object('lines', p -> 'lines', 'discrepancy', v_disc));
  return v_grn;
end $$;

-- Receipts are append-only; discrepancy and totals are derived from the lines.
create or replace view public.goods_receipt_summary with (security_invoker = true) as
select g.*, coalesce(sum(i.quantity_rejected), 0) as total_rejected, coalesce(sum(i.quantity_accepted), 0) as total_accepted,
       bool_or(i.quantity_rejected > 0 or i.discrepancy_note is not null) as discrepancy,
       count(i.id) as line_count
from public.goods_receipts g left join public.goods_receipt_items i on i.goods_receipt_id = g.id
group by g.id;

-- Shortage helper: materials needed for open production and below reorder level (for one-click requisitions).
create or replace function public.procurement_suggestions(p_org uuid)
returns table (stock_item_id uuid, material_id uuid, code text, name text, uom_code text, available numeric, on_order numeric,
               production_shortage numeric, reorder_level numeric, suggested numeric, preferred_supplier_id uuid, last_price numeric)
language plpgsql stable security definer set search_path = public, pg_temp as $$
#variable_conflict use_column
begin
  if not app.has_any(p_org, array['procurement.read', 'requisitions.create', 'inventory.read']) then
    raise exception 'missing permission: procurement.read' using errcode = '42501';
  end if;
  return query
  with lv as (select * from public.stock_levels s where s.organization_id = p_org and s.material_id is not null and s.is_active),
  ord as (select i.stock_item_id, sum(greatest(i.quantity - (i.quantity_received - i.quantity_rejected), 0)) q
          from public.purchase_order_items i join public.purchase_orders o on o.id = i.purchase_order_id
          where o.organization_id = p_org and o.status in ('approved', 'sent', 'partially_received', 'pending_approval', 'draft') group by 1),
  sh as (select m.stock_item_id, sum(greatest(m.quantity_required - m.quantity_reserved - m.quantity_issued, 0)) q
         from public.production_order_materials m join public.production_orders o on o.id = m.production_order_id
         where o.organization_id = p_org and o.status in ('approved', 'materials_pending') group by 1),
  lp as (select distinct on (i.stock_item_id) i.stock_item_id, i.unit_price * (1 - i.discount_pct / 100) price
         from public.purchase_order_items i join public.purchase_orders o on o.id = i.purchase_order_id
         where o.organization_id = p_org and o.status <> 'cancelled' order by i.stock_item_id, o.created_at desc)
  select lv.stock_item_id, lv.material_id, lv.code, lv.name, lv.uom_code, lv.available, coalesce(ord.q, 0), coalesce(sh.q, 0),
         greatest(lv.reorder_level, lv.min_stock),
         greatest(coalesce(sh.q, 0) + greatest(coalesce(lv.max_stock, greatest(lv.reorder_level, lv.min_stock) + coalesce(m.reorder_quantity, 0)) - lv.available, 0) - coalesce(ord.q, 0), 0),
         m.preferred_supplier_id, coalesce(lp.price, nullif(lv.average_cost, 0), m.standard_cost)
  from lv join public.materials m on m.id = lv.material_id
  left join ord on ord.stock_item_id = lv.stock_item_id
  left join sh on sh.stock_item_id = lv.stock_item_id
  left join lp on lp.stock_item_id = lv.stock_item_id
  where (coalesce(sh.q, 0) > 0 or (greatest(lv.reorder_level, lv.min_stock) > 0 and lv.available <= greatest(lv.reorder_level, lv.min_stock)))
    and greatest(coalesce(sh.q, 0) + greatest(coalesce(lv.max_stock, greatest(lv.reorder_level, lv.min_stock) + coalesce(m.reorder_quantity, 0)) - lv.available, 0) - coalesce(ord.q, 0), 0) > 0
  order by coalesce(sh.q, 0) desc, lv.name;
end $$;

-- audit triggers for master data
create trigger supplier_contacts_audit after insert or update or delete on public.supplier_contacts for each row execute function app.tg_audit_row();

-- operational alert: overdue purchase order deliveries
create or replace function public.overdue_purchase_orders(p_org uuid)
returns table (id uuid, number text, supplier text, expected_date date, outstanding_lines bigint)
language sql stable security definer set search_path = public, pg_temp as $$
  select po.id, po.number, s.name, po.expected_date,
         (select count(*) from public.purchase_order_items i where i.purchase_order_id = po.id and i.quantity_received - i.quantity_rejected < i.quantity)
  from public.purchase_orders po join public.suppliers s on s.id = po.supplier_id
  join public.organization_settings st on st.organization_id = po.organization_id
  where po.organization_id = p_org and app.has_any(p_org, array['procurement.read', 'dashboard.read'])
    and po.status in ('approved', 'sent', 'partially_received')
    and po.expected_date < (now() at time zone st.timezone)::date
  order by po.expected_date
$$;
