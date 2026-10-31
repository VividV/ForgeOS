-- Mission Control metrics, deterministic alert rules and scheduled checks.
-- Every number here is computed from ledger and production records.

create or replace function public.operational_alerts(p_org uuid, p_factory uuid default null)
returns table (kind text, severity text, title text, detail text, link text, entity_id uuid, occurred_at timestamptz)
language plpgsql stable security definer set search_path = public, pg_temp as $$
#variable_conflict use_column
declare v_tz text; v_today date; v_inv boolean; v_prod boolean;
begin
  perform app.require_permission(p_org, 'dashboard.read');
  select timezone into v_tz from public.organization_settings where organization_id = p_org;
  v_today := (now() at time zone coalesce(v_tz, 'UTC'))::date;
  v_inv := app.has_permission(p_org, 'inventory.read');
  v_prod := app.has_permission(p_org, 'production_orders.read');

  if v_prod then
    -- Overdue orders
    return query
    select 'overdue'::text, 'critical'::text, o.number || ' is overdue',
           format('%s · due %s · %s of %s done', p.name, to_char(o.due_date, 'DD Mon'), round(o.quantity_completed, 0), round(o.quantity_planned, 0)),
           '/operations/production-orders/' || o.id, o.id, o.due_date::timestamptz
    from public.production_orders o join public.products p on p.id = o.product_id
    where o.organization_id = p_org and o.due_date < v_today and o.status not in ('completed', 'cancelled', 'draft')
      and (p_factory is null or o.factory_id = p_factory);
    -- Waiting for materials
    return query
    select 'materials_pending', 'warning', o.number || ' is waiting for materials',
           (select string_agg(d.name, ', ') from public.production_order_materials m join public.stock_item_details d on d.id = m.stock_item_id
             where m.production_order_id = o.id and m.quantity_reserved + m.quantity_issued < m.quantity_required),
           '/operations/production-orders/' || o.id, o.id, o.updated_at
    from public.production_orders o
    where o.organization_id = p_org and o.status = 'materials_pending' and (p_factory is null or o.factory_id = p_factory);
    -- Consumption above BOM standard (net issued exceeds requirement by >5%)
    return query
    select 'over_consumption', 'warning', 'Material use above BOM on ' || o.number,
           format('%s: %s used vs %s planned', d.name, round(m.quantity_issued - m.quantity_returned, 2), round(m.quantity_required, 2)),
           '/operations/production-orders/' || o.id, o.id, o.updated_at
    from public.production_order_materials m
    join public.production_orders o on o.id = m.production_order_id
    join public.stock_item_details d on d.id = m.stock_item_id
    where o.organization_id = p_org and o.status <> 'cancelled' and (p_factory is null or o.factory_id = p_factory)
      and m.quantity_issued - m.quantity_returned > m.quantity_required * 1.05;
    -- Idle work centres: active operation assigned but no activity for 24h
    return query
    select 'idle_work_centre', 'warning', w.name || ' has been inactive',
           'Active work assigned but no production updates in the last 24 hours',
           '/operations/work-centres', w.id, max(l.occurred_at)
    from public.work_centres w
    join public.production_operations op on op.work_centre_id = w.id and op.status = 'in_progress'
    left join public.production_logs l on l.operation_id = op.id
    where w.organization_id = p_org and (p_factory is null or w.factory_id = p_factory)
    group by w.id, w.name
    having coalesce(max(l.occurred_at), min(op.started_at)) < now() - interval '24 hours';
    -- Rising rejection rate: last 7 days vs previous 7 days (min sample 20 units)
    return query
    with r as (
      select sum(case when l.occurred_at >= now() - interval '7 days' then coalesce(l.quantity_rejected, 0) end) as rej_now,
             sum(case when l.occurred_at >= now() - interval '7 days' then coalesce(l.quantity_rejected, 0) + coalesce(l.quantity_good, 0) end) as tot_now,
             sum(case when l.occurred_at < now() - interval '7 days' then coalesce(l.quantity_rejected, 0) end) as rej_prev,
             sum(case when l.occurred_at < now() - interval '7 days' then coalesce(l.quantity_rejected, 0) + coalesce(l.quantity_good, 0) end) as tot_prev
      from public.production_logs l join public.production_orders o on o.id = l.production_order_id
      where l.organization_id = p_org and l.log_type in ('progress', 'defect') and l.occurred_at >= now() - interval '14 days'
        and (p_factory is null or o.factory_id = p_factory))
    select 'rejection_rising', 'warning', 'Quality rejection has increased',
           format('%s%% rejected in the last 7 days vs %s%% the week before', round(100 * rej_now / tot_now, 1), round(100 * rej_prev / nullif(tot_prev, 0), 1)),
           '/intelligence/reports', null::uuid, now()
    from r where tot_now >= 20 and tot_prev >= 20 and rej_now / tot_now > 1.5 * (rej_prev / tot_prev) and rej_now / tot_now > 0.02;
  end if;

  if v_inv then
    return query
    select case when s.stock_status = 'out_of_stock' then 'out_of_stock' else 'low_stock' end,
           case when s.stock_status = 'out_of_stock' then 'critical' else 'warning' end,
           s.name || case when s.stock_status = 'out_of_stock' then ' is out of stock' else ' is below reorder level' end,
           format('Available %s %s · reorder level %s', round(s.available, 2), s.uom_code, round(greatest(s.reorder_level, s.min_stock), 2)),
           '/inventory/materials/' || s.material_id, s.material_id, s.last_movement_at
    from public.stock_levels s
    where s.organization_id = p_org and s.material_id is not null and s.is_active and s.stock_status in ('low', 'out_of_stock')
      and (greatest(s.reorder_level, s.min_stock) > 0 or s.last_movement_at is not null);
  end if;
