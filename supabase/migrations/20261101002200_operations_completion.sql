-- Operations completion: job cards for employees without logins, stock count sheets, customer returns and
-- credit notes, tax invoices, and file attachments (photos, logos, documents).

-- 1. Job cards can be assigned to an employee who doesn't sign in ------------------------------------
alter table public.job_cards add column assigned_employee_id uuid references public.employees (id) on delete set null;
alter table public.job_cards drop constraint job_cards_check;
alter table public.job_cards add constraint job_cards_assignee_check
  check (assigned_user_id is not null or assigned_team is not null or assigned_employee_id is not null);

drop function public.job_card_issue(uuid, uuid, text, numeric, text);
create or replace function public.job_card_issue(p_operation uuid, p_assignee uuid, p_team text, p_target numeric,
  p_instructions text default null, p_employee uuid default null)
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare op public.production_operations; o public.production_orders; v_id uuid; v_code text; e public.employees;
begin
  select * into op from public.production_operations where id = p_operation;
  if op.id is null then raise exception 'Operation not found' using errcode = 'P0002'; end if;
  perform app.require_permission(op.organization_id, 'job_cards.create');
  select * into o from public.production_orders where id = op.production_order_id;
  if o.status in ('draft', 'awaiting_approval', 'completed', 'cancelled') then
    perform app.raise_rule('Job cards can only be issued for approved, unfinished orders');
  end if;
  if p_employee is not null then
    select * into e from public.employees where id = p_employee and organization_id = op.organization_id and status <> 'left';
    if e.id is null then perform app.raise_rule('Employee not found or no longer active'); end if;
    -- an employee who also has a login sees the card on their phone
    p_assignee := coalesce(p_assignee, e.user_id);
  end if;
  if p_assignee is null and p_employee is null and coalesce(trim(p_team), '') = '' then perform app.raise_rule('Assign the job card to a person or a team'); end if;
  if p_assignee is not null and not exists (select 1 from public.organization_members where organization_id = op.organization_id and user_id = p_assignee and status = 'active') then
    perform app.raise_rule('The assignee is not an active member');
  end if;
  if p_target is null or p_target <= 0 then perform app.raise_rule('Target quantity must be greater than zero'); end if;
  v_code := app.next_doc_number(op.organization_id, 'job_card', 'JC-');
  insert into public.job_cards (organization_id, code, production_order_id, operation_id, assigned_user_id, assigned_employee_id, assigned_team, target_quantity, instructions)
  values (op.organization_id, v_code, o.id, p_operation, p_assignee, p_employee, nullif(trim(p_team), ''), p_target, p_instructions)
  returning id into v_id;
  if p_assignee is not null then
    perform app.notify_user(op.organization_id, p_assignee, 'production_assignment', 'info', 'New job card ' || v_code,
      op.name || ' · ' || o.number || ' · target ' || p_target, '/floor/jobs/' || v_id, 'job_cards', v_id);
  end if;
  perform app.audit(op.organization_id, 'issue', 'job_cards', v_id, 'Job card ' || v_code || ' issued', null,
    jsonb_build_object('assignee', p_assignee, 'employee', p_employee, 'team', p_team, 'target', p_target));
  return v_id;
end $$;
grant execute on function public.job_card_issue(uuid, uuid, text, numeric, text, uuid) to authenticated;

create or replace function public.get_job_card(p_card uuid) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare c public.job_cards; v jsonb;
begin
  select * into c from public.job_cards where id = p_card;
  if c.id is null then return null; end if;
  if not (app.has_any(c.organization_id, array['job_cards.read', 'production_orders.read'])
          or (c.assigned_user_id = auth.uid() and app.has_permission(c.organization_id, 'job_cards.work'))) then
    return null;
  end if;
  select jsonb_build_object(
    'id', c.id, 'code', c.code, 'status', c.status, 'target_quantity', c.target_quantity,
    'quantity_completed', c.quantity_completed, 'quantity_rejected', c.quantity_rejected,
    'assigned_team', c.assigned_team, 'instructions', c.instructions, 'issued_at', c.issued_at,
    'assignee_name', coalesce((select full_name from public.employees where id = c.assigned_employee_id), (select full_name from public.profiles where id = c.assigned_user_id)),
    'employee_id', c.assigned_employee_id,
    'order', jsonb_build_object('id', o.id, 'number', o.number, 'status', o.status, 'priority', o.priority,
       'quantity_planned', o.quantity_planned, 'due_date', o.due_date, 'notes', o.notes,
       'factory', (select name from public.factories where id = o.factory_id)),
    'product', jsonb_build_object('name', p.name, 'code', p.code, 'description', p.description,
       'variant', v.name, 'size', v.size, 'colour', v.colour, 'uom', u.code),
    'operation', jsonb_build_object('id', op.id, 'name', op.name, 'sequence', op.sequence, 'status', op.status,
       'instructions', op.instructions, 'requires_quality_check', op.requires_quality_check,
       'quantity_completed', op.quantity_completed, 'quantity_rejected', op.quantity_rejected,
       'work_centre', (select name from public.work_centres where id = op.work_centre_id)),
    'stages', (select jsonb_agg(jsonb_build_object('sequence', x.sequence, 'name', x.name, 'status', x.status) order by x.sequence)
               from public.production_operations x where x.production_order_id = o.id),
    'materials', (select jsonb_agg(jsonb_build_object('name', d.name, 'code', d.code, 'uom', d.uom_code,
                   'per_unit', m.quantity_per_unit, 'required', m.quantity_required, 'issued', m.quantity_issued) order by m.line_no)
                  from public.production_order_materials m join public.stock_item_details d on d.id = m.stock_item_id
                  where m.production_order_id = o.id))
  into v
  from public.production_orders o
  join public.production_operations op on op.id = c.operation_id
  join public.products p on p.id = o.product_id
  join public.product_variants v on v.id = o.variant_id
  join public.units_of_measure u on u.id = p.uom_id
  where o.id = c.production_order_id;
  return v;
