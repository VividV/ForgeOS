-- Intelligence: deterministic forecasting, material planning, bottleneck and anomaly detection (all SQL rules,
-- explainable and testable), AI copilot usage limits, and WhatsApp notifications/updates.

-- 1. Demand forecast per product: average weekly demand from the last 8 weeks of dispatches
--    (weighted towards recent weeks), plus open customer orders, against free stock and production in progress.
create or replace function public.demand_forecast(p_org uuid, p_weeks int default 4)
returns table (stock_item_id uuid, product_id uuid, name text, code text, uom_code text, weekly_avg numeric, last_4_weeks numeric, prior_4_weeks numeric,
               trend_pct numeric, open_orders numeric, available numeric, in_production numeric, forecast_demand numeric, projected_gap numeric, weeks_of_cover numeric)
language sql stable security definer set search_path = public, pg_temp as $$
  with w as (
    select di.stock_item_id, floor(extract(epoch from (now() - d.dispatched_at)) / 604800)::int as wk, sum(di.quantity) q
    from public.dispatch_items di join public.dispatches d on d.id = di.dispatch_id
    where d.organization_id = p_org and d.dispatched_at > now() - interval '56 days'
    group by 1, 2),
  agg as (
    select stock_item_id,
           sum(q * (8 - wk)) / 36.0 as weighted,                       -- weights 8..1 sum to 36
           sum(q) filter (where wk < 4) as recent, sum(q) filter (where wk between 4 and 7) as prior
    from w where wk between 0 and 7 group by 1),
  open_so as (
    select i.stock_item_id, sum(greatest(i.quantity - i.quantity_dispatched - i.quantity_allocated, 0)) q
    from public.sales_order_items i join public.sales_orders s on s.id = i.sales_order_id
    where s.organization_id = p_org and s.status in ('confirmed', 'partially_dispatched') group by 1),
  prod as (
    select s.id stock_item_id, sum(greatest(o.quantity_planned - o.quantity_completed, 0)) q
    from public.production_orders o join public.stock_items s on s.product_variant_id = o.variant_id
    where o.organization_id = p_org and o.status not in ('completed', 'cancelled', 'draft') group by 1)
  select d.id, d.product_id, d.name, d.code, d.uom_code,
         round(coalesce(a.weighted, 0), 2), coalesce(a.recent, 0), coalesce(a.prior, 0),
         case when coalesce(a.prior, 0) > 0 then round((coalesce(a.recent, 0) - a.prior) / a.prior * 100, 1) end,
         coalesce(so.q, 0), coalesce(lv.available, 0), coalesce(pr.q, 0),
         round(coalesce(a.weighted, 0) * p_weeks + coalesce(so.q, 0), 2),
         round(greatest(coalesce(a.weighted, 0) * p_weeks + coalesce(so.q, 0) - coalesce(lv.available, 0) - coalesce(pr.q, 0), 0), 2),
         case when coalesce(a.weighted, 0) > 0 then round(coalesce(lv.available, 0) / a.weighted, 1) end
  from public.stock_item_details d
  left join agg a on a.stock_item_id = d.id
  left join open_so so on so.stock_item_id = d.id
  left join prod pr on pr.stock_item_id = d.id
  left join (select stock_item_id, sum(available) available from public.inventory_balances where organization_id = p_org group by 1) lv on lv.stock_item_id = d.id
  where d.organization_id = p_org and d.product_variant_id is not null and d.is_active
    and app.has_any(p_org, array['sales_orders.read', 'production_orders.read', 'inventory.read'])
    and (a.stock_item_id is not null or so.q > 0 or pr.q > 0)
  order by 14 desc, 10 desc
$$;

-- 2. Material requirements: what open production needs (not yet issued) plus what the forecast gap would need
--    through the approved BOM, against free stock and open purchase orders; suggests when to order.
create or replace function public.material_requirements(p_org uuid, p_weeks int default 4)
returns table (stock_item_id uuid, material_id uuid, name text, code text, uom_code text, for_open_production numeric, for_forecast numeric,
               available numeric, on_order numeric, net_requirement numeric, lead_time_days int, order_by date, supplier text)