end $$;

create or replace function public.dashboard_summary(p_org uuid, p_factory uuid default null, p_from date default null, p_to date default null)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_tz text; v_today date; v_from date; v_to date; v_costs boolean; v_inv boolean; v_prod boolean; v jsonb := '{}'::jsonb;
  v_start timestamptz; v_end timestamptz;
begin
  perform app.require_permission(p_org, 'dashboard.read');
  select timezone into v_tz from public.organization_settings where organization_id = p_org;
  v_tz := coalesce(v_tz, 'UTC');
  v_today := (now() at time zone v_tz)::date;
  v_to := coalesce(p_to, v_today);
  v_from := coalesce(p_from, v_to - 29);
  if v_to < v_from or v_to - v_from > 366 then perform app.raise_rule('Choose a date range of up to one year'); end if;
  v_start := (v_from::timestamp) at time zone v_tz;
  v_end := ((v_to + 1)::timestamp) at time zone v_tz;
  v_costs := app.has_permission(p_org, 'costing.read');
  v_inv := app.has_permission(p_org, 'inventory.read');
  v_prod := app.has_permission(p_org, 'production_orders.read');

  v := v || jsonb_build_object('range', jsonb_build_object('from', v_from, 'to', v_to, 'timezone', v_tz, 'today', v_today),
                               'can_see_costs', v_costs, 'can_see_inventory', v_inv, 'can_see_production', v_prod);

  if v_prod then
    v := v || jsonb_build_object('production', (
      select jsonb_build_object(
        'active_orders', count(*) filter (where status in ('approved', 'materials_pending', 'ready_to_start', 'in_progress', 'paused', 'quality_inspection')),
        'in_progress', count(*) filter (where status = 'in_progress'),
        'behind_schedule', count(*) filter (where due_date < v_today and status not in ('completed', 'cancelled', 'draft')),
        'materials_pending', count(*) filter (where status = 'materials_pending'),
        'awaiting_approval', count(*) filter (where status = 'awaiting_approval'),
        'completed_today', count(*) filter (where status = 'completed' and (actual_end_at at time zone v_tz)::date = v_today),
        'completed_in_range', count(*) filter (where status = 'completed' and actual_end_at >= v_start and actual_end_at < v_end),
        'on_time_in_range', count(*) filter (where status = 'completed' and actual_end_at >= v_start and actual_end_at < v_end
                                             and due_date is not null and (actual_end_at at time zone v_tz)::date <= due_date),
        'due_in_range_with_date', count(*) filter (where status = 'completed' and actual_end_at >= v_start and actual_end_at < v_end and due_date is not null))
      from public.production_orders where organization_id = p_org and (p_factory is null or factory_id = p_factory)));

    -- Planned vs actual for orders completed in range
    v := v || jsonb_build_object('output', (
      select jsonb_build_object(
        'planned_completed_orders', coalesce(sum(o.quantity_planned), 0),
        'accepted', coalesce(sum(po.quantity_good), 0),
        'rejected', coalesce(sum(po.quantity_rejected), 0))
      from public.production_outputs po join public.production_orders o on o.id = po.production_order_id
      where po.organization_id = p_org and po.recorded_at >= v_start and po.recorded_at < v_end
        and (p_factory is null or o.factory_id = p_factory)));

    -- Floor rejection rate from progress logs in range
    v := v || jsonb_build_object('quality', (
      select jsonb_build_object('good', coalesce(sum(l.quantity_good), 0), 'rejected', coalesce(sum(l.quantity_rejected), 0))
      from public.production_logs l join public.production_orders o on o.id = l.production_order_id
      where l.organization_id = p_org and l.log_type in ('progress', 'defect') and l.occurred_at >= v_start and l.occurred_at < v_end
        and (p_factory is null or o.factory_id = p_factory)));

    v := v || jsonb_build_object('output_by_day', coalesce((
      select jsonb_agg(jsonb_build_object('day', d::date, 'accepted', coalesce(x.good, 0), 'rejected', coalesce(x.rej, 0)) order by d)
      from generate_series(v_from, v_to, interval '1 day') d
      left join (select (po.recorded_at at time zone v_tz)::date as day, sum(po.quantity_good) good, sum(po.quantity_rejected) rej
                 from public.production_outputs po join public.production_orders o on o.id = po.production_order_id
                 where po.organization_id = p_org and po.recorded_at >= v_start and po.recorded_at < v_end
                   and (p_factory is null or o.factory_id = p_factory)
                 group by 1) x on x.day = d::date), '[]'::jsonb));

    v := v || jsonb_build_object('floor_output_by_day', coalesce((
      select jsonb_agg(jsonb_build_object('day', d::date, 'good', coalesce(x.good, 0), 'rejected', coalesce(x.rej, 0)) order by d)
      from generate_series(v_from, v_to, interval '1 day') d
      left join (select (l.occurred_at at time zone v_tz)::date as day, sum(l.quantity_good) good, sum(l.quantity_rejected) rej
                 from public.production_logs l join public.production_orders o on o.id = l.production_order_id
                 where l.organization_id = p_org and l.log_type in ('progress', 'defect') and l.occurred_at >= v_start and l.occurred_at < v_end
                   and (p_factory is null or o.factory_id = p_factory)
                 group by 1) x on x.day = d::date), '[]'::jsonb));

    v := v || jsonb_build_object('orders_by_status', coalesce((
      select jsonb_agg(jsonb_build_object('status', status, 'count', n) order by n desc)
      from (select status, count(*) n from public.production_orders
            where organization_id = p_org and (p_factory is null or factory_id = p_factory)
              and (status not in ('completed', 'cancelled') or actual_end_at >= v_start)
            group by status) s), '[]'::jsonb));

    v := v || jsonb_build_object('work_centres', coalesce((
      select jsonb_agg(jsonb_build_object('name', w.name, 'good', coalesce(x.good, 0), 'rejected', coalesce(x.rej, 0),
                                          'downtime_minutes', coalesce(dt.minutes, 0)) order by coalesce(x.good, 0) desc)
      from public.work_centres w
      left join (select op.work_centre_id, sum(l.quantity_good) good, sum(l.quantity_rejected) rej
                 from public.production_logs l join public.production_operations op on op.id = l.operation_id
                 where l.organization_id = p_org and l.log_type in ('progress', 'defect') and l.occurred_at >= v_start and l.occurred_at < v_end
                 group by 1) x on x.work_centre_id = w.id
      left join (select work_centre_id, sum(minutes) minutes from public.downtime_logs
                 where organization_id = p_org and started_at >= v_start and started_at < v_end group by 1) dt on dt.work_centre_id = w.id
      where w.organization_id = p_org and w.is_active and w.deleted_at is null and (p_factory is null or w.factory_id = p_factory)), '[]'::jsonb));

    -- Wastage: recorded wastage vs net material issued in range (quantity basis per line, value basis when allowed)
    v := v || jsonb_build_object('wastage', (
      select jsonb_build_object(
        'issued_qty_lines', count(*),
        'issued_value', case when v_costs then coalesce(sum(m.issued_cost - m.returned_cost), 0) end,
        'wasted_value', case when v_costs then coalesce(sum(m.quantity_wasted * case when m.quantity_issued > 0 then m.issued_cost / m.quantity_issued else 0 end), 0) end)
      from public.production_order_materials m join public.production_orders o on o.id = m.production_order_id
      where m.organization_id = p_org and m.quantity_issued > 0 and (p_factory is null or o.factory_id = p_factory)
        and o.updated_at >= v_start));
  end if;

  if v_inv then
    v := v || jsonb_build_object('inventory', (
      select jsonb_build_object(
        'materials_tracked', count(*) filter (where material_id is not null),
        'low_stock', count(*) filter (where material_id is not null and stock_status = 'low' and is_active),
        'out_of_stock', count(*) filter (where material_id is not null and stock_status = 'out_of_stock' and is_active and last_movement_at is not null),
        'raw_material_value', case when v_costs then coalesce(sum(stock_value) filter (where material_id is not null), 0) end,
        'finished_goods_value', case when v_costs then coalesce(sum(stock_value) filter (where product_variant_id is not null), 0) end)
      from public.stock_levels where organization_id = p_org));
    if v_costs then
      v := v || jsonb_build_object('inventory_by_category', coalesce((
        select jsonb_agg(jsonb_build_object('category', coalesce(c.name, 'Uncategorised'), 'value', x.value) order by x.value desc)
        from (select material_category_id, sum(stock_value) value from public.stock_levels
              where organization_id = p_org and material_id is not null group by 1 having sum(stock_value) <> 0) x
        left join public.material_categories c on c.id = x.material_category_id), '[]'::jsonb));
    end if;
    v := v || jsonb_build_object('consumption_by_day', coalesce((
      select jsonb_agg(jsonb_build_object('day', d::date, 'value', case when v_costs then coalesce(x.value, 0) end, 'movements', coalesce(x.n, 0)) order by d)
      from generate_series(v_from, v_to, interval '1 day') d
      left join (select (t.occurred_at at time zone v_tz)::date as day, sum(-t.total_cost) value, count(*) n
                 from public.inventory_transactions t
                 where t.organization_id = p_org and t.txn_type in ('production_issue', 'production_return')
                   and t.occurred_at >= v_start and t.occurred_at < v_end
                 group by 1) x on x.day = d::date), '[]'::jsonb));
  end if;

  return v;