end $$;

-- 2. Stock count sheets --------------------------------------------------------------------------------
create table public.stock_counts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  number text not null,
  warehouse_id uuid not null,
  scope text not null default 'all' check (scope in ('all', 'materials', 'finished_goods')),
  blind boolean not null default false,
  status text not null default 'in_progress' check (status in ('in_progress', 'submitted', 'approved', 'cancelled')),
  notes text,
  started_at timestamptz not null default now(),
  created_by uuid references public.profiles (id) default auth.uid(),
  submitted_by uuid references public.profiles (id),
  submitted_at timestamptz,
  approved_by uuid references public.profiles (id),
  approved_at timestamptz,
  decision_note text,
  unique (organization_id, number),
  unique (organization_id, id),
  foreign key (organization_id, warehouse_id) references public.warehouses (organization_id, id)
);
create table public.stock_count_lines (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  stock_count_id uuid not null,
  stock_item_id uuid not null,
  expected numeric(18, 4) not null,
  counted numeric(18, 4) check (counted is null or counted >= 0),
  unit_cost numeric(18, 6) not null default 0,
  note text,
  counted_by uuid references public.profiles (id),
  counted_at timestamptz,
  adjustment numeric(18, 4),
  inventory_transaction_id uuid references public.inventory_transactions (id),
  unique (stock_count_id, stock_item_id),
  foreign key (organization_id, stock_count_id) references public.stock_counts (organization_id, id) on delete cascade,
  foreign key (organization_id, stock_item_id) references public.stock_items (organization_id, id)
);

create or replace function public.stock_count_start(p_org uuid, p jsonb) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_id uuid; v_wh uuid := nullif(p ->> 'warehouse_id', '')::uuid; v_scope text := coalesce(nullif(p ->> 'scope', ''), 'all'); n int;
begin
  perform app.require_permission(p_org, 'inventory.adjust');
  if not exists (select 1 from public.warehouses where id = v_wh and organization_id = p_org and deleted_at is null) then raise exception 'Warehouse not found' using errcode = 'P0002'; end if;
  if exists (select 1 from public.stock_counts where warehouse_id = v_wh and status in ('in_progress', 'submitted')) then
    perform app.raise_rule('A count is already open for this warehouse');
  end if;
  insert into public.stock_counts (organization_id, number, warehouse_id, scope, blind, notes)
  values (p_org, app.next_doc_number(p_org, 'stock_count', 'SC-'), v_wh, v_scope, coalesce((p ->> 'blind')::boolean, false), nullif(p ->> 'notes', ''))
  returning id into v_id;
  insert into public.stock_count_lines (organization_id, stock_count_id, stock_item_id, expected, unit_cost)
  select p_org, v_id, d.id, coalesce(b.on_hand, 0), d.average_cost
  from public.stock_item_details d
  left join public.inventory_balances b on b.stock_item_id = d.id and b.warehouse_id = v_wh
  where d.organization_id = p_org
    and (d.is_active or coalesce(b.on_hand, 0) <> 0)
    and (v_scope = 'all' or (v_scope = 'materials' and d.material_id is not null) or (v_scope = 'finished_goods' and d.product_variant_id is not null));
  get diagnostics n = row_count;
  if n = 0 then perform app.raise_rule('Nothing to count in this warehouse'); end if;
  perform app.audit(p_org, 'stock_count_start', 'stock_counts', v_id, 'Stock count started');
  return v_id;
end $$;

-- lines: [{line_id, counted (number or null), note}]
create or replace function public.stock_count_record(p_count uuid, p_lines jsonb) returns integer
language plpgsql security definer set search_path = public, pg_temp as $$
declare c public.stock_counts; l jsonb; n int := 0;
begin
  select * into c from public.stock_counts where id = p_count for update;
  if c.id is null then raise exception 'Stock count not found' using errcode = 'P0002'; end if;
  perform app.require_permission(c.organization_id, 'inventory.adjust');
  if c.status <> 'in_progress' then perform app.raise_rule('This count has been submitted'); end if;
  for l in select * from jsonb_array_elements(coalesce(p_lines, '[]'::jsonb)) loop
    if nullif(l ->> 'counted', '')::numeric < 0 then perform app.raise_rule('Counts cannot be negative'); end if;
    update public.stock_count_lines set counted = nullif(l ->> 'counted', '')::numeric, note = nullif(l ->> 'note', ''),
      counted_by = case when nullif(l ->> 'counted', '') is null then null else auth.uid() end,
      counted_at = case when nullif(l ->> 'counted', '') is null then null else now() end
    where id = (l ->> 'line_id')::uuid and stock_count_id = p_count;
    n := n + 1;
  end loop;
  return n;
