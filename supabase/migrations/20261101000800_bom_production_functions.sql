-- BOM workflow, production orders, reservations, execution and completion.

-- ===========================================================================
-- BOM workflow
-- ===========================================================================
create or replace function public.bom_create_version(p_product uuid, p_variant uuid default null, p_copy_from uuid default null)
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare v_org uuid; v_bom uuid; v_version int; v_src public.bills_of_materials;
begin
  select organization_id into v_org from public.products where id = p_product and deleted_at is null;
  if v_org is null then raise exception 'Product not found' using errcode = 'P0002'; end if;
  perform app.require_permission(v_org, 'bom.create');
  if p_variant is not null and not exists (select 1 from public.product_variants where id = p_variant and product_id = p_product) then
    raise exception 'Variant not found' using errcode = 'P0002';
  end if;
  if exists (select 1 from public.bills_of_materials where product_id = p_product and variant_id is not distinct from p_variant and status = 'draft') then
    perform app.raise_rule('A draft BOM already exists for this product. Edit or delete it first.');
  end if;
  select coalesce(max(version), 0) + 1 into v_version from public.bills_of_materials
  where product_id = p_product and variant_id is not distinct from p_variant;
  if p_copy_from is not null then
    select * into v_src from public.bills_of_materials where id = p_copy_from and organization_id = v_org;
    if v_src.id is null then raise exception 'Source BOM not found' using errcode = 'P0002'; end if;
  end if;
  insert into public.bills_of_materials (organization_id, product_id, variant_id, version, name, output_quantity, notes, based_on_id)
  values (v_org, p_product, p_variant, v_version, coalesce(v_src.name, 'Version ' || v_version),
          coalesce(v_src.output_quantity, 1), v_src.notes, v_src.id)
  returning id into v_bom;
  if v_src.id is not null then
    insert into public.bom_items (organization_id, bom_id, line_no, stock_item_id, quantity, wastage_pct, notes)
    select v_org, v_bom, line_no, stock_item_id, quantity, wastage_pct, notes from public.bom_items where bom_id = v_src.id;
  end if;
  return v_bom;
end $$;

create or replace function app.bom_set_status(p_bom uuid, p_status text) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform set_config('app.bom_transition', 'on', true);
  update public.bills_of_materials set status = p_status where id = p_bom;
  perform set_config('app.bom_transition', '', true);
end $$;

create or replace function public.bom_transition(p_bom uuid, p_action text, p_note text default null) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare b public.bills_of_materials;
begin
  select * into b from public.bills_of_materials where id = p_bom for update;
  if b.id is null then raise exception 'BOM not found' using errcode = 'P0002'; end if;
  if p_action = 'submit' then
    perform app.require_permission(b.organization_id, 'bom.update');
    if b.status <> 'draft' then perform app.raise_rule('Only draft BOMs can be submitted'); end if;
    if not exists (select 1 from public.bom_items where bom_id = p_bom) then perform app.raise_rule('Add at least one material before submitting'); end if;
    perform app.bom_set_status(p_bom, 'pending_approval');
    update public.bills_of_materials set submitted_by = auth.uid(), submitted_at = now() where id = p_bom;
    perform app.notify_permission(b.organization_id, 'bom.approve', 'bom_approval', 'info', 'BOM awaiting approval',
      'Version ' || b.version || ' of ' || (select name from public.products where id = b.product_id),
      '/commerce/boms/' || p_bom, 'bills_of_materials', p_bom);
  elsif p_action = 'approve' then
    perform app.require_permission(b.organization_id, 'bom.approve');
    if b.status not in ('pending_approval', 'draft') then perform app.raise_rule('This BOM cannot be approved from its current status'); end if;
    if not exists (select 1 from public.bom_items where bom_id = p_bom) then perform app.raise_rule('A BOM needs at least one material'); end if;
    perform set_config('app.bom_transition', 'on', true);
    update public.bills_of_materials set status = 'superseded'
    where product_id = b.product_id and variant_id is not distinct from b.variant_id and status = 'approved' and id <> p_bom;
    perform set_config('app.bom_transition', '', true);
    perform app.bom_set_status(p_bom, 'approved');
    update public.bills_of_materials set approved_by = auth.uid(), approved_at = now(),
      effective_from = coalesce(effective_from, current_date) where id = p_bom;
  elsif p_action = 'reject' then
    perform app.require_permission(b.organization_id, 'bom.approve');
    if b.status <> 'pending_approval' then perform app.raise_rule('Only BOMs awaiting approval can be rejected'); end if;
    perform app.bom_set_status(p_bom, 'draft');
  elsif p_action = 'archive' then
    perform app.require_permission(b.organization_id, 'bom.approve');
    if b.status not in ('approved', 'superseded') then perform app.raise_rule('Only approved or superseded BOMs can be archived'); end if;
    perform app.bom_set_status(p_bom, 'archived');
  else
    perform app.raise_rule('Unknown BOM action');
  end if;
  perform app.audit(b.organization_id, 'bom_' || p_action, 'bills_of_materials', p_bom, coalesce(p_note, 'BOM ' || p_action),
    jsonb_build_object('status', b.status), null);
end $$;

-- Estimated unit cost of a stock item: average cost when stock has been valued,
-- otherwise the material's standard cost, otherwise (for sub-assemblies) the
-- rolled-up cost of its approved BOM. Depth-limited to prevent cycles.
create or replace function app.estimated_unit_cost(p_item uuid, p_depth int default 0) returns numeric
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare s public.stock_items; v numeric; v_bom public.bills_of_materials; v_product uuid;
begin
  select * into s from public.stock_items where id = p_item;
  if s.average_cost > 0 then return s.average_cost; end if;
  if s.material_id is not null then
    return coalesce((select standard_cost from public.materials where id = s.material_id), 0);
  end if;
  if p_depth >= 6 then return 0; end if;
  select product_id into v_product from public.product_variants where id = s.product_variant_id;
  select * into v_bom from public.bills_of_materials where product_id = v_product and status = 'approved'
    and (variant_id = s.product_variant_id or variant_id is null) order by variant_id nulls last limit 1;
  if v_bom.id is null then return 0; end if;
  select coalesce(sum(bi.quantity * (1 + bi.wastage_pct / 100) * app.estimated_unit_cost(bi.stock_item_id, p_depth + 1)), 0) / v_bom.output_quantity
    into v from public.bom_items bi where bi.bom_id = v_bom.id;
  return v;
end $$;

create or replace function public.bom_cost_estimate(p_bom uuid)
returns table (bom_item_id uuid, line_no int, stock_item_id uuid, code text, name text, uom_code text, quantity numeric,
               wastage_pct numeric, gross_quantity numeric, unit_cost numeric, line_cost numeric, cost_per_output_unit numeric)
