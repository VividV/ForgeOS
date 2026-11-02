-- Billing (plans, trials, subscriptions, Paystack payments), plan limits, and platform administration.

create table public.plans (
  key text primary key check (key in ('starter', 'growth', 'professional', 'enterprise')),
  name text not null,
  price_monthly numeric(18, 2),            -- NGN; null = contact sales
  max_users integer,                       -- null = unlimited
  max_factories integer,
  ai_requests_monthly integer,
  description text not null,
  features text[] not null default '{}',
  sort integer not null
);
insert into public.plans (key, name, price_monthly, max_users, max_factories, ai_requests_monthly, description, features, sort) values
  ('starter', 'Starter', 40000, 5, 1, 100, 'For a single workshop getting organised.',
   array['1 factory', 'Up to 5 team members', 'Production, inventory, BOMs and job cards', 'Customer orders and dispatch', '100 AI copilot questions a month'], 1),
  ('growth', 'Growth', 120000, 20, 3, 500, 'For growing manufacturers running several lines.',
   array['Up to 3 factories', 'Up to 20 team members', 'Everything in Starter', 'Procurement, quality and costing', 'Workforce and attendance', '500 AI copilot questions a month'], 2),
  ('professional', 'Professional', 250000, 60, 10, 2000, 'For multi-site operations that need control and insight.',
   array['Up to 10 factories', 'Up to 60 team members', 'Everything in Growth', 'Forecasting and anomaly detection', 'WhatsApp updates', '2,000 AI copilot questions a month'], 3),
  ('enterprise', 'Enterprise', null, null, null, null, 'For large groups with custom needs.',
   array['Unlimited factories and team members', 'Everything in Professional', 'Custom onboarding and support', 'Custom AI limits'], 4);
alter table public.plans enable row level security;
create policy plans_select on public.plans for select to authenticated using (true);
revoke all on public.plans from anon;
revoke insert, update, delete on public.plans from authenticated;

create table public.subscriptions (
  organization_id uuid primary key references public.organizations (id) on delete cascade,
  plan_key text not null references public.plans (key) default 'growth',
  status text not null default 'trialing' check (status in ('trialing', 'active', 'past_due', 'cancelled', 'expired', 'comped')),
  trial_ends_at timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  paystack_customer_code text,
  paystack_subscription_code text,
  paystack_email_token text,
  billing_email text,
  updated_at timestamptz not null default now()
);
create table public.billing_payments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  reference text not null unique,
  plan_key text references public.plans (key),
  amount numeric(18, 2) not null,
  currency text not null default 'NGN',
  status text not null check (status in ('pending', 'success', 'failed')),
  paid_at timestamptz,
  period_end timestamptz,
  provider text not null default 'paystack',
  created_by uuid references public.profiles (id) default auth.uid(),
  created_at timestamptz not null default now()
);
create table public.billing_events (
  id text primary key,                     -- provider event id / signature hash (idempotency)
  organization_id uuid references public.organizations (id) on delete set null,
  event text not null,
  payload jsonb not null,
  received_at timestamptz not null default now()
);
alter table public.subscriptions enable row level security;
alter table public.billing_payments enable row level security;
alter table public.billing_events enable row level security;
revoke all on public.subscriptions, public.billing_payments, public.billing_events from anon;
grant select, insert, update on public.billing_events to service_role;
create policy subscriptions_select on public.subscriptions for select to authenticated using (app.is_member(organization_id));
create policy billing_payments_select on public.billing_payments for select to authenticated using (app.has_permission(organization_id, 'billing.manage'));
revoke insert, update, delete on public.subscriptions, public.billing_payments, public.billing_events from authenticated;
revoke all on public.billing_events from authenticated;

-- Every organisation gets a 14-day Growth trial; demo workspaces are free.
create or replace function app.tg_org_subscription() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  insert into public.subscriptions (organization_id, plan_key, status, trial_ends_at)
  values (new.id, case when new.is_demo then 'professional' else 'growth' end, case when new.is_demo then 'comped' else 'trialing' end,
          case when new.is_demo then null else now() + interval '14 days' end)
  on conflict do nothing;
  return null;
