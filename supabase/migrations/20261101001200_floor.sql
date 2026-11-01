-- Factory-floor list for the signed-in worker. Workers can't read production
-- orders or products directly; this returns only what their job cards need.
create or replace function public.my_job_cards(p_org uuid, p_include_completed boolean default false)
returns table (
  id uuid, code text, status text, target_quantity numeric, quantity_completed numeric, quantity_rejected numeric,
  issued_at timestamptz, completed_at timestamptz, operation_name text, order_number text, order_due_date date,
  order_priority text, order_status text, product_name text
)
language sql stable security definer set search_path = public, pg_temp as $$
  select c.id, c.code, c.status, c.target_quantity, c.quantity_completed, c.quantity_rejected, c.issued_at, c.completed_at,
         op.name, o.number, o.due_date, o.priority, o.status, p.name
  from public.job_cards c
  join public.production_operations op on op.id = c.operation_id
  join public.production_orders o on o.id = c.production_order_id
  join public.products p on p.id = o.product_id
  where c.organization_id = p_org and c.assigned_user_id = auth.uid() and app.is_member(p_org)
    and (c.status in ('open', 'in_progress', 'paused') or (p_include_completed and c.status = 'completed'))
  order by c.status = 'completed', c.issued_at
  limit 200
$$;