end $$;

create or replace function public.stock_count_transition(p_count uuid, p_action text, p_note text default null) returns text
language plpgsql security definer set search_path = public, pg_temp as $$
declare c public.stock_counts; ln record; v_now numeric; v_adj numeric; v_txn public.inventory_transactions; v_changes int := 0;
begin
  select * into c from public.stock_counts where id = p_count for update;
  if c.id is null then raise exception 'Stock count not found' using errcode = 'P0002'; end if;
  if p_action = 'submit' then
    perform app.require_permission(c.organization_id, 'inventory.adjust');
    if c.status <> 'in_progress' then perform app.raise_rule('Only counts in progress can be submitted'); end if;
    if not exists (select 1 from public.stock_count_lines where stock_count_id = p_count and counted is not null) then perform app.raise_rule('Enter at least one counted quantity'); end if;
    update public.stock_counts set status = 'submitted', submitted_by = auth.uid(), submitted_at = now() where id = p_count;
    perform app.notify_permission(c.organization_id, 'inventory.approve', 'stock_count', 'info', c.number || ' is ready for approval', null,
      '/inventory/counts/' || p_count, 'stock_counts', p_count);
    return 'submitted';
  elsif p_action = 'reopen' then
    perform app.require_permission(c.organization_id, 'inventory.approve');
    if c.status <> 'submitted' then perform app.raise_rule('Only submitted counts can be sent back'); end if;
    update public.stock_counts set status = 'in_progress', decision_note = p_note where id = p_count;
    return 'in_progress';
  elsif p_action = 'cancel' then
    perform app.require_permission(c.organization_id, 'inventory.adjust');
    if c.status not in ('in_progress', 'submitted') then perform app.raise_rule('This count is already closed'); end if;
    update public.stock_counts set status = 'cancelled', decision_note = p_note where id = p_count;
    return 'cancelled';
  elsif p_action = 'approve' then
    perform app.require_permission(c.organization_id, 'inventory.approve');
    if c.status <> 'submitted' then perform app.raise_rule('Submit the count before approving it'); end if;
    -- The counted quantity becomes the stock on hand: post the difference from what the system holds now.
    for ln in select * from public.stock_count_lines where stock_count_id = p_count and counted is not null order by stock_item_id for update loop
      select coalesce(on_hand, 0) into v_now from public.inventory_balances where stock_item_id = ln.stock_item_id and warehouse_id = c.warehouse_id;
      v_adj := ln.counted - coalesce(v_now, 0);
      if v_adj <> 0 then
        v_txn := app.post_inventory_txn(c.organization_id, ln.stock_item_id, c.warehouse_id, 'stock_count_correction', v_adj, null, 'average', 'none', true,
          'stock_count', p_count, null, null, null, null, 'Stock count ' || c.number, ln.note, 'count:' || p_count || ':' || ln.stock_item_id);
        update public.stock_count_lines set adjustment = v_adj, inventory_transaction_id = v_txn.id where id = ln.id;
        v_changes := v_changes + 1;
      else
        update public.stock_count_lines set adjustment = 0 where id = ln.id;
      end if;
    end loop;
    update public.stock_counts set status = 'approved', approved_by = auth.uid(), approved_at = now(), decision_note = p_note where id = p_count;
    perform app.audit(c.organization_id, 'stock_count_approve', 'stock_counts', p_count, c.number || ' approved: ' || v_changes || ' item(s) adjusted');
    return 'approved';
  end if;
  perform app.raise_rule('Unknown action');
end $$;

-- 3. Customer returns and credit notes ------------------------------------------------------------------
alter table public.inventory_transactions drop constraint inventory_transactions_txn_type_check;
alter table public.inventory_transactions add constraint inventory_transactions_txn_type_check check (txn_type in (
  'opening_balance', 'goods_receipt', 'production_issue', 'production_return',
  'finished_goods_receipt', 'transfer_out', 'transfer_in', 'adjustment',
  'damaged', 'wastage', 'stock_count_correction', 'reversal', 'sales_dispatch', 'sales_return'));

alter table public.sales_order_items add column quantity_returned numeric(18, 4) not null default 0 check (quantity_returned >= 0),
  add column quantity_invoiced numeric(18, 4) not null default 0 check (quantity_invoiced >= 0);
alter table public.sales_orders add column amount_credited numeric(18, 2) not null default 0,
  add column shipping_invoiced boolean not null default false;

