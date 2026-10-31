-- Inventory engine. All stock changes go through app.post_inventory_txn which
-- locks the balance row, enforces the negative-stock rule, maintains the
-- weighted-average cost and writes one immutable ledger row.

create or replace function app.lock_balance(p_org uuid, p_item uuid, p_wh uuid) returns public.inventory_balances
language plpgsql security definer set search_path = public, pg_temp as $$
declare b public.inventory_balances;
begin
  insert into public.inventory_balances (organization_id, stock_item_id, warehouse_id)
  values (p_org, p_item, p_wh) on conflict do nothing;
  select * into b from public.inventory_balances where stock_item_id = p_item and warehouse_id = p_wh for update;
  return b;
end $$;

create or replace function app.check_item_and_warehouse(p_org uuid, p_item uuid, p_wh uuid) returns void
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if not exists (select 1 from public.stock_items where id = p_item and organization_id = p_org) then
    raise exception 'Stock item not found' using errcode = 'P0002';
  end if;
  if not exists (select 1 from public.warehouses where id = p_wh and organization_id = p_org and deleted_at is null and is_active) then
    raise exception 'Warehouse not found or inactive' using errcode = 'P0002';
  end if;
end $$;

-- p_qty is signed: positive adds stock, negative removes it.
-- p_cost_mode: 'given' uses p_unit_cost and updates the moving average (receipts),
--              'average' values the movement at current average cost,
--              'reverse_given' removes value at p_unit_cost (reversal of a receipt).
create or replace function app.post_inventory_txn(
  p_org uuid, p_item uuid, p_wh uuid, p_type text, p_qty numeric, p_unit_cost numeric, p_cost_mode text,
  p_check text,                       -- 'available' | 'on_hand' | 'none'
  p_allow_negative boolean default false,
  p_reference_type text default null, p_reference_id uuid default null,
  p_order uuid default null, p_operation uuid default null, p_transfer_group uuid default null,
  p_reversal_of uuid default null, p_reason text default null, p_notes text default null,
  p_idem text default null
) returns public.inventory_transactions
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  b public.inventory_balances;
  s public.stock_items;
  v_total_qty numeric;
  v_cost numeric;
  v_new_avg numeric;
  v_txn public.inventory_transactions;
  v_threshold numeric;
  v_mat public.materials;
  v_avail_total numeric;