language sql stable security definer set search_path = public, pg_temp as $$
  with today as (select (now() at time zone coalesce((select timezone from public.organization_settings where organization_id = p_org), 'UTC'))::date d),
  prodneed as (
    select m.stock_item_id, sum(greatest(m.quantity_required - m.quantity_issued - m.quantity_reserved, 0)) q,
           min(coalesce(o.planned_start_date, o.due_date - 3)) need_date
    from public.production_order_materials m join public.production_orders o on o.id = m.production_order_id
    where o.organization_id = p_org and o.status not in ('completed', 'cancelled')
      and m.quantity_required - m.quantity_issued - m.quantity_reserved > 0 group by 1),
  gap as (select f.product_id, f.projected_gap from public.demand_forecast(p_org, p_weeks) f where f.projected_gap > 0),
  fcneed as (
    select bi.stock_item_id, sum(g.projected_gap * bi.quantity / b.output_quantity * (1 + bi.wastage_pct / 100)) q
    from gap g join public.bills_of_materials b on b.product_id = g.product_id and b.status = 'approved'
    join public.bom_items bi on bi.bom_id = b.id group by 1),
  onorder as (
    select i.stock_item_id, sum(greatest(i.quantity - (i.quantity_received - i.quantity_rejected), 0)) q
    from public.purchase_order_items i join public.purchase_orders po on po.id = i.purchase_order_id
    where po.organization_id = p_org and po.status in ('approved', 'sent', 'partially_received') group by 1)
  select d.id, d.material_id, d.name, d.code, d.uom_code, round(coalesce(pn.q, 0), 2), round(coalesce(fn.q, 0), 2),
         round(coalesce(lv.available, 0), 2), round(coalesce(oo.q, 0), 2),
         round(greatest(coalesce(pn.q, 0) + coalesce(fn.q, 0) + coalesce(d.reorder_level, 0) - coalesce(lv.available, 0) - coalesce(oo.q, 0), 0), 2),
         s.lead_time_days,
         -- latest date to order so it arrives before it's needed (never earlier than today)
         greatest(coalesce(pn.need_date, (select d from today) + 7) - coalesce(s.lead_time_days, 7), (select d from today)),
         s.name
  from public.stock_item_details d
  join public.materials mt on mt.id = d.material_id
  left join public.suppliers s on s.id = mt.preferred_supplier_id
  left join prodneed pn on pn.stock_item_id = d.id
  left join fcneed fn on fn.stock_item_id = d.id
  left join onorder oo on oo.stock_item_id = d.id
  left join (select stock_item_id, sum(available) available from public.inventory_balances where organization_id = p_org group by 1) lv on lv.stock_item_id = d.id
  where d.organization_id = p_org and d.is_active and app.has_any(p_org, array['inventory.read', 'procurement.read', 'production_orders.read'])
    and (pn.q > 0 or fn.q > 0 or oo.q > 0 or coalesce(lv.available, 0) <= coalesce(d.reorder_level, 0))
  order by 10 desc, 6 desc
$$;

-- 3. Bottlenecks: for each production stage, how much work is queued or in progress and how long steps take.
create or replace function public.bottleneck_analysis(p_org uuid, p_days int default 30)
returns table (stage_id uuid, stage text, sequence int, in_progress bigint, queued bigint, completed bigint, avg_hours numeric, units_completed numeric,
               downtime_minutes numeric, score numeric, is_bottleneck boolean)
language sql stable security definer set search_path = public, pg_temp as $$
  with ops as (
    select op.*, o.status as order_status,
           lag(op.status) over (partition by op.production_order_id order by op.sequence) as prev_status
    from public.production_operations op join public.production_orders o on o.id = op.production_order_id
    where op.organization_id = p_org and o.status not in ('cancelled', 'draft', 'awaiting_approval')),
  s as (
    select ps.id, ps.name, ps.sequence,
      count(*) filter (where ops.status in ('in_progress', 'paused')) wip,
      count(*) filter (where ops.status = 'pending' and coalesce(ops.prev_status, 'completed') in ('completed', 'skipped') and ops.order_status not in ('completed')) queued,
      count(*) filter (where ops.status = 'completed' and ops.completed_at > now() - make_interval(days => p_days)) done,
      avg(extract(epoch from (ops.completed_at - ops.started_at)) / 3600) filter (where ops.status = 'completed' and ops.started_at is not null and ops.completed_at > now() - make_interval(days => p_days)) hrs,
      sum(ops.quantity_completed) filter (where ops.completed_at > now() - make_interval(days => p_days)) units
    from public.production_stages ps left join ops on ops.stage_id = ps.id
    where ps.organization_id = p_org and ps.is_active group by ps.id, ps.name, ps.sequence),
  dt as (
    select op.stage_id, sum(d.minutes) m from public.downtime_logs d join public.production_operations op on op.id = d.operation_id
    where d.organization_id = p_org and d.started_at > now() - make_interval(days => p_days) group by 1),
  scored as (
    select s.*, coalesce(dt.m, 0) dtm,
           round((s.wip + s.queued) * greatest(coalesce(s.hrs, 0), 1) + coalesce(dt.m, 0) / 60.0, 2) score
    from s left join dt on dt.stage_id = s.id)
  select id, name, sequence, wip, queued, done, round(hrs::numeric, 1), coalesce(units, 0), dtm, score,
         score > 0 and score = max(score) over () and (wip + queued) >= 2
  from scored where app.has_permission(p_org, 'production_orders.read')
  order by sequence