create table public.sales_returns (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  number text not null,
  sales_order_id uuid not null,
  warehouse_id uuid not null,
  received_at timestamptz not null default now(),
  reason text not null,
  notes text,
  received_by uuid references public.profiles (id) default auth.uid(),
  unique (organization_id, number),
  unique (organization_id, id),
  foreign key (organization_id, sales_order_id) references public.sales_orders (organization_id, id),
  foreign key (organization_id, warehouse_id) references public.warehouses (organization_id, id)
);
create table public.sales_return_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  sales_return_id uuid not null,
  sales_order_item_id uuid not null references public.sales_order_items (id),
  stock_item_id uuid not null references public.stock_items (id),
  quantity numeric(18, 4) not null check (quantity > 0),
  condition text not null check (condition in ('restock', 'damaged')),
  unit_cost numeric(18, 6) not null default 0,
  inventory_transaction_id uuid references public.inventory_transactions (id),
  foreign key (organization_id, sales_return_id) references public.sales_returns (organization_id, id)
);
create trigger sales_returns_immutable before update or delete on public.sales_returns for each row execute function app.tg_immutable();
create trigger sales_return_items_immutable before update or delete on public.sales_return_items for each row execute function app.tg_immutable();

create table public.credit_notes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  number text not null,
  sales_order_id uuid not null,
  customer_id uuid not null,
  sales_return_id uuid references public.sales_returns (id),
  amount numeric(18, 2) not null check (amount > 0),
  reason text not null,
  status text not null default 'issued' check (status in ('issued', 'void')),
  issued_by uuid references public.profiles (id) default auth.uid(),
  issued_at timestamptz not null default now(),
  voided_at timestamptz,
  voided_by uuid references public.profiles (id),
  void_reason text,
  unique (organization_id, number),
  foreign key (organization_id, sales_order_id) references public.sales_orders (organization_id, id),
  foreign key (organization_id, customer_id) references public.customers (organization_id, id)
);

create or replace function app.so_credit_recalc(p_so uuid) returns void
language sql security definer set search_path = public, pg_temp as $$
  update public.sales_orders set amount_credited = coalesce((select sum(amount) from public.credit_notes where sales_order_id = p_so and status = 'issued'), 0)
  where id = p_so
$$;

create or replace function app.credit_note_create(so public.sales_orders, p_amount numeric, p_reason text, p_return uuid) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_id uuid;
begin
  if coalesce(p_amount, 0) <= 0 then perform app.raise_rule('Enter a credit amount greater than zero'); end if;
  if coalesce(trim(p_reason), '') = '' then perform app.raise_rule('Give a reason for the credit'); end if;
  if so.amount_credited + p_amount > so.total + 0.005 then
    perform app.raise_rule('Credits cannot exceed the order total (' || to_char(so.total - so.amount_credited, 'FM999,999,999,990.00') || ' left)');
  end if;
  insert into public.credit_notes (organization_id, number, sales_order_id, customer_id, sales_return_id, amount, reason)
  values (so.organization_id, app.next_doc_number(so.organization_id, 'credit_note', 'CN-'), so.id, so.customer_id, p_return, round(p_amount, 2), trim(p_reason))
  returning id into v_id;
  perform app.so_credit_recalc(so.id);
  perform app.audit(so.organization_id, 'credit_note', 'sales_orders', so.id, 'Credit note for ' || to_char(p_amount, 'FM999,999,999,990.00'));
  return v_id;
end $$;

create or replace function public.credit_note_issue(p_so uuid, p_amount numeric, p_reason text) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare so public.sales_orders;
begin
  select * into so from public.sales_orders where id = p_so for update;
  if so.id is null then raise exception 'Customer order not found' using errcode = 'P0002'; end if;
  perform app.require_permission(so.organization_id, 'sales_orders.manage');
  if so.status in ('draft', 'cancelled') then perform app.raise_rule('Credit notes can only be issued on confirmed orders'); end if;
  return app.credit_note_create(so, p_amount, p_reason, null);
end $$;

create or replace function public.credit_note_void(p_note uuid, p_reason text) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare cn public.credit_notes;
begin
  select * into cn from public.credit_notes where id = p_note for update;
  if cn.id is null then raise exception 'Credit note not found' using errcode = 'P0002'; end if;
  perform app.require_permission(cn.organization_id, 'sales_orders.manage');
  if cn.status = 'void' then perform app.raise_rule('Already void'); end if;
  if coalesce(trim(p_reason), '') = '' then perform app.raise_rule('Give a reason for voiding'); end if;
  update public.credit_notes set status = 'void', voided_at = now(), voided_by = auth.uid(), void_reason = trim(p_reason) where id = p_note;
  perform app.so_credit_recalc(cn.sales_order_id);
  perform app.audit(cn.organization_id, 'credit_note_void', 'sales_orders', cn.sales_order_id, 'Credit note ' || cn.number || ' voided: ' || p_reason);
end $$;

-- p: {reason, notes, warehouse_id, credit (bool), lines: [{so_item_id, quantity, condition: restock|damaged}]}
create or replace function public.sales_return_post(p_so uuid, p jsonb, p_idem text default null) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare so public.sales_orders; it public.sales_order_items; l jsonb; v_id uuid; v_qty numeric; v_cost numeric; v_txn public.inventory_transactions;
        v_wh uuid; v_number text; v_value numeric := 0; v_any boolean := false; v_cond text;