begin
  if p_qty = 0 then perform app.raise_rule('Quantity cannot be zero'); end if;
  if p_idem is not null then
    select * into v_txn from public.inventory_transactions where organization_id = p_org and idempotency_key = p_idem;
    if v_txn.id is not null then return v_txn; end if;
  end if;
  perform app.check_item_and_warehouse(p_org, p_item, p_wh);
  select * into s from public.stock_items where id = p_item for update;
  b := app.lock_balance(p_org, p_item, p_wh);

  if p_qty < 0 and not p_allow_negative then
    if p_check = 'available' and b.available + p_qty < 0 then
      raise exception 'Insufficient available stock: % available, % requested', round(b.available, 4), round(-p_qty, 4)
        using errcode = 'P0001';
    elsif p_check = 'on_hand' and b.on_hand + p_qty < 0 then
      raise exception 'Insufficient stock on hand: % on hand, % requested', round(b.on_hand, 4), round(-p_qty, 4)
        using errcode = 'P0001';
    end if;
  end if;

  select coalesce(sum(on_hand), 0) into v_total_qty from public.inventory_balances where stock_item_id = p_item;

  if p_cost_mode = 'given' then
    v_cost := coalesce(p_unit_cost, 0);
    if p_qty > 0 then
      if v_total_qty <= 0 then
        v_new_avg := v_cost;
      else
        v_new_avg := (v_total_qty * s.average_cost + p_qty * v_cost) / (v_total_qty + p_qty);
      end if;
    else
      v_new_avg := s.average_cost;
    end if;
  elsif p_cost_mode = 'reverse_given' then
    v_cost := coalesce(p_unit_cost, 0);
    if v_total_qty + p_qty > 0 then
      v_new_avg := greatest((v_total_qty * s.average_cost + p_qty * v_cost) / (v_total_qty + p_qty), 0);
    else
      v_new_avg := s.average_cost;
    end if;
  else
    v_cost := s.average_cost;
    v_new_avg := s.average_cost;
  end if;

  update public.inventory_balances
  set on_hand = on_hand + p_qty, last_movement_at = now(), updated_at = now()
  where stock_item_id = p_item and warehouse_id = p_wh
  returning * into b;
  if v_new_avg is distinct from s.average_cost then
    update public.stock_items set average_cost = round(v_new_avg, 6) where id = p_item;
  end if;

  insert into public.inventory_transactions (
    organization_id, stock_item_id, warehouse_id, txn_type, quantity, unit_cost, total_cost, balance_after,
    reference_type, reference_id, production_order_id, production_operation_id, transfer_group_id, reversal_of_id,
    reason, notes, negative_override, idempotency_key)
  values (p_org, p_item, p_wh, p_type, p_qty, round(v_cost, 6), round(p_qty * v_cost, 4), b.on_hand,
          p_reference_type, p_reference_id, p_order, p_operation, p_transfer_group, p_reversal_of,
          p_reason, p_notes, p_allow_negative and b.on_hand < 0, p_idem)
  returning * into v_txn;

  if v_txn.negative_override then
    perform app.audit(p_org, 'negative_stock_override', 'inventory_transactions', v_txn.id,
      'Stock allowed to go negative', null, jsonb_build_object('balance_after', b.on_hand, 'reason', p_reason));
  end if;

  -- Low-stock alert (deterministic rule) when a material crosses its reorder level.
  if p_qty < 0 and s.material_id is not null then
    select * into v_mat from public.materials where id = s.material_id;
    v_threshold := greatest(v_mat.reorder_level, v_mat.min_stock);
    if v_threshold > 0 then
      select coalesce(sum(available), 0) into v_avail_total from public.inventory_balances where stock_item_id = p_item;
      if v_avail_total <= v_threshold and v_avail_total - p_qty > v_threshold then
        perform app.notify_permission(p_org, 'inventory.read', 'low_stock',
          case when v_avail_total <= 0 then 'critical' else 'warning' end,
          v_mat.name || case when v_avail_total <= 0 then ' is out of stock' else ' is below reorder level' end,
          'Available: ' || round(v_avail_total, 2) || ' · Reorder level: ' || round(v_threshold, 2),
          '/inventory/materials/' || v_mat.id, 'materials', v_mat.id,
          'low_stock:' || v_mat.id || ':' || to_char(now(), 'YYYY-MM-DD'));
      end if;
    end if;
  end if;
  return v_txn;
end $$;

-- Receipts and opening balances -------------------------------------------------
create or replace function public.inventory_receive(
  p_org uuid, p_item uuid, p_warehouse uuid, p_quantity numeric, p_unit_cost numeric,
  p_type text default 'goods_receipt', p_reference text default null, p_notes text default null, p_idem text default null
) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare v public.inventory_transactions;
begin
  perform app.require_permission(p_org, 'inventory.create');
  if p_type not in ('goods_receipt', 'opening_balance') then perform app.raise_rule('Invalid receipt type'); end if;
  if p_quantity is null or p_quantity <= 0 then perform app.raise_rule('Quantity must be greater than zero'); end if;
  if p_unit_cost is null or p_unit_cost < 0 then perform app.raise_rule('Unit cost must be zero or more'); end if;
  v := app.post_inventory_txn(p_org, p_item, p_warehouse, p_type, p_quantity, p_unit_cost, 'given', 'none',
         false, 'manual_receipt', null, null, null, null, null,
         case when p_type = 'opening_balance' then 'Opening balance' else coalesce(nullif(p_reference, ''), 'Goods received') end,
         p_notes, p_idem);
  perform app.audit(p_org, p_type, 'inventory_transactions', v.id,
    case when p_type = 'opening_balance' then 'Opening balance recorded' else 'Goods received' end,
    null, jsonb_build_object('stock_item_id', p_item, 'warehouse_id', p_warehouse, 'quantity', p_quantity, 'unit_cost', p_unit_cost,
                             'reference', p_reference));
  return v.id;
end $$;