language plpgsql stable security definer set search_path = public, pg_temp as $$
#variable_conflict use_column
declare b public.bills_of_materials; v_costs boolean;
begin
  select * into b from public.bills_of_materials where id = p_bom;
  if b.id is null then raise exception 'BOM not found' using errcode = 'P0002'; end if;
  if not app.has_any(b.organization_id, array['bom.read', 'production_orders.read']) then
    raise exception 'missing permission: bom.read' using errcode = '42501';
  end if;
  v_costs := app.has_permission(b.organization_id, 'costing.read');
  return query
  select bi.id, bi.line_no, bi.stock_item_id, d.code, d.name, d.uom_code, bi.quantity, bi.wastage_pct,
         round(bi.quantity * (1 + bi.wastage_pct / 100), 6),
         case when v_costs then round(app.estimated_unit_cost(bi.stock_item_id), 6) end,
         case when v_costs then round(bi.quantity * (1 + bi.wastage_pct / 100) * app.estimated_unit_cost(bi.stock_item_id), 4) end,
         case when v_costs then round(bi.quantity * (1 + bi.wastage_pct / 100) * app.estimated_unit_cost(bi.stock_item_id) / b.output_quantity, 4) end
  from public.bom_items bi join public.stock_item_details d on d.id = bi.stock_item_id
  where bi.bom_id = p_bom order by bi.line_no;
end $$;

-- ===========================================================================
-- Production orders
-- ===========================================================================
create or replace function app.po_set(p_order uuid, p_status text, p_note text default null) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_old text; v_org uuid;
begin
  select status, organization_id into v_old, v_org from public.production_orders where id = p_order;
  if v_old = p_status then return; end if;
  perform set_config('app.po_workflow', 'on', true);
  update public.production_orders set status = p_status,
    actual_start_at = case when p_status = 'in_progress' then coalesce(actual_start_at, now()) else actual_start_at end,
    actual_end_at = case when p_status in ('completed', 'cancelled') then now() else actual_end_at end
  where id = p_order;
  perform set_config('app.po_workflow', '', true);
  insert into public.production_order_status_history (organization_id, production_order_id, from_status, to_status, note)
  values (v_org, p_order, v_old, p_status, p_note);
  insert into public.production_logs (organization_id, production_order_id, log_type, message, metadata)
  values (v_org, p_order, 'status', coalesce(p_note, replace(p_status, '_', ' ')),
          jsonb_build_object('from', v_old, 'to', p_status));
end $$;

create or replace function public.production_order_create(p_org uuid, p jsonb) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_order uuid; v_product public.products; v_variant uuid; v_factory public.factories; v_bom public.bills_of_materials;
  v_qty numeric := (p ->> 'quantity')::numeric; v_routing uuid; v_mat_wh uuid; v_out_wh uuid; v_number text;
  v_manager uuid := nullif(p ->> 'manager_id', '')::uuid;
begin
  perform app.require_permission(p_org, 'production_orders.create');
  if v_qty is null or v_qty <= 0 then perform app.raise_rule('Quantity must be greater than zero'); end if;
  select * into v_product from public.products where id = (p ->> 'product_id')::uuid and organization_id = p_org and deleted_at is null;
  if v_product.id is null then raise exception 'Product not found' using errcode = 'P0002'; end if;
  if v_product.status <> 'active' then perform app.raise_rule('Only active products can be produced'); end if;
  v_variant := coalesce(nullif(p ->> 'variant_id', '')::uuid,
                        (select id from public.product_variants where product_id = v_product.id and is_default));
  if not exists (select 1 from public.product_variants where id = v_variant and product_id = v_product.id and is_active) then
    raise exception 'Variant not found' using errcode = 'P0002';
  end if;
  select * into v_factory from public.factories where id = (p ->> 'factory_id')::uuid and organization_id = p_org and deleted_at is null;
  if v_factory.id is null then raise exception 'Factory not found' using errcode = 'P0002'; end if;
  select * into v_bom from public.bills_of_materials
  where product_id = v_product.id and status = 'approved' and (variant_id = v_variant or variant_id is null)
  order by variant_id nulls last limit 1;
  if v_bom.id is null then
    perform app.raise_rule('This product has no approved bill of materials. Approve a BOM before planning production.');
  end if;
  v_mat_wh := coalesce(nullif(p ->> 'material_warehouse_id', '')::uuid, v_factory.default_warehouse_id);
  v_out_wh := coalesce(nullif(p ->> 'output_warehouse_id', '')::uuid, v_mat_wh);
  if v_mat_wh is null or v_out_wh is null then perform app.raise_rule('Choose a warehouse for materials and output'); end if;
  if v_manager is not null and not exists (select 1 from public.organization_members where organization_id = p_org and user_id = v_manager and status = 'active') then
    perform app.raise_rule('The assigned manager is not an active member');
  end if;
  v_routing := coalesce(nullif(p ->> 'routing_id', '')::uuid,
    (select id from public.routing_templates where organization_id = p_org and product_id = v_product.id and is_active order by created_at limit 1),
    (select id from public.routing_templates where organization_id = p_org and factory_id = v_factory.id and product_id is null and is_active order by created_at limit 1),
    (select id from public.routing_templates where organization_id = p_org and is_default));
  if v_routing is null or not exists (select 1 from public.routing_steps where routing_id = v_routing) then
    perform app.raise_rule('No routing with steps is configured. Set up production stages first.');
  end if;

  v_number := app.next_doc_number(p_org, 'production_order', 'PRD-');
  insert into public.production_orders (
    organization_id, number, factory_id, product_id, variant_id, bom_id, bom_version, routing_id, source, source_reference,
    quantity_planned, priority, planned_start_date, due_date, manager_id, material_warehouse_id, output_warehouse_id, notes, bom_snapshot)
  values (p_org, v_number, v_factory.id, v_product.id, v_variant, v_bom.id, v_bom.version, v_routing,
          coalesce(nullif(p ->> 'source', ''), 'manual'), nullif(p ->> 'source_reference', ''), v_qty,
          coalesce(nullif(p ->> 'priority', ''), 'normal'), nullif(p ->> 'planned_start_date', '')::date,
          nullif(p ->> 'due_date', '')::date, v_manager, v_mat_wh, v_out_wh, nullif(p ->> 'notes', ''),
          jsonb_build_object(
            'bom_id', v_bom.id, 'version', v_bom.version, 'output_quantity', v_bom.output_quantity, 'approved_at', v_bom.approved_at,
            'lines', (select jsonb_agg(jsonb_build_object('line_no', bi.line_no, 'stock_item_id', bi.stock_item_id, 'code', d.code,
                       'name', d.name, 'uom', d.uom_code, 'quantity', bi.quantity, 'wastage_pct', bi.wastage_pct) order by bi.line_no)
                      from public.bom_items bi join public.stock_item_details d on d.id = bi.stock_item_id where bi.bom_id = v_bom.id)))
  returning id into v_order;

  insert into public.production_order_materials (organization_id, production_order_id, line_no, bom_item_id, stock_item_id,
    quantity_per_unit, wastage_pct, quantity_required, estimated_unit_cost)
  select p_org, v_order, bi.line_no, bi.id, bi.stock_item_id, bi.quantity / v_bom.output_quantity, bi.wastage_pct,
         round(v_qty * bi.quantity / v_bom.output_quantity * (1 + bi.wastage_pct / 100), 4),
         app.estimated_unit_cost(bi.stock_item_id)
  from public.bom_items bi where bi.bom_id = v_bom.id;

  insert into public.production_operations (organization_id, production_order_id, sequence, stage_id, work_centre_id, name,
    instructions, requires_quality_check, standard_minutes_per_unit)
  select p_org, v_order, rs.sequence, rs.stage_id, rs.work_centre_id, rs.name, rs.instructions, rs.requires_quality_check,
         rs.standard_minutes_per_unit
  from public.routing_steps rs where rs.routing_id = v_routing order by rs.sequence;

  insert into public.production_order_status_history (organization_id, production_order_id, from_status, to_status, note)
  values (p_org, v_order, null, 'draft', 'Created');
  perform app.audit(p_org, 'create', 'production_orders', v_order, 'Production order ' || v_number || ' created');

  if coalesce((p ->> 'submit')::boolean, false) then
    perform public.production_order_transition(v_order, 'awaiting_approval', null);
  end if;
  return v_order;