begin
  select * into so from public.sales_orders where id = p_so for update;
  if so.id is null then raise exception 'Customer order not found' using errcode = 'P0002'; end if;
  perform app.require_permission(so.organization_id, 'sales_orders.dispatch');
  if so.status not in ('partially_dispatched', 'dispatched', 'delivered', 'closed') then perform app.raise_rule('Only dispatched goods can be returned'); end if;
  if coalesce(trim(p ->> 'reason'), '') = '' then perform app.raise_rule('Give a reason for the return'); end if;
  v_wh := coalesce(nullif(p ->> 'warehouse_id', '')::uuid, so.warehouse_id);
  if not exists (select 1 from public.warehouses where id = v_wh and organization_id = so.organization_id) then raise exception 'Warehouse not found' using errcode = 'P0002'; end if;
  v_number := app.next_doc_number(so.organization_id, 'sales_return', 'RET-');
  insert into public.sales_returns (organization_id, number, sales_order_id, warehouse_id, reason, notes)
  values (so.organization_id, v_number, p_so, v_wh, trim(p ->> 'reason'), nullif(p ->> 'notes', '')) returning id into v_id;
  for l in select * from jsonb_array_elements(coalesce(p -> 'lines', '[]'::jsonb)) loop
    v_qty := coalesce(nullif(l ->> 'quantity', '')::numeric, 0);
    continue when v_qty = 0;
    if v_qty < 0 then perform app.raise_rule('Quantities cannot be negative'); end if;
    v_cond := coalesce(nullif(l ->> 'condition', ''), 'restock');
    if v_cond not in ('restock', 'damaged') then perform app.raise_rule('Choose restock or damaged'); end if;
    select * into it from public.sales_order_items where id = (l ->> 'so_item_id')::uuid and sales_order_id = p_so for update;
    if it.id is null then raise exception 'Order line not found' using errcode = 'P0002'; end if;
    if v_qty > it.quantity_dispatched - it.quantity_returned + 0.00005 then
      perform app.raise_rule('Line ' || it.line_no || ': only ' || trim_scale(it.quantity_dispatched - it.quantity_returned) || ' dispatched and not yet returned');
    end if;
    -- value returned stock at what it cost when it left
    select coalesce(sum(di.quantity * di.unit_cost) / nullif(sum(di.quantity), 0), 0) into v_cost from public.dispatch_items di where di.sales_order_item_id = it.id;
    v_txn := null;
    if v_cond = 'restock' then
      v_txn := app.post_inventory_txn(so.organization_id, it.stock_item_id, v_wh, 'sales_return', v_qty, v_cost, 'given', 'none', false,
        'sales_return', v_id, null, null, null, null, so.number || ' / ' || v_number, trim(p ->> 'reason'),
        case when p_idem is null then null else p_idem || ':' || it.line_no end);
    end if;
    insert into public.sales_return_items (organization_id, sales_return_id, sales_order_item_id, stock_item_id, quantity, condition, unit_cost, inventory_transaction_id)
    values (so.organization_id, v_id, it.id, it.stock_item_id, v_qty, v_cond, v_cost, v_txn.id);
    update public.sales_order_items set quantity_returned = quantity_returned + v_qty where id = it.id;
    v_value := v_value + v_qty * it.line_total / it.quantity;
    v_any := true;
  end loop;
  if not v_any then perform app.raise_rule('Enter a quantity to return'); end if;
  if coalesce((p ->> 'credit')::boolean, false) then
    perform app.require_permission(so.organization_id, 'sales_orders.manage');
    select * into so from public.sales_orders where id = p_so;
    perform app.credit_note_create(so, least(round(v_value, 2), so.total - so.amount_credited), 'Return ' || v_number || ': ' || trim(p ->> 'reason'), v_id);
  end if;
  perform app.audit(so.organization_id, 'sales_return', 'sales_orders', p_so, 'Return ' || v_number || ' received');
  return v_id;
end $$;

-- 4. Tax invoices -----------------------------------------------------------------------------------------
alter table public.organizations add column if not exists tax_id text, add column if not exists invoice_bank_details text,
  add column if not exists invoice_footer text;

create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  number text not null,
  sales_order_id uuid not null,
  customer_id uuid not null,
  issue_date date not null default current_date,
  due_date date,
  status text not null default 'issued' check (status in ('issued', 'void')),
  currency text not null,
  subtotal numeric(18, 2) not null,
  discount_total numeric(18, 2) not null,
  tax_total numeric(18, 2) not null,
  shipping_charge numeric(18, 2) not null default 0,
  total numeric(18, 2) not null,
  notes text,
  issued_by uuid references public.profiles (id) default auth.uid(),
  created_at timestamptz not null default now(),
  voided_at timestamptz,
  voided_by uuid references public.profiles (id),
  void_reason text,
  unique (organization_id, number),
  unique (organization_id, id),
  check (due_date is null or due_date >= issue_date),
  foreign key (organization_id, sales_order_id) references public.sales_orders (organization_id, id),
  foreign key (organization_id, customer_id) references public.customers (organization_id, id)
);
create table public.invoice_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  invoice_id uuid not null,
  sales_order_item_id uuid not null references public.sales_order_items (id),
  description text not null,
  quantity numeric(18, 4) not null check (quantity > 0),
  unit_price numeric(18, 4) not null,
  discount_pct numeric(6, 3) not null,
  tax_pct numeric(6, 3) not null,
  line_total numeric(18, 2) generated always as (round(quantity * unit_price * (1 - discount_pct / 100) * (1 + tax_pct / 100), 2)) stored,
  foreign key (organization_id, invoice_id) references public.invoices (organization_id, id)
);
create trigger invoice_items_immutable before update or delete on public.invoice_items for each row execute function app.tg_immutable();
create or replace function app.tg_invoice_guard() returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then raise exception 'Invoices are permanent records; void them instead' using errcode = '42501'; end if;
  if old.status = 'void' or (to_jsonb(new) - array['status', 'voided_at', 'voided_by', 'void_reason']) is distinct from (to_jsonb(old) - array['status', 'voided_at', 'voided_by', 'void_reason']) then
    raise exception 'Invoices are permanent records; void them instead' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger invoices_guard before update or delete on public.invoices for each row execute function app.tg_invoice_guard();