end $$;

-- Scheduled checks (called by the cron route with the service role).
create or replace function public.run_scheduled_checks() returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare o record; n_overdue int := 0;
begin
  if current_setting('request.jwt.claims', true)::jsonb ->> 'role' is distinct from 'service_role' and current_user <> 'postgres' then
    raise exception 'service role required' using errcode = '42501';
  end if;
  for o in
    select po.id, po.organization_id, po.number, po.due_date, po.manager_id
    from public.production_orders po
    join public.organization_settings s on s.organization_id = po.organization_id
    join public.organizations org on org.id = po.organization_id and org.status = 'active' and org.deleted_at is null
    where po.status not in ('completed', 'cancelled', 'draft') and po.due_date < (now() at time zone s.timezone)::date
  loop
    n_overdue := n_overdue + app.notify_permission(o.organization_id, 'production_orders.update', 'production_delay', 'critical',
      o.number || ' is overdue', 'Due ' || to_char(o.due_date, 'DD Mon YYYY'), '/operations/production-orders/' || o.id,
      'production_orders', o.id, 'overdue:' || o.id || ':' || current_date);
  end loop;
  return jsonb_build_object('overdue_notifications', n_overdue, 'ran_at', now());
end $$;
revoke execute on function public.run_scheduled_checks() from public, anon, authenticated;
grant execute on function public.run_scheduled_checks() to service_role;