end $$;

-- Reserve as much of the outstanding requirement as is available.
create or replace function public.production_order_reserve(p_order uuid)
returns table (stock_item_id uuid, name text, required numeric, reserved numeric, issued numeric, shortage numeric)
language plpgsql security definer set search_path = public, pg_temp as $$
#variable_conflict use_column
declare o public.production_orders; m public.production_order_materials; b public.inventory_balances; v_need numeric; v_take numeric;
begin
  select * into o from public.production_orders where id = p_order for update;
  if o.id is null then raise exception 'Order not found' using errcode = 'P0002'; end if;
  if not app.has_any(o.organization_id, array['production_orders.approve', 'production_orders.manage', 'production_orders.update']) then
    raise exception 'missing permission: production_orders.manage' using errcode = '42501';
  end if;
  if o.status not in ('approved', 'materials_pending', 'ready_to_start', 'in_progress', 'paused') then
    perform app.raise_rule('Materials can only be reserved for approved orders that are not finished');
  end if;
  for m in select * from public.production_order_materials where production_order_id = p_order order by line_no for update loop
    v_need := greatest(m.quantity_required - m.quantity_issued - m.quantity_reserved, 0);
    if v_need > 0 then
      b := app.lock_balance(o.organization_id, m.stock_item_id, o.material_warehouse_id);
      v_take := least(v_need, greatest(b.available, 0));
      if v_take > 0 then
        update public.inventory_balances set reserved = reserved + v_take, updated_at = now()
        where stock_item_id = m.stock_item_id and warehouse_id = o.material_warehouse_id;
        insert into public.material_reservations (organization_id, production_order_id, production_order_material_id, stock_item_id, warehouse_id, quantity)
        values (o.organization_id, p_order, m.id, m.stock_item_id, o.material_warehouse_id, v_take)
        on conflict (production_order_material_id, warehouse_id)
        do update set quantity = material_reservations.quantity + excluded.quantity, status = 'active', updated_at = now();
        update public.production_order_materials set quantity_reserved = quantity_reserved + v_take where id = m.id;
      end if;
    end if;
  end loop;

  if o.status in ('approved', 'materials_pending', 'ready_to_start') then
    if exists (select 1 from public.production_order_materials x where x.production_order_id = p_order
               and x.quantity_reserved + x.quantity_issued < x.quantity_required) then
      if o.status <> 'materials_pending' then
        perform app.po_set(p_order, 'materials_pending', 'Waiting for materials');
        perform app.notify_permission(o.organization_id, 'inventory.create', 'material_shortage', 'warning',
          'Materials short for ' || o.number, 'Some materials could not be reserved. Check the order for shortages.',
          '/operations/production-orders/' || p_order, 'production_orders', p_order, 'shortage:' || p_order || ':' || current_date);
      end if;
    else
      perform app.po_set(p_order, 'ready_to_start', 'All materials reserved');
    end if;
  end if;

  return query
  select x.stock_item_id, d.name, x.quantity_required, x.quantity_reserved, x.quantity_issued,
         greatest(x.quantity_required - x.quantity_reserved - x.quantity_issued, 0)
  from public.production_order_materials x join public.stock_item_details d on d.id = x.stock_item_id
  where x.production_order_id = p_order order by x.line_no;
end $$;