-- p: {basis: dispatched|ordered, due_date, notes}
create or replace function public.invoice_issue(p_so uuid, p jsonb) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare so public.sales_orders; v_id uuid; v_basis text := coalesce(nullif(p ->> 'basis', ''), 'dispatched'); v_ship numeric := 0;
        v_sub numeric; v_disc numeric; v_tax numeric; v_tot numeric; v_n int;
begin
  select * into so from public.sales_orders where id = p_so for update;
  if so.id is null then raise exception 'Customer order not found' using errcode = 'P0002'; end if;
  perform app.require_permission(so.organization_id, 'sales_orders.create');
  if so.status in ('draft', 'cancelled') then perform app.raise_rule('Confirm the order before invoicing'); end if;
  if v_basis not in ('dispatched', 'ordered') then perform app.raise_rule('Invalid basis'); end if;
  if not so.shipping_invoiced then v_ship := so.shipping_charge; end if;
  perform 1 from public.sales_order_items where sales_order_id = p_so for update;
  create temp table _inv on commit drop as
    select i.id, coalesce(i.description, d.name) as description, i.unit_price, i.discount_pct, i.tax_pct,
           case when v_basis = 'dispatched' then i.quantity_dispatched - i.quantity_returned else i.quantity - i.quantity_returned end - i.quantity_invoiced as qty, i.line_no
    from public.sales_order_items i join public.stock_item_details d on d.id = i.stock_item_id where i.sales_order_id = p_so;
  delete from _inv where qty <= 0;
  select count(*), round(sum(qty * unit_price), 2), round(sum(qty * unit_price * discount_pct / 100), 2),
         round(sum(qty * unit_price * (1 - discount_pct / 100) * tax_pct / 100), 2), sum(round(qty * unit_price * (1 - discount_pct / 100) * (1 + tax_pct / 100), 2))
    into v_n, v_sub, v_disc, v_tax, v_tot from _inv;
  if v_n = 0 then
    drop table _inv;
    perform app.raise_rule(case when v_basis = 'dispatched' then 'Everything dispatched has already been invoiced' else 'Everything on this order has already been invoiced' end);
  end if;
  insert into public.invoices (organization_id, number, sales_order_id, customer_id, due_date, currency, subtotal, discount_total, tax_total, shipping_charge, total, notes)
  values (so.organization_id, app.next_doc_number(so.organization_id, 'invoice', 'INV-'), p_so, so.customer_id, nullif(p ->> 'due_date', '')::date, so.currency,
          v_sub, v_disc, v_tax, v_ship, v_tot + v_ship, nullif(p ->> 'notes', ''))
  returning id into v_id;
  insert into public.invoice_items (organization_id, invoice_id, sales_order_item_id, description, quantity, unit_price, discount_pct, tax_pct)
  select so.organization_id, v_id, id, description, qty, unit_price, discount_pct, tax_pct from _inv order by line_no;
  update public.sales_order_items i set quantity_invoiced = i.quantity_invoiced + x.qty from _inv x where x.id = i.id;
  drop table _inv;
  if v_ship > 0 then update public.sales_orders set shipping_invoiced = true where id = p_so; end if;
  perform app.audit(so.organization_id, 'invoice', 'sales_orders', p_so, 'Invoice issued');
  return v_id;
end $$;

create or replace function public.invoice_void(p_invoice uuid, p_reason text) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare inv public.invoices; r record;
begin
  select * into inv from public.invoices where id = p_invoice for update;
  if inv.id is null then raise exception 'Invoice not found' using errcode = 'P0002'; end if;
  perform app.require_permission(inv.organization_id, 'sales_orders.manage');
  if inv.status = 'void' then perform app.raise_rule('Already void'); end if;
  if coalesce(trim(p_reason), '') = '' then perform app.raise_rule('Give a reason for voiding'); end if;
  for r in select * from public.invoice_items where invoice_id = p_invoice loop
    update public.sales_order_items set quantity_invoiced = greatest(quantity_invoiced - r.quantity, 0) where id = r.sales_order_item_id;
  end loop;
  if inv.shipping_charge > 0 then update public.sales_orders set shipping_invoiced = false where id = inv.sales_order_id; end if;
  update public.invoices set status = 'void', voided_at = now(), voided_by = auth.uid(), void_reason = trim(p_reason) where id = p_invoice;
  perform app.audit(inv.organization_id, 'invoice_void', 'invoices', p_invoice, inv.number || ' voided: ' || p_reason);