$$;

-- 4. Anomalies: statistical rules on recent data (each result says why it was flagged).
create or replace function public.detect_anomalies(p_org uuid)
returns table (kind text, severity text, title text, detail text, link text, metric numeric, baseline numeric)
language plpgsql stable security definer set search_path = public, pg_temp as $$
#variable_conflict use_column
declare v_tz text;
begin
  if not app.has_any(p_org, array['dashboard.read', 'production_orders.read']) then raise exception 'missing permission: dashboard.read' using errcode = '42501'; end if;
  select timezone into v_tz from public.organization_settings where organization_id = p_org;

  -- Daily rejection rate far above its 30-day norm (z > 2, at least 20 units that day)
  return query
  with d as (
    select (l.occurred_at at time zone v_tz)::date as dday, sum(coalesce(l.quantity_rejected, 0)) rej, sum(coalesce(l.quantity_rejected, 0) + coalesce(l.quantity_good, 0)) tot
    from public.production_logs l where l.organization_id = p_org and l.log_type in ('progress', 'defect') and l.occurred_at > now() - interval '31 days' group by 1),
  r as (select dday, tot, rej / nullif(tot, 0) rate from d where tot > 0),
  st as (select avg(rate) m, stddev_samp(rate) sd from r where dday < (now() at time zone v_tz)::date - 1)
  select 'rejection_spike', 'warning', 'Unusually high rejects on ' || to_char(r.dday, 'DD Mon'),
         format('%s%% rejected vs a usual %s%%', round(r.rate * 100, 1), round(st.m * 100, 1)), '/operations/quality', round(r.rate * 100, 1), round(st.m * 100, 1)
  from r, st where r.dday >= (now() at time zone v_tz)::date - 1 and r.tot >= 20 and st.sd > 0 and (r.rate - st.m) / st.sd > 2;

  -- Material used well above the BOM on recently completed orders (>10% over standard)
  return query
  select 'over_consumption', case when r.usage_variance / nullif(r.standard_for_actual_output, 0) > 0.25 then 'critical' else 'warning' end,
         'Material over-use on ' || o.number,
         format('%s: %s %s used vs %s standard for the output', r.name, round(r.quantity_consumed, 2), r.uom_code, round(r.standard_for_actual_output, 2)),
         '/operations/production-orders/' || o.id, round(r.quantity_consumed, 2), round(r.standard_for_actual_output, 2)
  from public.production_material_reconciliation r join public.production_orders o on o.id = r.production_order_id
  where o.organization_id = p_org and o.status = 'completed' and o.actual_end_at > now() - interval '14 days'
    and r.standard_for_actual_output > 0 and r.usage_variance / r.standard_for_actual_output > 0.10;

  -- Stock adjustments far larger than usual (value beyond 3 standard deviations of the last 90 days)
  if app.has_permission(p_org, 'inventory.read') then
    return query
    with a as (select t.id, t.stock_item_id, abs(t.total_cost) v, t.occurred_at, t.quantity from public.inventory_transactions t
               where t.organization_id = p_org and t.txn_type in ('adjustment', 'damaged', 'wastage', 'stock_count_correction') and t.occurred_at > now() - interval '90 days'),
    st as (select avg(v) m, stddev_samp(v) sd, count(*) n from a)
    select 'large_adjustment', 'warning', 'Unusually large stock adjustment',
           format('%s: %s units (value %s) vs a usual %s', d.name, round(a.quantity, 2), to_char(a.v, 'FM999,999,990'), to_char(st.m, 'FM999,999,990')),
           '/inventory/movements', round(a.v, 2), round(st.m, 2)
    from a, st, public.stock_item_details d
    where d.id = a.stock_item_id and st.n >= 10 and st.sd > 0 and a.occurred_at > now() - interval '7 days' and (a.v - st.m) / st.sd > 3;
  end if;

  -- Output this week well below the 4 weeks before
  return query
  with wk as (select floor(extract(epoch from (now() - l.occurred_at)) / 604800)::int w, sum(coalesce(l.quantity_good, 0)) q
              from public.production_logs l where l.organization_id = p_org and l.log_type = 'output' and l.occurred_at > now() - interval '35 days' group by 1),
  b as (select avg(q) m from wk where w between 1 and 4)
  select 'output_drop', 'warning', 'Finished output is down this week',
         format('%s units this week vs about %s a week before', round(coalesce((select q from wk where w = 0), 0)), round(b.m)), '/daily',
         coalesce((select q from wk where w = 0), 0), round(b.m, 2)
  from b where b.m >= 20 and coalesce((select q from wk where w = 0), 0) < b.m * 0.5
    and extract(isodow from now()) >= 4;   -- only judge after mid-week

  -- Suppliers repeatedly late (2+ late deliveries in 60 days)
  if app.has_permission(p_org, 'procurement.read') then
    return query
    select 'supplier_late', 'info', s.name || ' is often late',
           format('%s of %s deliveries in the last 60 days arrived after the expected date', x.late, x.n), '/commerce/purchase-orders?supplier=' || s.id, x.late::numeric, x.n::numeric
    from (select po.supplier_id, count(*) n, count(*) filter (where g.received_at::date > po.expected_date) late
          from public.goods_receipts g join public.purchase_orders po on po.id = g.purchase_order_id
          where g.organization_id = p_org and g.received_at > now() - interval '60 days' and po.expected_date is not null group by 1) x
    join public.suppliers s on s.id = x.supplier_id where x.late >= 2;
  end if;