create or replace function app.release_reservations(p_order uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare r public.material_reservations;
begin
  for r in select * from public.material_reservations where production_order_id = p_order and status = 'active' and quantity > 0
           order by stock_item_id, warehouse_id for update loop
    perform app.lock_balance(r.organization_id, r.stock_item_id, r.warehouse_id);
    update public.inventory_balances set reserved = greatest(reserved - r.quantity, 0), updated_at = now()
    where stock_item_id = r.stock_item_id and warehouse_id = r.warehouse_id;
    update public.material_reservations set quantity = 0, status = 'released', updated_at = now() where id = r.id;
    update public.production_order_materials set quantity_reserved = greatest(quantity_reserved - r.quantity, 0)
    where id = r.production_order_material_id;
  end loop;
end $$;

create or replace function public.production_order_transition(p_order uuid, p_to text, p_note text default null) returns text
language plpgsql security definer set search_path = public, pg_temp as $$
declare o public.production_orders; v_req_approval boolean; v_open numeric;
begin
  select * into o from public.production_orders where id = p_order for update;
  if o.id is null then raise exception 'Order not found' using errcode = 'P0002'; end if;
  if not app.is_member(o.organization_id) then raise exception 'Order not found' using errcode = 'P0002'; end if;
  select require_production_approval into v_req_approval from public.organization_settings where organization_id = o.organization_id;

  if o.status = p_to then return o.status; end if;
  if o.status in ('completed', 'cancelled') then perform app.raise_rule('Completed or cancelled orders cannot change status'); end if;

  if p_to = 'awaiting_approval' and o.status = 'draft' then
    perform app.require_permission(o.organization_id, 'production_orders.update');
    perform app.po_set(p_order, p_to, coalesce(p_note, 'Submitted for approval'));
    perform app.notify_permission(o.organization_id, 'production_orders.approve', 'production_approval', 'info',
      o.number || ' awaiting approval', null, '/operations/production-orders/' || p_order, 'production_orders', p_order);
  elsif p_to = 'approved' and (o.status = 'awaiting_approval' or (o.status = 'draft' and not v_req_approval)) then
    perform app.require_permission(o.organization_id, 'production_orders.approve');
    perform set_config('app.po_workflow', 'on', true);
    update public.production_orders set approved_by = auth.uid(), approved_at = now() where id = p_order;
    perform set_config('app.po_workflow', '', true);
    perform app.po_set(p_order, 'approved', coalesce(p_note, 'Approved'));
    perform public.production_order_reserve(p_order);
    if o.manager_id is not null and o.manager_id <> auth.uid() then
      perform app.notify_user(o.organization_id, o.manager_id, 'production_assignment', 'info',
        o.number || ' approved', 'You are the assigned manager.', '/operations/production-orders/' || p_order, 'production_orders', p_order);
    end if;
  elsif p_to = 'draft' and o.status = 'awaiting_approval' then
    perform app.require_permission(o.organization_id, 'production_orders.approve');
    perform app.po_set(p_order, 'draft', coalesce(p_note, 'Returned to draft'));
  elsif p_to = 'ready_to_start' and o.status = 'materials_pending' then
    perform public.production_order_reserve(p_order);
  elsif p_to = 'in_progress' and o.status in ('ready_to_start', 'paused') then
    perform app.require_permission(o.organization_id, 'production_orders.update');
    perform app.po_set(p_order, 'in_progress', coalesce(p_note, case when o.status = 'paused' then 'Resumed' else 'Started' end));
  elsif p_to = 'in_progress' and o.status = 'materials_pending' then
    perform app.require_permission(o.organization_id, 'production_orders.approve');
    if coalesce(trim(p_note), '') = '' then perform app.raise_rule('Explain why production is starting with material shortages'); end if;
    perform app.po_set(p_order, 'in_progress', 'Started with shortages: ' || p_note);
    perform app.audit(o.organization_id, 'start_with_shortage', 'production_orders', p_order, p_note);
  elsif p_to = 'in_progress' and o.status = 'quality_inspection' then
    perform app.require_permission(o.organization_id, 'production_orders.update');
    perform app.po_set(p_order, 'in_progress', coalesce(p_note, 'Returned to production from inspection'));
  elsif p_to = 'paused' and o.status = 'in_progress' then
    perform app.require_permission(o.organization_id, 'production_orders.update');
    perform app.po_set(p_order, 'paused', coalesce(p_note, 'Paused'));
  elsif p_to = 'quality_inspection' and o.status = 'in_progress' then
    perform app.require_permission(o.organization_id, 'production_orders.update');
    perform app.po_set(p_order, 'quality_inspection', coalesce(p_note, 'Sent to quality inspection'));
  elsif p_to = 'cancelled' then
    perform app.require_permission(o.organization_id, 'production_orders.delete');
    if coalesce(trim(p_note), '') = '' then perform app.raise_rule('A reason is required to cancel an order'); end if;
    select coalesce(sum(quantity_issued - quantity_returned - quantity_wasted), 0) into v_open
    from public.production_order_materials where production_order_id = p_order;
    if v_open > 0 then
      perform app.raise_rule('Materials issued to this order are still unaccounted for. Return them to stock or record them as wastage before cancelling.');
    end if;
    perform app.release_reservations(p_order);
    update public.job_cards set status = 'cancelled', updated_at = now() where production_order_id = p_order and status not in ('completed', 'cancelled');
    perform set_config('app.po_workflow', 'on', true);
    update public.production_orders set cancel_reason = p_note where id = p_order;
    perform set_config('app.po_workflow', '', true);
    perform app.po_set(p_order, 'cancelled', 'Cancelled: ' || p_note);
  elsif p_to = 'completed' then
    perform app.raise_rule('Use "Complete order" to record final output');
  else
    perform app.raise_rule(format('Cannot move an order from %s to %s', replace(o.status, '_', ' '), replace(p_to, '_', ' ')));
  end if;

  return (select status from public.production_orders where id = p_order);
end $$;

-- Issue materials from the material warehouse to the order.
-- p_lines: [{ "material_id": production_order_materials.id, "quantity": n }]; null issues all reserved.
create or replace function public.production_issue_materials(p_order uuid, p_lines jsonb default null, p_operation uuid default null, p_idem text default null)
returns int language plpgsql security definer set search_path = public, pg_temp as $$
declare
  o public.production_orders; m public.production_order_materials; r public.material_reservations;
  v_qty numeric; v_from_res numeric; v_txn public.inventory_transactions; n int := 0; l jsonb;
begin
  select * into o from public.production_orders where id = p_order for update;
  if o.id is null then raise exception 'Order not found' using errcode = 'P0002'; end if;
  perform app.require_permission(o.organization_id, 'production_orders.manage');
  if o.status not in ('materials_pending', 'ready_to_start', 'in_progress', 'paused', 'quality_inspection') then
    perform app.raise_rule('Materials can only be issued to approved orders that are not finished');
  end if;
  if p_operation is not null and not exists (select 1 from public.production_operations where id = p_operation and production_order_id = p_order) then
    raise exception 'Operation not found' using errcode = 'P0002';
  end if;
  if p_idem is not null and exists (select 1 from public.inventory_transactions where organization_id = o.organization_id and idempotency_key like p_idem || ':%') then
    return 0;
  end if;

  for m in select * from public.production_order_materials where production_order_id = p_order order by line_no for update loop
    if p_lines is null then
      v_qty := m.quantity_reserved;
    else
      select (x ->> 'quantity')::numeric into v_qty from jsonb_array_elements(p_lines) x where (x ->> 'material_id')::uuid = m.id;
    end if;
    continue when v_qty is null or v_qty = 0;
    if v_qty < 0 then perform app.raise_rule('Issue quantities must be positive'); end if;

    -- consume the reservation first
    v_from_res := least(v_qty, m.quantity_reserved);
    if v_from_res > 0 then
      select * into r from public.material_reservations where production_order_material_id = m.id and warehouse_id = o.material_warehouse_id for update;
      perform app.lock_balance(o.organization_id, m.stock_item_id, o.material_warehouse_id);
      update public.inventory_balances set reserved = greatest(reserved - v_from_res, 0)
      where stock_item_id = m.stock_item_id and warehouse_id = o.material_warehouse_id;
      update public.material_reservations set quantity = quantity - v_from_res,
        status = case when quantity - v_from_res <= 0 then 'fulfilled' else status end, updated_at = now() where id = r.id;
    end if;
    -- the unreserved remainder must come from available stock
    v_txn := app.post_inventory_txn(o.organization_id, m.stock_item_id, o.material_warehouse_id, 'production_issue', -v_qty, null,
               'average', 'available', false, 'production_order', p_order, p_order, p_operation, null, null,
               'Issued to ' || o.number, null, case when p_idem is null then null else p_idem || ':' || m.line_no end);
    update public.production_order_materials
    set quantity_reserved = quantity_reserved - v_from_res, quantity_issued = quantity_issued + v_qty,
        issued_cost = issued_cost + (-v_txn.total_cost)
    where id = m.id;
    insert into public.production_logs (organization_id, production_order_id, operation_id, log_type, quantity_good, message, metadata)
    values (o.organization_id, p_order, p_operation, 'material_issue', v_qty, 'Material issued',
            jsonb_build_object('stock_item_id', m.stock_item_id, 'transaction_id', v_txn.id));
    n := n + 1;
  end loop;
  if n = 0 then perform app.raise_rule('Nothing to issue. Reserve materials or enter quantities first.'); end if;
  return n;
end $$;

create or replace function public.production_return_materials(p_order uuid, p_lines jsonb, p_idem text default null)
returns int language plpgsql security definer set search_path = public, pg_temp as $$
declare o public.production_orders; m public.production_order_materials; v_qty numeric; v_cost numeric; v_txn public.inventory_transactions; n int := 0;
begin
  select * into o from public.production_orders where id = p_order for update;
  if o.id is null then raise exception 'Order not found' using errcode = 'P0002'; end if;
  perform app.require_permission(o.organization_id, 'production_orders.manage');
  if o.status = 'cancelled' then perform app.raise_rule('Order is cancelled'); end if;
  if p_idem is not null and exists (select 1 from public.inventory_transactions where organization_id = o.organization_id and idempotency_key like p_idem || ':%') then
    return 0;
  end if;
  for m in select * from public.production_order_materials where production_order_id = p_order order by line_no for update loop
    select (x ->> 'quantity')::numeric into v_qty from jsonb_array_elements(p_lines) x where (x ->> 'material_id')::uuid = m.id;
    continue when v_qty is null or v_qty = 0;
    if v_qty < 0 then perform app.raise_rule('Return quantities must be positive'); end if;
    if v_qty > m.quantity_issued - m.quantity_returned - m.quantity_wasted then
      perform app.raise_rule('Cannot return more than was issued and not yet used or wasted');
    end if;
    v_cost := case when m.quantity_issued > 0 then m.issued_cost / m.quantity_issued else 0 end;
    v_txn := app.post_inventory_txn(o.organization_id, m.stock_item_id, o.material_warehouse_id, 'production_return', v_qty, v_cost,
               'given', 'none', false, 'production_order', p_order, p_order, null, null, null, 'Returned from ' || o.number, null,
               case when p_idem is null then null else p_idem || ':' || m.line_no end);
    update public.production_order_materials set quantity_returned = quantity_returned + v_qty, returned_cost = returned_cost + v_txn.total_cost
    where id = m.id;
    insert into public.production_logs (organization_id, production_order_id, log_type, quantity_good, message, metadata)
    values (o.organization_id, p_order, 'material_return', v_qty, 'Material returned to stock', jsonb_build_object('stock_item_id', m.stock_item_id));
    n := n + 1;
  end loop;
  if n = 0 then perform app.raise_rule('Enter at least one quantity to return'); end if;
  return n;
end $$;

create or replace function public.production_record_wastage(p_order uuid, p_material uuid, p_quantity numeric, p_reason text, p_operation uuid default null)
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare o public.production_orders; m public.production_order_materials; v_id uuid;
begin
  select * into o from public.production_orders where id = p_order for update;
  if o.id is null then raise exception 'Order not found' using errcode = 'P0002'; end if;
  perform app.require_permission(o.organization_id, 'production_orders.update');
  if o.status not in ('in_progress', 'paused', 'quality_inspection', 'ready_to_start', 'materials_pending') then
    perform app.raise_rule('Wastage can only be recorded on active orders');
  end if;
  select * into m from public.production_order_materials where id = p_material and production_order_id = p_order for update;
  if m.id is null then raise exception 'Material line not found' using errcode = 'P0002'; end if;
  if p_quantity is null or p_quantity <= 0 then perform app.raise_rule('Wastage quantity must be greater than zero'); end if;
  if coalesce(trim(p_reason), '') = '' then perform app.raise_rule('Give a reason for the wastage'); end if;
  if p_quantity > m.quantity_issued - m.quantity_returned - m.quantity_wasted then
    perform app.raise_rule('Wastage cannot exceed material issued to the order and not returned');
  end if;
  insert into public.production_scrap (organization_id, production_order_id, production_order_material_id, operation_id, stock_item_id, quantity, reason)
  values (o.organization_id, p_order, p_material, p_operation, m.stock_item_id, p_quantity, p_reason) returning id into v_id;
  update public.production_order_materials set quantity_wasted = quantity_wasted + p_quantity where id = p_material;
  insert into public.production_logs (organization_id, production_order_id, operation_id, log_type, quantity_rejected, message, metadata)
  values (o.organization_id, p_order, p_operation, 'wastage', p_quantity, p_reason, jsonb_build_object('stock_item_id', m.stock_item_id));
  perform app.audit(o.organization_id, 'record_wastage', 'production_orders', p_order, p_reason, null,
    jsonb_build_object('stock_item_id', m.stock_item_id, 'quantity', p_quantity));
  return v_id;
end $$;

-- ===========================================================================
-- Operations and progress
-- ===========================================================================
create or replace function app.record_operation_progress(
  p_op uuid, p_good numeric, p_rejected numeric, p_message text, p_job_card uuid, p_client_ref text
) returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare op public.production_operations; prev_good numeric; o public.production_orders;
begin
  select * into op from public.production_operations where id = p_op for update;
  select * into o from public.production_orders where id = op.production_order_id;
  if o.status not in ('in_progress') then
    perform app.raise_rule('Progress can only be recorded while the order is in progress (current: ' || replace(o.status, '_', ' ') || ')');
  end if;
  if coalesce(p_good, 0) < 0 or coalesce(p_rejected, 0) < 0 then perform app.raise_rule('Quantities cannot be negative'); end if;
  if coalesce(p_good, 0) + coalesce(p_rejected, 0) = 0 then perform app.raise_rule('Enter a completed or rejected quantity'); end if;
  if op.status in ('completed', 'skipped') then perform app.raise_rule('This operation is already closed'); end if;
  select quantity_completed into prev_good from public.production_operations
  where production_order_id = op.production_order_id and sequence < op.sequence and status <> 'skipped'
  order by sequence desc limit 1;
  if prev_good is not null and op.quantity_completed + coalesce(p_good, 0) + op.quantity_rejected + coalesce(p_rejected, 0) > prev_good then
    perform app.raise_rule(format('Only %s units have passed the previous step, so this step cannot process more than that', round(prev_good, 2)));
  end if;
  if op.quantity_completed + coalesce(p_good, 0) + op.quantity_rejected + coalesce(p_rejected, 0) > o.quantity_planned * 1.1 then
    perform app.raise_rule('Recorded quantity exceeds the planned quantity by more than 10%');
  end if;
  update public.production_operations
  set quantity_completed = quantity_completed + coalesce(p_good, 0), quantity_rejected = quantity_rejected + coalesce(p_rejected, 0),
      status = case when status = 'pending' then 'in_progress' else status end,
      started_at = coalesce(started_at, now()), updated_at = now()
  where id = p_op;
  insert into public.production_logs (organization_id, production_order_id, operation_id, job_card_id, log_type, quantity_good, quantity_rejected, message, client_ref)
  values (op.organization_id, op.production_order_id, p_op, p_job_card, case when coalesce(p_rejected, 0) > 0 and coalesce(p_good, 0) = 0 then 'defect' else 'progress' end,
          coalesce(p_good, 0), coalesce(p_rejected, 0), p_message, p_client_ref);
end $$;

create or replace function public.production_operation_action(
  p_op uuid, p_action text, p_good numeric default null, p_rejected numeric default null, p_message text default null
) returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare op public.production_operations; o public.production_orders; v_open int;
begin
  select * into op from public.production_operations where id = p_op for update;
  if op.id is null then raise exception 'Operation not found' using errcode = 'P0002'; end if;
  perform app.require_permission(op.organization_id, 'production_orders.update');
  select * into o from public.production_orders where id = op.production_order_id for update;
  if p_action = 'progress' then
    perform app.record_operation_progress(p_op, p_good, p_rejected, p_message, null, null);
  elsif p_action = 'start' then
    if o.status = 'ready_to_start' then perform public.production_order_transition(o.id, 'in_progress', 'Started'); end if;
    if (select status from public.production_orders where id = o.id) <> 'in_progress' then perform app.raise_rule('The order must be in progress'); end if;
    update public.production_operations set status = 'in_progress', started_at = coalesce(started_at, now()), updated_at = now()
    where id = p_op and status in ('pending', 'paused');
    insert into public.production_logs (organization_id, production_order_id, operation_id, log_type, message)
    values (op.organization_id, o.id, p_op, 'start', coalesce(p_message, op.name || ' started'));
  elsif p_action = 'pause' then
    update public.production_operations set status = 'paused', updated_at = now() where id = p_op and status = 'in_progress';
    insert into public.production_logs (organization_id, production_order_id, operation_id, log_type, message)
    values (op.organization_id, o.id, p_op, 'pause', coalesce(p_message, op.name || ' paused'));
  elsif p_action = 'complete' then
    if op.status in ('completed', 'skipped') then perform app.raise_rule('Already closed'); end if;
    if op.quantity_completed = 0 and op.quantity_rejected = 0 then perform app.raise_rule('Record the quantity processed before completing this step'); end if;
    update public.production_operations set status = 'completed', completed_at = now(), started_at = coalesce(started_at, now()), updated_at = now() where id = p_op;
    update public.job_cards set status = 'completed', completed_at = now(), updated_at = now() where operation_id = p_op and status not in ('completed', 'cancelled');
    insert into public.production_logs (organization_id, production_order_id, operation_id, log_type, quantity_good, message)
    values (op.organization_id, o.id, p_op, 'transfer', op.quantity_completed, coalesce(p_message, op.name || ' completed; moved to next step'));
    -- last step finished -> quality inspection
    select count(*) into v_open from public.production_operations where production_order_id = o.id and status not in ('completed', 'skipped');
    if v_open = 0 and o.status = 'in_progress' then
      perform app.po_set(o.id, 'quality_inspection', 'All production steps completed');
    end if;
  elsif p_action = 'skip' then
    perform app.require_permission(op.organization_id, 'production_orders.approve');
    if op.quantity_completed > 0 then perform app.raise_rule('Steps with recorded output cannot be skipped'); end if;
    update public.production_operations set status = 'skipped', updated_at = now() where id = p_op and status = 'pending';
    insert into public.production_logs (organization_id, production_order_id, operation_id, log_type, message)
    values (op.organization_id, o.id, p_op, 'note', coalesce(p_message, op.name || ' skipped'));
  else
    perform app.raise_rule('Unknown action');
  end if;
end $$;

create or replace function public.production_record_downtime(p_order uuid, p_operation uuid, p_minutes int, p_reason text)
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare o public.production_orders; v_id uuid; v_wc uuid;
begin
  select * into o from public.production_orders where id = p_order;
  if o.id is null then raise exception 'Order not found' using errcode = 'P0002'; end if;
  perform app.require_permission(o.organization_id, 'production_orders.update');
  if p_minutes is null or p_minutes <= 0 then perform app.raise_rule('Downtime must be at least one minute'); end if;
  if coalesce(trim(p_reason), '') = '' then perform app.raise_rule('Give a reason for the downtime'); end if;
  select work_centre_id into v_wc from public.production_operations where id = p_operation and production_order_id = p_order;
  insert into public.downtime_logs (organization_id, production_order_id, operation_id, work_centre_id, reason, minutes, started_at)
  values (o.organization_id, p_order, p_operation, v_wc, p_reason, p_minutes, now() - make_interval(mins => p_minutes))
  returning id into v_id;
  insert into public.production_logs (organization_id, production_order_id, operation_id, log_type, message, metadata)
  values (o.organization_id, p_order, p_operation, 'downtime', p_reason, jsonb_build_object('minutes', p_minutes));
  return v_id;
end $$;

create or replace function public.production_add_note(p_order uuid, p_operation uuid, p_message text)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare o public.production_orders;
begin
  select * into o from public.production_orders where id = p_order;
  if o.id is null then raise exception 'Order not found' using errcode = 'P0002'; end if;
  perform app.require_permission(o.organization_id, 'production_orders.update');
  if coalesce(trim(p_message), '') = '' then perform app.raise_rule('Note cannot be empty'); end if;
  insert into public.production_logs (organization_id, production_order_id, operation_id, log_type, message)
  values (o.organization_id, p_order, p_operation, 'note', left(p_message, 2000));
end $$;

-- ===========================================================================
-- Job cards
-- ===========================================================================
create or replace function public.job_card_issue(p_operation uuid, p_assignee uuid, p_team text, p_target numeric, p_instructions text default null)
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare op public.production_operations; o public.production_orders; v_id uuid; v_code text;
begin
  select * into op from public.production_operations where id = p_operation;
  if op.id is null then raise exception 'Operation not found' using errcode = 'P0002'; end if;
  perform app.require_permission(op.organization_id, 'job_cards.create');
  select * into o from public.production_orders where id = op.production_order_id;
  if o.status in ('draft', 'awaiting_approval', 'completed', 'cancelled') then
    perform app.raise_rule('Job cards can only be issued for approved, unfinished orders');
  end if;
  if p_assignee is null and coalesce(trim(p_team), '') = '' then perform app.raise_rule('Assign the job card to a person or a team'); end if;
  if p_assignee is not null and not exists (select 1 from public.organization_members where organization_id = op.organization_id and user_id = p_assignee and status = 'active') then
    perform app.raise_rule('The assignee is not an active member');
  end if;
  if p_target is null or p_target <= 0 then perform app.raise_rule('Target quantity must be greater than zero'); end if;
  v_code := app.next_doc_number(op.organization_id, 'job_card', 'JC-');
  insert into public.job_cards (organization_id, code, production_order_id, operation_id, assigned_user_id, assigned_team, target_quantity, instructions)
  values (op.organization_id, v_code, o.id, p_operation, p_assignee, nullif(trim(p_team), ''), p_target, p_instructions)
  returning id into v_id;
  if p_assignee is not null then
    perform app.notify_user(op.organization_id, p_assignee, 'production_assignment', 'info', 'New job card ' || v_code,
      op.name || ' · ' || o.number || ' · target ' || p_target, '/floor/jobs/' || v_id, 'job_cards', v_id);
  end if;
  perform app.audit(op.organization_id, 'issue', 'job_cards', v_id, 'Job card ' || v_code || ' issued', null,
    jsonb_build_object('assignee', p_assignee, 'team', p_team, 'target', p_target));
  return v_id;
end $$;

-- Worker-facing action. Idempotent per p_client_ref so offline replays are safe.
create or replace function public.job_card_action(
  p_card uuid, p_action text, p_good numeric default null, p_rejected numeric default null,
  p_message text default null, p_client_ref text default null
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare c public.job_cards; o public.production_orders; op public.production_operations; v_can_all boolean;
begin
  select * into c from public.job_cards where id = p_card for update;
  if c.id is null then raise exception 'Job card not found' using errcode = 'P0002'; end if;
  v_can_all := app.has_permission(c.organization_id, 'job_cards.update');
  if not v_can_all and not (c.assigned_user_id = auth.uid() and app.has_permission(c.organization_id, 'job_cards.work')) then
    raise exception 'This job card is not assigned to you' using errcode = '42501';
  end if;
  if p_client_ref is not null and exists (select 1 from public.production_logs where organization_id = c.organization_id and client_ref = p_client_ref) then
    return jsonb_build_object('status', 'duplicate', 'job_card_status', c.status);
  end if;
  if c.status in ('completed', 'cancelled') then perform app.raise_rule('This job card is closed'); end if;
  select * into o from public.production_orders where id = c.production_order_id for update;
  select * into op from public.production_operations where id = c.operation_id;

  if p_action = 'start' or p_action = 'resume' then
    if o.status = 'ready_to_start' then perform app.po_set(o.id, 'in_progress', 'Started from job card ' || c.code);
    elsif o.status = 'paused' then perform app.raise_rule('The production order is paused. Ask your supervisor to resume it.');
    elsif o.status <> 'in_progress' then perform app.raise_rule('This order is not ready for production yet');
    end if;
    update public.job_cards set status = 'in_progress', started_at = coalesce(started_at, now()), updated_at = now() where id = p_card;
    update public.production_operations set status = 'in_progress', started_at = coalesce(started_at, now()), updated_at = now()
    where id = c.operation_id and status in ('pending', 'paused');
    insert into public.production_logs (organization_id, production_order_id, operation_id, job_card_id, log_type, message, client_ref)
    values (c.organization_id, o.id, c.operation_id, p_card, case when p_action = 'resume' then 'resume' else 'start' end,
            coalesce(p_message, c.code || ' ' || p_action), p_client_ref);
  elsif p_action = 'progress' or p_action = 'defect' then
    if c.status not in ('in_progress', 'paused') then perform app.raise_rule('Start the job before recording output'); end if;
    if p_action = 'defect' and coalesce(p_rejected, 0) <= 0 then perform app.raise_rule('Enter the number of defective units'); end if;
    perform app.record_operation_progress(c.operation_id, case when p_action = 'defect' then 0 else p_good end, p_rejected, p_message, p_card, p_client_ref);
    update public.job_cards set quantity_completed = quantity_completed + coalesce(case when p_action = 'defect' then 0 else p_good end, 0),
      quantity_rejected = quantity_rejected + coalesce(p_rejected, 0), status = 'in_progress', updated_at = now() where id = p_card;
    if p_action = 'defect' then
      perform app.notify_permission(c.organization_id, 'production_orders.update', 'quality_failure', 'warning',
        'Defects reported on ' || o.number, coalesce(p_message, p_rejected || ' defective units at ' || op.name),
        '/operations/production-orders/' || o.id, 'production_orders', o.id);
    end if;
  elsif p_action = 'shortage' then
    if coalesce(trim(p_message), '') = '' then perform app.raise_rule('Describe which material is short'); end if;
    insert into public.production_logs (organization_id, production_order_id, operation_id, job_card_id, log_type, message, client_ref)
    values (c.organization_id, o.id, c.operation_id, p_card, 'shortage', p_message, p_client_ref);
    perform app.notify_permission(c.organization_id, 'production_orders.manage', 'material_shortage', 'warning',
      'Shortage reported on ' || o.number, p_message, '/operations/production-orders/' || o.id, 'production_orders', o.id);
  elsif p_action = 'note' then
    if coalesce(trim(p_message), '') = '' then perform app.raise_rule('Note cannot be empty'); end if;
    insert into public.production_logs (organization_id, production_order_id, operation_id, job_card_id, log_type, message, client_ref)
    values (c.organization_id, o.id, c.operation_id, p_card, 'note', left(p_message, 2000), p_client_ref);
  elsif p_action = 'pause' then
    update public.job_cards set status = 'paused', updated_at = now() where id = p_card;
    insert into public.production_logs (organization_id, production_order_id, operation_id, job_card_id, log_type, message, client_ref)
    values (c.organization_id, o.id, c.operation_id, p_card, 'pause', coalesce(p_message, c.code || ' paused'), p_client_ref);
  elsif p_action = 'complete' then
    if c.quantity_completed = 0 and c.quantity_rejected = 0 and coalesce(p_good, 0) = 0 then
      perform app.raise_rule('Record the quantity you completed before finishing the job');
    end if;
    if coalesce(p_good, 0) > 0 or coalesce(p_rejected, 0) > 0 then
      perform app.record_operation_progress(c.operation_id, p_good, p_rejected, p_message, p_card, null);
      update public.job_cards set quantity_completed = quantity_completed + coalesce(p_good, 0),
        quantity_rejected = quantity_rejected + coalesce(p_rejected, 0) where id = p_card;
    end if;
    update public.job_cards set status = 'completed', completed_at = now(), updated_at = now() where id = p_card;
    insert into public.production_logs (organization_id, production_order_id, operation_id, job_card_id, log_type, message, client_ref)
    values (c.organization_id, o.id, c.operation_id, p_card, 'complete', coalesce(p_message, c.code || ' completed'), p_client_ref);
    if o.manager_id is not null then
      perform app.notify_user(c.organization_id, o.manager_id, 'job_completed', 'success', c.code || ' completed',
        op.name || ' · ' || o.number, '/operations/production-orders/' || o.id, 'job_cards', p_card);
    end if;
  else
    perform app.raise_rule('Unknown action');
  end if;
  select * into c from public.job_cards where id = p_card;
  return jsonb_build_object('status', 'ok', 'job_card_status', c.status,
    'quantity_completed', c.quantity_completed, 'quantity_rejected', c.quantity_rejected);
end $$;

-- Everything a worker needs for one job card, without costs.
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
    'assignee_name', (select full_name from public.profiles where id = c.assigned_user_id),
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

-- ===========================================================================
-- Completion: posts finished goods for accepted output only.
-- ===========================================================================
create or replace function public.production_order_complete(
  p_order uuid, p_good numeric, p_rejected numeric, p_note text default null,
  p_allow_material_exception boolean default false, p_idem text default null
) returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare
  o public.production_orders; m record; v_material_cost numeric; v_unit_cost numeric; v_item uuid;
  v_txn public.inventory_transactions; v_out uuid; v_total numeric := coalesce(p_good, 0) + coalesce(p_rejected, 0);
begin
  select * into o from public.production_orders where id = p_order for update;
  if o.id is null then raise exception 'Order not found' using errcode = 'P0002'; end if;
  perform app.require_permission(o.organization_id, 'production_orders.manage');
  if p_idem is not null then
    select id into v_out from public.production_outputs where production_order_id = p_order limit 1;
    if v_out is not null then return v_out; end if;
  end if;
  if o.status not in ('in_progress', 'quality_inspection') then
    perform app.raise_rule('Only orders in progress or in quality inspection can be completed');
  end if;
  if coalesce(p_good, 0) < 0 or coalesce(p_rejected, 0) < 0 or v_total = 0 then
    perform app.raise_rule('Enter the accepted and rejected quantities');
  end if;

  -- Output must be supported by material actually issued (net of returns).
  for m in select x.*, d.name from public.production_order_materials x join public.stock_item_details d on d.id = x.stock_item_id
           where x.production_order_id = p_order loop
    if v_total * m.quantity_per_unit > (m.quantity_issued - m.quantity_returned) + 0.0001 then
      if not p_allow_material_exception then
        perform app.raise_rule(format('Output of %s units needs %s of %s but only %s was issued. Issue the material, or record an approved exception.',
          round(v_total, 2), round(v_total * m.quantity_per_unit, 2), m.name, round(m.quantity_issued - m.quantity_returned, 2)));
      end if;
    end if;
  end loop;
  if p_allow_material_exception then
    perform app.require_permission(o.organization_id, 'production_orders.approve');
    if coalesce(trim(p_note), '') = '' then perform app.raise_rule('A note is required for a material exception'); end if;
    perform app.audit(o.organization_id, 'material_exception', 'production_orders', p_order, p_note);
  end if;

  select coalesce(sum(issued_cost - returned_cost), 0) into v_material_cost from public.production_order_materials where production_order_id = p_order;
  v_unit_cost := case when coalesce(p_good, 0) > 0 then v_material_cost / p_good else 0 end;
  select id into v_item from public.stock_items where product_variant_id = o.variant_id;

  if coalesce(p_good, 0) > 0 then
    v_txn := app.post_inventory_txn(o.organization_id, v_item, o.output_warehouse_id, 'finished_goods_receipt', p_good, v_unit_cost,
               'given', 'none', false, 'production_order', p_order, p_order, null, null, null, 'Output of ' || o.number, p_note,
               case when p_idem is null then null else p_idem || ':fg' end);
  end if;
  insert into public.production_outputs (organization_id, production_order_id, quantity_good, quantity_rejected, warehouse_id, unit_cost, material_cost, inventory_transaction_id)
  values (o.organization_id, p_order, coalesce(p_good, 0), coalesce(p_rejected, 0), o.output_warehouse_id, round(v_unit_cost, 6), v_material_cost, v_txn.id)
  returning id into v_out;

  perform app.release_reservations(p_order);
  update public.job_cards set status = 'completed', completed_at = coalesce(completed_at, now()), updated_at = now()
  where production_order_id = p_order and status not in ('completed', 'cancelled');
  perform set_config('app.po_workflow', 'on', true);
  update public.production_orders set quantity_completed = coalesce(p_good, 0), quantity_rejected = coalesce(p_rejected, 0) where id = p_order;
  perform set_config('app.po_workflow', '', true);
  insert into public.production_logs (organization_id, production_order_id, log_type, quantity_good, quantity_rejected, message)
  values (o.organization_id, p_order, 'output', coalesce(p_good, 0), coalesce(p_rejected, 0), coalesce(p_note, 'Final output recorded'));
  perform app.po_set(p_order, 'completed', format('Completed: %s accepted, %s rejected', round(coalesce(p_good, 0), 2), round(coalesce(p_rejected, 0), 2)));
  perform app.audit(o.organization_id, 'complete', 'production_orders', p_order, 'Production order ' || o.number || ' completed', null,
    jsonb_build_object('good', p_good, 'rejected', p_rejected, 'material_cost', v_material_cost, 'unit_cost', v_unit_cost));
  if o.manager_id is not null then
    perform app.notify_user(o.organization_id, o.manager_id, 'order_completed', 'success', o.number || ' completed',
      round(coalesce(p_good, 0), 2) || ' accepted units added to stock', '/operations/production-orders/' || p_order, 'production_orders', p_order);
  end if;
  return v_out;
end $$;

-- Planned vs actual material usage for an order.
create or replace view public.production_material_reconciliation with (security_invoker = true) as
select m.id, m.organization_id, m.production_order_id, m.line_no, m.stock_item_id, d.code, d.name, d.uom_code,
       m.quantity_per_unit, m.wastage_pct, m.quantity_required, m.quantity_reserved, m.quantity_issued, m.quantity_returned,
       m.quantity_wasted,
       m.quantity_issued - m.quantity_returned as quantity_consumed,
       round((o.quantity_completed + o.quantity_rejected) * m.quantity_per_unit, 4) as standard_for_actual_output,
       m.quantity_issued - m.quantity_returned - round((o.quantity_completed + o.quantity_rejected) * m.quantity_per_unit, 4) as usage_variance,
       m.estimated_unit_cost, m.issued_cost - m.returned_cost as actual_cost,
       round(m.quantity_required * m.estimated_unit_cost, 4) as estimated_cost
from public.production_order_materials m
join public.production_orders o on o.id = m.production_order_id
join public.stock_item_details d on d.id = m.stock_item_id;