end $$;
create trigger organizations_subscription after insert on public.organizations for each row execute function app.tg_org_subscription();
insert into public.subscriptions (organization_id, plan_key, status, trial_ends_at)
select id, case when is_demo then 'professional' else 'growth' end, case when is_demo then 'comped' else 'trialing' end,
       case when is_demo then null else now() + interval '14 days' end
from public.organizations on conflict do nothing;

-- Billing state the app needs on every request. Access is locked 7 days after a trial or paid period ends.
create or replace function public.billing_state(p_org uuid) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select case when not app.is_member(p_org) then null else jsonb_build_object(
    'plan', s.plan_key, 'plan_name', p.name, 'status', s.status, 'trial_ends_at', s.trial_ends_at,
    'current_period_end', s.current_period_end, 'cancel_at_period_end', s.cancel_at_period_end,
    'max_users', p.max_users, 'max_factories', p.max_factories, 'ai_requests_monthly', p.ai_requests_monthly,
    'users', (select count(*) from public.organization_members m where m.organization_id = p_org and m.status = 'active')
             + (select count(*) from public.invitations i where i.organization_id = p_org and i.status = 'pending' and i.expires_at > now()),
    'factories', (select count(*) from public.factories f where f.organization_id = p_org and f.deleted_at is null),
    'ends_at', case s.status when 'trialing' then s.trial_ends_at when 'comped' then null else s.current_period_end end,
    'locked', case
      when s.status = 'comped' then false
      when s.status = 'trialing' then s.trial_ends_at + interval '7 days' < now()
      when s.status in ('active', 'past_due', 'cancelled') then coalesce(s.current_period_end, now()) + interval '7 days' < now()
      else true end,
    'in_grace', case
      when s.status = 'trialing' then s.trial_ends_at < now()
      when s.status in ('active', 'past_due', 'cancelled') then coalesce(s.current_period_end, now()) < now()
      else false end)
  end
  from public.subscriptions s join public.plans p on p.key = s.plan_key where s.organization_id = p_org
$$;
grant execute on function public.billing_state(uuid) to authenticated;

-- Plan limits enforced in the database.
create or replace function app.check_plan_limit(p_org uuid, p_kind text) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_max integer; v_now integer; v_plan text;
begin
  select case p_kind when 'users' then p.max_users else p.max_factories end, p.name into v_max, v_plan
  from public.subscriptions s join public.plans p on p.key = s.plan_key where s.organization_id = p_org;
  if v_max is null then return; end if;
  if p_kind = 'users' then
    select (select count(*) from public.organization_members where organization_id = p_org and status = 'active')
         + (select count(*) from public.invitations where organization_id = p_org and status = 'pending' and expires_at > now())
      into v_now;
  else
    select count(*) into v_now from public.factories where organization_id = p_org and deleted_at is null;
  end if;
  if v_now >= v_max then
    perform app.raise_rule('Your ' || v_plan || ' plan allows ' || v_max || ' ' || case p_kind when 'users' then 'team members' else 'factories' end
      || '. Upgrade under Billing to add more.');
  end if;
end $$;

create or replace function app.tg_limit_invitations() returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin perform app.check_plan_limit(new.organization_id, 'users'); return new; end $$;
create trigger invitations_plan_limit before insert on public.invitations for each row execute function app.tg_limit_invitations();
create or replace function app.tg_limit_factories() returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin perform app.check_plan_limit(new.organization_id, 'factories'); return new; end $$;
create trigger factories_plan_limit before insert on public.factories for each row execute function app.tg_limit_factories();

-- Called by the server (service role) after Paystack confirms a payment. Idempotent per reference.
create or replace function public.billing_record_payment(p_org uuid, p_reference text, p_plan text, p_amount numeric, p_paid_at timestamptz,
  p_customer_code text default null, p_email text default null) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare s public.subscriptions; v_start timestamptz; v_end timestamptz;
