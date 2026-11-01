-- Customer-order alerts join the operational feed: late orders, shortfalls with no production, orders ready to dispatch.

create or replace function public.operational_alerts(p_org uuid, p_factory uuid default null)
returns table (kind text, severity text, title text, detail text, link text, entity_id uuid, occurred_at timestamptz)
language plpgsql stable security definer set search_path = public, pg_temp as $$
#variable_conflict use_column
declare v_tz text; v_today date;
begin
  perform app.require_permission(p_org, 'dashboard.read');
  select timezone into v_tz from public.organization_settings where organization_id = p_org;
  v_today := (now() at time zone coalesce(v_tz, 'UTC'))::date;

  return query select * from app.operational_alerts_core(p_org, p_factory);

  if app.has_permission(p_org, 'procurement.read') then
    return query
    select 'po_overdue'::text, 'warning'::text, po.number || ' delivery is overdue',
           format('%s · expected %s', s.name, to_char(po.expected_date, 'DD Mon')),
           '/commerce/purchase-orders/' || po.id, po.id, po.expected_date::timestamptz
    from public.purchase_orders po join public.suppliers s on s.id = po.supplier_id
    where po.organization_id = p_org and po.status in ('approved', 'sent', 'partially_received') and po.expected_date < v_today;

    return query
    select 'po_pending_approval', 'info', po.number || ' is waiting for approval',
           format('%s · %s', s.name, to_char(po.total, 'FM999,999,999,990.00')),
           '/commerce/purchase-orders/' || po.id, po.id, po.updated_at
    from public.purchase_orders po join public.suppliers s on s.id = po.supplier_id
    where po.organization_id = p_org and po.status = 'pending_approval' and app.has_permission(p_org, 'procurement.approve');
  end if;

  if app.has_permission(p_org, 'sales_orders.read') then
    return query
    select 'so_overdue'::text, 'critical'::text, so.number || ' is past the customer''s date',
           format('%s · wanted %s', c.name, to_char(so.requested_date, 'DD Mon')),
           '/commerce/customer-orders/' || so.id, so.id, so.requested_date::timestamptz
    from public.sales_orders so join public.customers c on c.id = so.customer_id
    where so.organization_id = p_org and so.status in ('confirmed', 'partially_dispatched') and so.requested_date < v_today;

    return query
    select 'so_needs_production', 'warning', so.number || ' needs production',
           format('%s · %s line(s) short with no production planned', c.name, x.short_lines),
           '/commerce/customer-orders/' || so.id, so.id, so.confirmed_at
    from public.sales_orders so join public.customers c on c.id = so.customer_id
    join lateral (
      select count(*) short_lines from public.sales_order_items i
      where i.sales_order_id = so.id
        and i.quantity - i.quantity_dispatched - i.quantity_allocated
            - coalesce((select sum(greatest(o.quantity_planned - o.quantity_completed, 0)) from public.production_orders o
                        where o.sales_order_item_id = i.id and o.status not in ('completed', 'cancelled')), 0) > 0
    ) x on x.short_lines > 0
    where so.organization_id = p_org and so.status in ('confirmed', 'partially_dispatched');

    return query
    select 'so_ready', 'info', so.number || ' is ready to dispatch',
           format('%s · all goods allocated', c.name),
           '/commerce/customer-orders/' || so.id, so.id, so.updated_at
    from public.sales_orders so join public.customers c on c.id = so.customer_id
    where so.organization_id = p_org and so.status in ('confirmed', 'partially_dispatched')
      and not exists (select 1 from public.sales_order_items i where i.sales_order_id = so.id and i.quantity_dispatched + i.quantity_allocated < i.quantity)
      and app.has_permission(p_org, 'sales_orders.dispatch');
  end if;

  if app.has_permission(p_org, 'quality.read') then
    return query
    select 'corrective_action_overdue', 'warning', 'Corrective action overdue',
           format('%s · due %s', a.description, to_char(a.due_date, 'DD Mon')),
           '/operations/quality/' || a.quality_check_id, a.id, a.due_date::timestamptz
    from public.corrective_actions a
    left join public.quality_checks c on c.id = a.quality_check_id
    left join public.production_orders o on o.id = c.production_order_id
    where a.organization_id = p_org and a.status in ('open', 'in_progress') and a.due_date < v_today
      and (p_factory is null or o.factory_id is null or o.factory_id = p_factory);
  end if;
end $$;
grant execute on function public.operational_alerts(uuid, uuid) to authenticated;