-- Transfers ----------------------------------------------------------------------
create or replace function public.inventory_transfer(
  p_org uuid, p_item uuid, p_from uuid, p_to uuid, p_quantity numeric, p_notes text default null, p_idem text default null
) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_group uuid := gen_random_uuid(); v_out public.inventory_transactions; v_in public.inventory_transactions;
begin
  perform app.require_permission(p_org, 'inventory.create');
  if p_from = p_to then perform app.raise_rule('Choose two different warehouses'); end if;
  if p_quantity is null or p_quantity <= 0 then perform app.raise_rule('Quantity must be greater than zero'); end if;
  if p_idem is not null then
    select transfer_group_id into v_group from public.inventory_transactions where organization_id = p_org and idempotency_key = p_idem || ':out';
    if found then return v_group; end if;
    v_group := gen_random_uuid();
  end if;
  -- lock in a stable order to avoid deadlocks
  perform app.lock_balance(p_org, p_item, least(p_from, p_to));
  perform app.lock_balance(p_org, p_item, greatest(p_from, p_to));
  v_out := app.post_inventory_txn(p_org, p_item, p_from, 'transfer_out', -p_quantity, null, 'average', 'available',
             false, 'transfer', v_group, null, null, v_group, null, 'Transfer', p_notes, p_idem || ':out');
  v_in := app.post_inventory_txn(p_org, p_item, p_to, 'transfer_in', p_quantity, v_out.unit_cost, 'average', 'none',
             false, 'transfer', v_group, null, null, v_group, null, 'Transfer', p_notes, p_idem || ':in');
  perform app.audit(p_org, 'transfer', 'inventory_transactions', v_group, 'Stock transferred', null,
    jsonb_build_object('stock_item_id', p_item, 'from', p_from, 'to', p_to, 'quantity', p_quantity));
  return v_group;
end $$;

-- Adjustments (multi-line) ------------------------------------------------------
-- p_lines: [{ "stock_item_id": uuid, "quantity": signed number, "unit_cost": number? }]
create or replace function public.inventory_adjust(
  p_org uuid, p_warehouse uuid, p_reason text, p_lines jsonb, p_notes text default null,
  p_allow_negative boolean default false, p_idem text default null
) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_adj uuid; v_number text; l jsonb; v_qty numeric; v_type text; i int := 0; v_existing uuid;
begin
  perform app.require_permission(p_org, 'inventory.adjust');
  if p_allow_negative then
    perform app.require_permission(p_org, 'inventory.approve');
    if coalesce(trim(p_notes), '') = '' then perform app.raise_rule('A note is required when allowing negative stock'); end if;
  end if;
  if p_reason not in ('count_correction', 'damaged', 'wastage', 'found', 'expired', 'other') then
    perform app.raise_rule('Invalid adjustment reason');
  end if;
  if jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then perform app.raise_rule('Add at least one line'); end if;
  if p_idem is not null then
    select reference_id into v_existing from public.inventory_transactions where organization_id = p_org and idempotency_key = p_idem || ':1';
    if v_existing is not null then return v_existing; end if;
  end if;
  if p_reason in ('count_correction', 'other') and coalesce(trim(p_notes), '') = '' then
    perform app.raise_rule('Explain the reason for this adjustment in the notes');
  end if;

  v_number := app.next_doc_number(p_org, 'stock_adjustment', 'ADJ-');
  insert into public.stock_adjustments (organization_id, number, warehouse_id, reason, notes)
  values (p_org, v_number, p_warehouse, p_reason, p_notes) returning id into v_adj;

  v_type := case p_reason when 'damaged' then 'damaged' when 'wastage' then 'wastage' when 'expired' then 'wastage'
                          when 'count_correction' then 'stock_count_correction' else 'adjustment' end;
  for l in select * from jsonb_array_elements(p_lines) loop
    i := i + 1;
    v_qty := (l ->> 'quantity')::numeric;
    if v_qty is null or v_qty = 0 then perform app.raise_rule('Line ' || i || ': quantity cannot be zero'); end if;
    if p_reason in ('damaged', 'wastage', 'expired') and v_qty > 0 then
      perform app.raise_rule('Line ' || i || ': damaged, expired and wasted stock must be a negative quantity');
    end if;
    if p_reason = 'found' and v_qty < 0 then perform app.raise_rule('Line ' || i || ': found stock must be a positive quantity'); end if;
    perform app.post_inventory_txn(p_org, (l ->> 'stock_item_id')::uuid, p_warehouse, v_type, v_qty,
      nullif(l ->> 'unit_cost', '')::numeric,
      case when v_qty > 0 and nullif(l ->> 'unit_cost', '') is not null then 'given' else 'average' end,
      'available', p_allow_negative, 'stock_adjustment', v_adj, null, null, null, null, p_reason, p_notes,
      case when p_idem is null then null else p_idem || ':' || i end);
  end loop;
  perform app.audit(p_org, 'stock_adjustment', 'stock_adjustments', v_adj, 'Stock adjustment ' || v_number,
    null, jsonb_build_object('reason', p_reason, 'lines', p_lines, 'notes', p_notes, 'allow_negative', p_allow_negative));
  return v_adj;