begin
  if coalesce(auth.role(), '') <> 'service_role' and session_user <> 'postgres' then
    raise exception 'service role only' using errcode = '42501';
  end if;
  if exists (select 1 from public.billing_payments where reference = p_reference and status = 'success') then
    return jsonb_build_object('duplicate', true);
  end if;
  select * into s from public.subscriptions where organization_id = p_org for update;
  if s.organization_id is null then raise exception 'Organisation not found' using errcode = 'P0002'; end if;
  v_start := greatest(coalesce(case when s.status in ('active', 'past_due', 'cancelled') then s.current_period_end end, p_paid_at), p_paid_at);
  v_end := v_start + interval '1 month';
  insert into public.billing_payments (organization_id, reference, plan_key, amount, status, paid_at, period_end, created_by)
  values (p_org, p_reference, p_plan, p_amount, 'success', p_paid_at, v_end, null)
  on conflict (reference) do update set status = 'success', paid_at = excluded.paid_at, period_end = excluded.period_end, plan_key = excluded.plan_key, amount = excluded.amount;
  update public.subscriptions set plan_key = p_plan, status = 'active', current_period_end = v_end, cancel_at_period_end = false,
    paystack_customer_code = coalesce(p_customer_code, paystack_customer_code), billing_email = coalesce(p_email, billing_email), updated_at = now()
  where organization_id = p_org;
  perform app.audit(p_org, 'billing_payment', 'subscriptions', p_org, 'Subscription paid: ' || p_plan || ' until ' || to_char(v_end, 'DD Mon YYYY'), null, null, 'system');
  return jsonb_build_object('period_end', v_end);
end $$;
revoke all on function public.billing_record_payment(uuid, text, text, numeric, timestamptz, text, text) from public, anon, authenticated;
grant execute on function public.billing_record_payment(uuid, text, text, numeric, timestamptz, text, text) to service_role;

create or replace function public.billing_update_subscription(p_org uuid, p jsonb) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' and session_user <> 'postgres' then
    raise exception 'service role only' using errcode = '42501';
  end if;
  update public.subscriptions set
    status = coalesce(nullif(p ->> 'status', ''), status),
    cancel_at_period_end = coalesce((p ->> 'cancel_at_period_end')::boolean, cancel_at_period_end),
    paystack_subscription_code = coalesce(nullif(p ->> 'subscription_code', ''), paystack_subscription_code),
    paystack_email_token = coalesce(nullif(p ->> 'email_token', ''), paystack_email_token),
    paystack_customer_code = coalesce(nullif(p ->> 'customer_code', ''), paystack_customer_code),
    updated_at = now()
  where organization_id = p_org;
