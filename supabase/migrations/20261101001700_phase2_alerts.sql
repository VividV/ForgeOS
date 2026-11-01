-- Phase 2 alerts: overdue purchase orders and overdue corrective actions join the operational alert feed.
-- The phase-1 function body is kept as app.operational_alerts_core and wrapped, so both stay in one feed.

alter function public.operational_alerts(uuid, uuid) rename to operational_alerts_core;
alter function public.operational_alerts_core(uuid, uuid) set schema app;
revoke all on function app.operational_alerts_core(uuid, uuid) from public, anon, authenticated;

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