end $$;

grant execute on function public.demand_forecast(uuid, int), public.material_requirements(uuid, int), public.bottleneck_analysis(uuid, int), public.detect_anomalies(uuid) to authenticated;

-- 5. AI copilot usage (counts only; questions and answers aren't stored) ------------------------------------
insert into public.permissions (key, module, action, description) values ('ai.use', 'ai', 'use', 'Ask the AI copilot questions about the business')
on conflict (key) do nothing;
insert into app.role_template_permissions (role_key, permission_key)
select r, 'ai.use' from unnest(array['administrator', 'production_manager', 'inventory_manager', 'procurement_officer', 'quality_controller', 'supervisor', 'finance_analyst', 'sales_coordinator']) r
on conflict do nothing;
insert into public.role_permissions (role_id, permission_key, organization_id)
select ro.id, 'ai.use', ro.organization_id from public.roles ro
where ro.is_system and not ro.is_owner and ro.key in ('administrator', 'production_manager', 'inventory_manager', 'procurement_officer', 'quality_controller', 'supervisor', 'finance_analyst', 'sales_coordinator')
on conflict do nothing;

create table public.ai_usage (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid references public.profiles (id) on delete set null default auth.uid(),
  model text,
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  tool_calls integer not null default 0,
  ok boolean not null default true,
  created_at timestamptz not null default now()
);
create index ai_usage_org_idx on public.ai_usage (organization_id, created_at);
alter table public.ai_usage enable row level security;
revoke all on public.ai_usage from anon;
create policy ai_usage_select on public.ai_usage for select to authenticated using (user_id = auth.uid() or app.has_permission(organization_id, 'billing.manage'));
revoke insert, update, delete on public.ai_usage from authenticated;

-- Reserves one copilot request against the plan's monthly allowance; returns what's left.
create or replace function public.ai_reserve_request(p_org uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_limit int; v_used int; v_id bigint;
begin
  perform app.require_permission(p_org, 'ai.use');
  select p.ai_requests_monthly into v_limit from public.subscriptions s join public.plans p on p.key = s.plan_key where s.organization_id = p_org;
  select count(*) into v_used from public.ai_usage where organization_id = p_org and created_at >= date_trunc('month', now());
  if v_limit is not null and v_used >= v_limit then
    perform app.raise_rule('Your plan''s ' || v_limit || ' copilot questions for this month have been used. Upgrade under Billing for more.');
  end if;
  -- per-user burst guard: 20 questions in 10 minutes
  if (select count(*) from public.ai_usage where user_id = auth.uid() and created_at > now() - interval '10 minutes') >= 20 then
    perform app.raise_rule('Too many questions in a short time. Wait a few minutes and try again.');
  end if;
  insert into public.ai_usage (organization_id, ok) values (p_org, true) returning id into v_id;
  return jsonb_build_object('usage_id', v_id, 'used', v_used + 1, 'limit', v_limit);
end $$;

create or replace function public.ai_finish_request(p_usage bigint, p_model text, p_in int, p_out int, p_tools int, p_ok boolean) returns void
language sql security definer set search_path = public, pg_temp as $$
  update public.ai_usage set model = p_model, input_tokens = greatest(p_in, 0), output_tokens = greatest(p_out, 0), tool_calls = greatest(p_tools, 0), ok = p_ok
  where id = p_usage and user_id = auth.uid()
$$;
grant execute on function public.ai_reserve_request(uuid), public.ai_finish_request(bigint, text, int, int, int, boolean) to authenticated;

-- 6. WhatsApp: opt-in per person, outbox for notifications, inbound commands ------------------------------
create table public.whatsapp_contacts (
  organization_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  phone text not null check (phone ~ '^\+[1-9][0-9]{7,14}$'),
  opted_in_at timestamptz not null default now(),
  alerts boolean not null default true,          -- warnings and critical notifications
  daily_summary boolean not null default false,
  primary key (organization_id, user_id)
);
create unique index whatsapp_contacts_phone_org on public.whatsapp_contacts (organization_id, phone);
create table public.whatsapp_outbox (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid references public.profiles (id) on delete cascade,
  phone text not null,
  body text not null,
  link text,
  status text not null default 'pending' check (status in ('pending', 'sent', 'failed', 'skipped')),
  attempts integer not null default 0,
  error text,
  provider_id text,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);
create index whatsapp_outbox_pending on public.whatsapp_outbox (status, created_at) where status = 'pending';
alter table public.whatsapp_contacts enable row level security;
alter table public.whatsapp_outbox enable row level security;
revoke all on public.whatsapp_contacts, public.whatsapp_outbox from anon;
create policy wa_contacts_own on public.whatsapp_contacts for all to authenticated
  using (user_id = auth.uid() and app.is_member(organization_id)) with check (user_id = auth.uid() and app.is_member(organization_id));
create policy wa_outbox_own on public.whatsapp_outbox for select to authenticated using (user_id = auth.uid());
revoke insert, update, delete on public.whatsapp_outbox from authenticated;
grant select, insert, update on public.whatsapp_outbox to service_role;
grant select on public.whatsapp_contacts to service_role;

-- Warnings and critical notifications are queued for people who opted in to WhatsApp alerts.
create or replace function app.tg_notification_whatsapp() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare c public.whatsapp_contacts;
begin
  if new.severity not in ('warning', 'critical') then return null; end if;
  select * into c from public.whatsapp_contacts where organization_id = new.organization_id and user_id = new.user_id and alerts;
  if c.user_id is null then return null; end if;
  insert into public.whatsapp_outbox (organization_id, user_id, phone, body, link)
  values (new.organization_id, new.user_id, c.phone, left('*' || new.title || '*' || coalesce(E'\n' || new.body, ''), 900), new.link);
  return null;
end $$;
create trigger notifications_whatsapp after insert on public.notifications for each row execute function app.tg_notification_whatsapp();

-- Daily summary text for one organisation (used by the scheduled job).
create or replace function public.whatsapp_daily_summary(p_org uuid) returns text
language sql stable security definer set search_path = public, pg_temp as $$
  with t as (select (now() at time zone coalesce(s.timezone, 'UTC'))::date d from public.organization_settings s where s.organization_id = p_org)
  select format(E'*%s · daily summary*\nFinished yesterday: %s units\nOrders in progress: %s\nLate orders: %s\nCustomer orders to dispatch: %s\nOpen alerts: %s',
    o.name,
    (select coalesce(sum(quantity_good), 0) from public.production_logs l, t where l.organization_id = p_org and l.log_type = 'output' and (l.occurred_at at time zone 'UTC')::date = t.d - 1),
    (select count(*) from public.production_orders where organization_id = p_org and status in ('in_progress', 'paused', 'quality_inspection')),
    (select count(*) from public.production_orders po, t where po.organization_id = p_org and po.due_date < t.d and po.status not in ('completed', 'cancelled', 'draft')),
    (select count(*) from public.sales_orders where organization_id = p_org and status in ('confirmed', 'partially_dispatched')),
    (select count(*) from public.notifications n where n.organization_id = p_org and n.read_at is null and n.severity in ('warning', 'critical') and n.created_at > now() - interval '7 days'))
  from public.organizations o where o.id = p_org
$$;
revoke all on function public.whatsapp_daily_summary(uuid) from public, anon, authenticated;
grant execute on function public.whatsapp_daily_summary(uuid) to service_role;

-- Inbound WhatsApp command from a known phone number (called by the webhook with the service role).
-- Supports: HELP · STATUS <order no.> · <job card code> <good> [rejected]
create or replace function public.whatsapp_handle_message(p_phone text, p_text text) returns text
language plpgsql security definer set search_path = public, pg_temp as $$
declare c public.whatsapp_contacts; v text := upper(trim(regexp_replace(coalesce(p_text, ''), '\s+', ' ', 'g'))); parts text[]; o public.production_orders;
        jc public.job_cards; v_good numeric; v_rej numeric; r jsonb;
begin
  if coalesce(auth.role(), '') <> 'service_role' and session_user <> 'postgres' then raise exception 'service role only' using errcode = '42501'; end if;
  select * into c from public.whatsapp_contacts where phone = p_phone order by opted_in_at desc limit 1;
  if c.user_id is null then return 'This number isn''t linked to ForgeOS. Add it under Account → WhatsApp first.'; end if;
  -- act as that person, so every permission check applies to them
  perform set_config('request.jwt.claims', json_build_object('sub', c.user_id, 'role', 'authenticated')::text, true);
  parts := string_to_array(v, ' ');
  if v = '' or parts[1] in ('HELP', 'HI', 'HELLO', 'MENU') then
    return E'ForgeOS commands:\nSTATUS PRD-00012 — order progress\nJC-00034 40 — record 40 good units on a job card\nJC-00034 40 2 — 40 good, 2 rejected';
  elsif parts[1] = 'STATUS' and array_length(parts, 1) >= 2 then
    select * into o from public.production_orders where organization_id = c.organization_id and upper(number) = parts[2];
    if o.id is null or not app.has_any(c.organization_id, array['production_orders.read', 'job_cards.work']) then return 'Order ' || parts[2] || ' not found.'; end if;
    return format(E'%s · %s\nStatus: %s\nDone: %s of %s\nDue: %s', o.number, (select name from public.products where id = o.product_id), replace(o.status, '_', ' '),
                  trim_scale(o.quantity_completed), trim_scale(o.quantity_planned), coalesce(to_char(o.due_date, 'DD Mon'), '—'));
  elsif parts[1] like 'JC-%' and array_length(parts, 1) >= 2 and parts[2] ~ '^[0-9]+(\.[0-9]+)?$' then
    select * into jc from public.job_cards where organization_id = c.organization_id and upper(code) = parts[1];
    if jc.id is null then return 'Job card ' || parts[1] || ' not found.'; end if;
    v_good := parts[2]::numeric;
    v_rej := case when array_length(parts, 1) >= 3 and parts[3] ~ '^[0-9]+(\.[0-9]+)?$' then parts[3]::numeric else 0 end;
    if jc.status = 'open' then perform public.job_card_action(jc.id, 'start', null, null, 'Started via WhatsApp', null); end if;
    r := public.job_card_action(jc.id, 'progress', v_good, v_rej, 'Recorded via WhatsApp', 'wa:' || md5(p_phone || p_text || date_trunc('minute', now())::text));
    select * into jc from public.job_cards where id = jc.id;
    return format('Recorded on %s: %s good%s. Total now %s of %s.', jc.code, trim_scale(v_good), case when v_rej > 0 then ', ' || trim_scale(v_rej) || ' rejected' else '' end,
                  trim_scale(jc.quantity_completed), trim_scale(jc.target_quantity));
  end if;
  return 'Sorry, I didn''t understand. Reply HELP for commands.';
exception when others then
  return 'Couldn''t do that: ' || sqlerrm;
end $$;
revoke all on function public.whatsapp_handle_message(text, text) from public, anon, authenticated;
grant execute on function public.whatsapp_handle_message(text, text) to service_role;