end $$;

-- Payments: balance now nets credit notes.
create or replace function public.payment_record(p_so uuid, p jsonb) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare so public.sales_orders; v_amt numeric := nullif(p ->> 'amount', '')::numeric; v_id uuid;
begin
  select * into so from public.sales_orders where id = p_so for update;
  if so.id is null then raise exception 'Customer order not found' using errcode = 'P0002'; end if;
  perform app.require_permission(so.organization_id, 'sales_orders.create');
  if so.status = 'cancelled' then perform app.raise_rule('Cancelled orders cannot take payments'); end if;
  if coalesce(v_amt, 0) <= 0 then perform app.raise_rule('Enter an amount greater than zero'); end if;
  if so.amount_paid + so.amount_credited + v_amt > so.total + 0.005 then
    perform app.raise_rule('Payment exceeds the balance due (' || to_char(so.total - so.amount_paid - so.amount_credited, 'FM999,999,999,990.00') || ')');
  end if;
  insert into public.customer_payments (organization_id, sales_order_id, customer_id, amount, paid_on, method, reference, notes)
  values (so.organization_id, p_so, so.customer_id, round(v_amt, 2), coalesce(nullif(p ->> 'paid_on', '')::date, current_date),
          coalesce(nullif(p ->> 'method', ''), 'bank_transfer'), nullif(p ->> 'reference', ''), nullif(p ->> 'notes', ''))
  returning id into v_id;
  perform app.so_paid_recalc(p_so);
  perform app.audit(so.organization_id, 'payment', 'sales_orders', p_so, 'Payment of ' || to_char(v_amt, 'FM999,999,999,990.00') || ' recorded on ' || so.number);
  return v_id;
end $$;

drop view public.customer_balances;
create view public.customer_balances with (security_invoker = true) as
select c.id as customer_id, c.organization_id,
       count(so.id) filter (where so.status not in ('cancelled', 'draft')) as orders,
       coalesce(sum(so.total) filter (where so.status not in ('cancelled', 'draft')), 0) as ordered_value,
       coalesce(sum(so.amount_paid) filter (where so.status <> 'cancelled'), 0) as paid,
       coalesce(sum(so.amount_credited) filter (where so.status <> 'cancelled'), 0) as credited,
       coalesce(sum(so.total - so.amount_paid - so.amount_credited) filter (where so.status not in ('cancelled', 'draft')), 0) as balance_due,
       count(so.id) filter (where so.status in ('confirmed', 'partially_dispatched')) as open_orders,
       max(so.order_date) as last_order_date
from public.customers c left join public.sales_orders so on so.customer_id = c.id
group by c.id, c.organization_id;

-- 5. Attachments (photos and documents) --------------------------------------------------------------------
create table public.attachments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  entity_type text not null check (entity_type in ('organization', 'quality_check', 'production_order', 'sales_order', 'goods_receipt', 'dispatch', 'stock_count', 'purchase_order')),
  entity_id uuid not null,
  file_name text not null check (length(file_name) between 1 and 200),
  content_type text not null check (content_type in ('image/jpeg', 'image/png', 'image/webp', 'application/pdf')),
  size_bytes integer not null check (size_bytes between 1 and 5242880),
  data bytea not null,
  caption text,
  uploaded_by uuid references public.profiles (id) default auth.uid(),
  created_at timestamptz not null default now()
);
create index attachments_entity_idx on public.attachments (entity_type, entity_id);
create trigger attachments_audit after insert or delete on public.attachments for each row execute function app.tg_audit_row();

-- Who may see / add attachments on each kind of record.
create or replace function app.attachment_can(p_org uuid, p_type text, p_entity uuid, p_write boolean) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select app.is_member(p_org) and case p_type
    when 'organization' then (not p_write) or app.has_permission(p_org, 'settings.manage')
    when 'quality_check' then app.has_permission(p_org, case when p_write then 'quality.create' else 'quality.read' end)
    when 'production_order' then app.has_any(p_org, case when p_write then array['production_orders.update'] else array['production_orders.read'] end)
      or exists (select 1 from public.job_cards j where j.production_order_id = p_entity and j.assigned_user_id = auth.uid())
    when 'sales_order' then app.has_permission(p_org, case when p_write then 'sales_orders.create' else 'sales_orders.read' end)
    when 'dispatch' then app.has_permission(p_org, case when p_write then 'sales_orders.dispatch' else 'sales_orders.read' end)
    when 'goods_receipt' then app.has_permission(p_org, case when p_write then 'procurement.create' else 'procurement.read' end)
    when 'purchase_order' then app.has_permission(p_org, case when p_write then 'procurement.create' else 'procurement.read' end)
    when 'stock_count' then app.has_permission(p_org, case when p_write then 'inventory.adjust' else 'inventory.read' end)
    else false end
$$;

create or replace view public.attachment_list with (security_invoker = true) as
select id, organization_id, entity_type, entity_id, file_name, content_type, size_bytes, caption, uploaded_by, created_at from public.attachments;