end $$;
revoke all on function public.billing_update_subscription(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.billing_update_subscription(uuid, jsonb) to service_role;

-- The owner records a pending checkout before being sent to Paystack.
create or replace function public.billing_start_checkout(p_org uuid, p_plan text, p_reference text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare p public.plans; v_email text;
begin
  perform app.require_permission(p_org, 'billing.manage');
  select * into p from public.plans where key = p_plan;
  if p.key is null or p.price_monthly is null then perform app.raise_rule('Choose a plan with a monthly price'); end if;
  if (select is_demo from public.organizations where id = p_org) then perform app.raise_rule('Demo workspaces are free'); end if;
  insert into public.billing_payments (organization_id, reference, plan_key, amount, status) values (p_org, p_reference, p.key, p.price_monthly, 'pending');
  select email into v_email from public.profiles where id = auth.uid();
  return jsonb_build_object('amount', p.price_monthly, 'email', v_email, 'plan', p.key);
end $$;
grant execute on function public.billing_start_checkout(uuid, text, text) to authenticated;

-- Platform administration ---------------------------------------------------------------------------
create or replace function app.is_platform_admin() returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce((select is_platform_admin from public.profiles where id = auth.uid()), false)
$$;

create or replace function public.platform_overview() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if not app.is_platform_admin() then raise exception 'platform admins only' using errcode = '42501'; end if;
  return jsonb_build_object(
    'organizations', (select count(*) from public.organizations where not is_demo),
    'demo', (select count(*) from public.organizations where is_demo),
    'users', (select count(*) from public.profiles),
    'trialing', (select count(*) from public.subscriptions s join public.organizations o on o.id = s.organization_id where s.status = 'trialing' and not o.is_demo),
    'active', (select count(*) from public.subscriptions where status = 'active'),
    'past_due', (select count(*) from public.subscriptions where status = 'past_due'),
    'mrr', (select coalesce(sum(p.price_monthly), 0) from public.subscriptions s join public.plans p on p.key = s.plan_key where s.status = 'active'),
    'paid_30d', (select coalesce(sum(amount), 0) from public.billing_payments where status = 'success' and paid_at > now() - interval '30 days'),
    'signups_30d', (select count(*) from public.organizations where created_at > now() - interval '30 days' and not is_demo));
end $$;

create or replace function public.platform_organizations(p_search text default null)
returns table (id uuid, name text, slug text, country text, is_demo boolean, status text, created_at timestamptz, onboarding_completed_at timestamptz,
               plan_key text, subscription_status text, trial_ends_at timestamptz, current_period_end timestamptz, members bigint, factories bigint,
               owner_email text, last_activity timestamptz)
language plpgsql stable security definer set search_path = public, pg_temp as $$
#variable_conflict use_column
begin
  if not app.is_platform_admin() then raise exception 'platform admins only' using errcode = '42501'; end if;
  return query
  select o.id, o.name, o.slug, o.country, o.is_demo, o.status, o.created_at, o.onboarding_completed_at, s.plan_key, s.status, s.trial_ends_at, s.current_period_end,
         (select count(*) from public.organization_members m where m.organization_id = o.id and m.status = 'active'),
         (select count(*) from public.factories f where f.organization_id = o.id and f.deleted_at is null),
         (select p.email from public.profiles p where p.id = o.created_by),
         (select max(a.created_at) from public.audit_logs a where a.organization_id = o.id)
  from public.organizations o left join public.subscriptions s on s.organization_id = o.id
  where p_search is null or o.name ilike '%' || p_search || '%' or o.slug ilike '%' || p_search || '%'
  order by o.created_at desc limit 500;
end $$;

-- p: {plan, status, trial_ends_at, current_period_end, org_status, note}
create or replace function public.platform_update_organization(p_org uuid, p jsonb) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not app.is_platform_admin() then raise exception 'platform admins only' using errcode = '42501'; end if;
  if coalesce(trim(p ->> 'note'), '') = '' then perform app.raise_rule('Add a note explaining the change'); end if;
  update public.subscriptions set
    plan_key = coalesce(nullif(p ->> 'plan', ''), plan_key),
    status = coalesce(nullif(p ->> 'status', ''), status),
    trial_ends_at = coalesce(nullif(p ->> 'trial_ends_at', '')::timestamptz, trial_ends_at),
    current_period_end = coalesce(nullif(p ->> 'current_period_end', '')::timestamptz, current_period_end),
    updated_at = now()
  where organization_id = p_org;
  if nullif(p ->> 'org_status', '') is not null then
    update public.organizations set status = p ->> 'org_status' where id = p_org;
  end if;
  perform app.audit(p_org, 'platform_update', 'organizations', p_org, 'Platform admin: ' || (p ->> 'note'), null, p, 'platform');
end $$;
grant execute on function public.platform_overview(), public.platform_organizations(text), public.platform_update_organization(uuid, jsonb) to authenticated;
revoke all on function app.check_plan_limit(uuid, text), app.is_platform_admin() from public, anon, authenticated;

-- The database also refuses changes once a subscription has lapsed (reading is still allowed),
-- so the rule holds even for direct API calls. Billing itself stays available.
create or replace function app.subscription_locked(p_org uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce((
    select case
      when s.status = 'comped' then false
      when s.status = 'trialing' then s.trial_ends_at + interval '7 days' < now()
      when s.status in ('active', 'past_due', 'cancelled') then coalesce(s.current_period_end, now()) + interval '7 days' < now()
      else true end
    from public.subscriptions s where s.organization_id = p_org), false)
  or exists (select 1 from public.organizations o where o.id = p_org and o.status = 'suspended')
$$;

create or replace function app.require_permission(p_org uuid, p_permission text) returns void
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if auth.uid() is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if not app.has_permission(p_org, p_permission) then
    raise exception 'missing permission: %', p_permission using errcode = '42501';
  end if;
  if p_permission not like '%.read' and p_permission <> 'billing.manage' and app.subscription_locked(p_org) then
    raise exception 'subscription ended: renew under Billing to make changes' using errcode = 'P0001';
  end if;
end $$;
revoke all on function app.subscription_locked(uuid) from public, anon, authenticated;