end $$;

-- Reversal (compensating entry) ------------------------------------------------
create or replace function public.inventory_reverse(p_txn uuid, p_reason text) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare t public.inventory_transactions; v public.inventory_transactions; leg public.inventory_transactions; v_first uuid;
begin
  select * into t from public.inventory_transactions where id = p_txn;
  if t.id is null then raise exception 'Transaction not found' using errcode = 'P0002'; end if;
  perform app.require_permission(t.organization_id, 'inventory.approve');
  if coalesce(trim(p_reason), '') = '' then perform app.raise_rule('A reason is required to reverse a transaction'); end if;
  if t.txn_type = 'reversal' then perform app.raise_rule('A reversal cannot itself be reversed'); end if;
  if t.production_order_id is not null then
    perform app.raise_rule('Production movements are corrected from the production order (return or re-issue materials)');
  end if;
  if exists (select 1 from public.inventory_transactions where reversal_of_id = p_txn) then
    perform app.raise_rule('This transaction has already been reversed');
  end if;

  if t.transfer_group_id is not null then
    -- reverse both legs: take back from destination first
    for leg in select * from public.inventory_transactions where transfer_group_id = t.transfer_group_id and txn_type in ('transfer_in', 'transfer_out')
               order by case txn_type when 'transfer_in' then 0 else 1 end loop
      if exists (select 1 from public.inventory_transactions where reversal_of_id = leg.id) then
        perform app.raise_rule('This transfer has already been reversed');
      end if;
      v := app.post_inventory_txn(leg.organization_id, leg.stock_item_id, leg.warehouse_id, 'reversal', -leg.quantity, leg.unit_cost,
             'average', 'available', false, leg.reference_type, leg.reference_id, null, null, leg.transfer_group_id, leg.id,
             p_reason, null, null);
      v_first := coalesce(v_first, v.id);
    end loop;
  else
    v := app.post_inventory_txn(t.organization_id, t.stock_item_id, t.warehouse_id, 'reversal', -t.quantity, t.unit_cost,
           case when t.quantity > 0 and t.txn_type in ('goods_receipt', 'opening_balance', 'adjustment', 'stock_count_correction')
                then 'reverse_given' when t.quantity < 0 then 'given' else 'average' end,
           'available', false, t.reference_type, t.reference_id, null, null, null, t.id, p_reason, null, null);
    v_first := v.id;
  end if;
  perform app.audit(t.organization_id, 'reverse', 'inventory_transactions', p_txn, 'Transaction reversed: ' || p_reason,
    to_jsonb(t), jsonb_build_object('reversal_id', v_first));
  return v_first;
end $$;

-- Read helper: stock summary per item across warehouses.
create or replace view public.stock_levels with (security_invoker = true) as
select d.id as stock_item_id, d.organization_id, d.kind, d.code, d.name, d.sku, d.uom_code, d.material_id,
       d.product_variant_id, d.product_id, d.average_cost, d.reorder_level, d.min_stock, d.max_stock,
       d.material_category_id, d.is_active,
       coalesce(sum(b.on_hand), 0) as on_hand,
       coalesce(sum(b.reserved), 0) as reserved,
       coalesce(sum(b.available), 0) as available,
       round(coalesce(sum(b.on_hand), 0) * d.average_cost, 2) as stock_value,
       max(b.last_movement_at) as last_movement_at,
       case
         when coalesce(sum(b.available), 0) <= 0 and d.material_id is not null then 'out_of_stock'
         when greatest(coalesce(d.reorder_level, 0), coalesce(d.min_stock, 0)) > 0
              and coalesce(sum(b.available), 0) <= greatest(coalesce(d.reorder_level, 0), coalesce(d.min_stock, 0)) then 'low'
         when d.max_stock is not null and coalesce(sum(b.on_hand), 0) > d.max_stock then 'excess'
         else 'ok' end as stock_status
from public.stock_item_details d
left join public.inventory_balances b on b.stock_item_id = d.id
group by d.id, d.organization_id, d.kind, d.code, d.name, d.sku, d.uom_code, d.material_id, d.product_variant_id,
         d.product_id, d.average_cost, d.reorder_level, d.min_stock, d.max_stock, d.material_category_id, d.is_active;