-- Internal writers must never be callable directly by clients.
revoke execute on function app.post_inventory_txn(uuid, uuid, uuid, text, numeric, numeric, text, text, boolean, text, uuid, uuid, uuid, uuid, uuid, text, text, text) from public, anon, authenticated;
revoke execute on function app.audit(uuid, text, text, uuid, text, jsonb, jsonb, text) from public, anon, authenticated;
revoke execute on function app.notify_permission(uuid, text, text, text, text, text, text, text, uuid, text) from public, anon, authenticated;
revoke execute on function app.notify_user(uuid, uuid, text, text, text, text, text, text, uuid, text) from public, anon, authenticated;
revoke execute on function app.next_doc_number(uuid, text, text) from public, anon, authenticated;
revoke execute on function app.po_set(uuid, text, text) from public, anon, authenticated;
revoke execute on function app.release_reservations(uuid) from public, anon, authenticated;
revoke execute on function app.record_operation_progress(uuid, numeric, numeric, text, uuid, text) from public, anon, authenticated;
revoke execute on function app.seed_org_defaults(uuid) from public, anon, authenticated;
revoke execute on function app.lock_balance(uuid, uuid, uuid) from public, anon, authenticated;
revoke execute on function app.bom_set_status(uuid, text) from public, anon, authenticated;