-- RLS for everything above ------------------------------------------------------------------------------
alter table public.stock_counts enable row level security;
alter table public.stock_count_lines enable row level security;
alter table public.sales_returns enable row level security;
alter table public.sales_return_items enable row level security;
alter table public.credit_notes enable row level security;
alter table public.invoices enable row level security;
alter table public.invoice_items enable row level security;
alter table public.attachments enable row level security;
revoke all on public.stock_counts, public.stock_count_lines, public.sales_returns, public.sales_return_items, public.credit_notes,
  public.invoices, public.invoice_items, public.attachments from anon;

create policy counts_select on public.stock_counts for select to authenticated using (app.has_permission(organization_id, 'inventory.read'));
-- blind counts hide the expected quantity from counters (it's still visible to approvers)
create policy count_lines_select on public.stock_count_lines for select to authenticated using (app.has_permission(organization_id, 'inventory.read'));
create policy returns_select on public.sales_returns for select to authenticated using (app.has_any(organization_id, array['sales_orders.read', 'inventory.read']));
create policy return_items_select on public.sales_return_items for select to authenticated using (app.has_any(organization_id, array['sales_orders.read', 'inventory.read']));
create policy credit_notes_select on public.credit_notes for select to authenticated using (app.has_permission(organization_id, 'sales_orders.read'));
create policy invoices_select on public.invoices for select to authenticated using (app.has_permission(organization_id, 'sales_orders.read'));
create policy invoice_items_select on public.invoice_items for select to authenticated using (app.has_permission(organization_id, 'sales_orders.read'));
create policy attachments_select on public.attachments for select to authenticated using (app.attachment_can(organization_id, entity_type, entity_id, false));
create policy attachments_insert on public.attachments for insert to authenticated with check (app.attachment_can(organization_id, entity_type, entity_id, true) and uploaded_by = auth.uid());
create policy attachments_delete on public.attachments for delete to authenticated using (
  (uploaded_by = auth.uid() and app.is_member(organization_id)) or app.has_permission(organization_id, 'settings.manage'));
revoke insert, update, delete on public.stock_counts, public.stock_count_lines, public.sales_returns, public.sales_return_items,
  public.credit_notes, public.invoices, public.invoice_items from authenticated;
revoke update on public.attachments from authenticated;

-- Blind counts: counters see the lines without the expected column through this function.
create or replace function public.stock_count_sheet(p_count uuid)
returns table (line_id uuid, stock_item_id uuid, code text, name text, uom_code text, kind text, expected numeric, counted numeric, note text, adjustment numeric, unit_cost numeric)
language sql stable security definer set search_path = public, pg_temp as $$
  select l.id, l.stock_item_id, d.code, d.name, d.uom_code, d.kind,
         case when c.blind and c.status = 'in_progress' and not app.has_permission(c.organization_id, 'inventory.approve') then null else l.expected end,
         l.counted, l.note, l.adjustment,
         case when app.has_permission(c.organization_id, 'costing.read') then l.unit_cost end
  from public.stock_count_lines l join public.stock_counts c on c.id = l.stock_count_id join public.stock_item_details d on d.id = l.stock_item_id
  where l.stock_count_id = p_count and app.has_permission(c.organization_id, 'inventory.read')
  order by d.kind, d.name
$$;
revoke select on public.stock_count_lines from authenticated;

grant execute on function public.stock_count_start(uuid, jsonb), public.stock_count_record(uuid, jsonb), public.stock_count_transition(uuid, text, text),
  public.stock_count_sheet(uuid), public.credit_note_issue(uuid, numeric, text), public.credit_note_void(uuid, text), public.sales_return_post(uuid, jsonb, text),
  public.invoice_issue(uuid, jsonb), public.invoice_void(uuid, text) to authenticated;
revoke all on function app.credit_note_create(public.sales_orders, numeric, text, uuid), app.so_credit_recalc(uuid) from public, anon, authenticated;


-- Order lines now report returned and invoiced quantities.
drop function public.sales_order_lines(uuid);
create or replace function public.sales_order_lines(p_so uuid)
returns table (id uuid, line_no int, stock_item_id uuid, product_id uuid, name text, code text, uom_code text, quantity numeric,
               unit_price numeric, discount_pct numeric, tax_pct numeric, line_total numeric, allocated numeric, dispatched numeric,
               in_production numeric, available numeric, shortfall numeric, production_orders jsonb, returned numeric, invoiced numeric)
language sql stable security definer set search_path = public, pg_temp as $$
  select i.id, i.line_no, i.stock_item_id, d.product_id, d.name, d.code, d.uom_code, i.quantity, i.unit_price, i.discount_pct, i.tax_pct, i.line_total,
         i.quantity_allocated, i.quantity_dispatched,
         coalesce(pr.open_qty, 0),
         coalesce(b.available, 0),
         case when so.status in ('confirmed', 'partially_dispatched')
              then greatest(i.quantity - i.quantity_dispatched - i.quantity_allocated - coalesce(pr.open_qty, 0), 0) else 0 end,
         coalesce(pr.orders, '[]'::jsonb), i.quantity_returned, i.quantity_invoiced
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
grant execute on function public.sales_order_lines(uuid) to authenticated;
