-- ForgeOS foundation: identity, organisations, RBAC, audit, notifications.
-- Conventions
--   * Every organisation-owned row carries organization_id and is protected by RLS.
--   * Internal helpers live in schema "app" (not exposed through the Data API).
--   * Critical multi-row operations are SECURITY DEFINER functions in "public"
--     that check permissions explicitly before writing.

create schema if not exists app;
grant usage on schema app to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Generic helpers
-- ---------------------------------------------------------------------------
create or replace function app.uid() returns uuid
language sql stable as $$ select auth.uid() $$;

create or replace function app.request_id() returns text
language sql stable as $$
  select coalesce(
    nullif(current_setting('request.headers', true), '')::json ->> 'x-request-id',
    nullif(current_setting('app.request_id', true), '')
  )
$$;

create or replace function app.tg_touch() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  if app.uid() is not null then
    new.updated_by := app.uid();
  end if;
  return new;
end $$;

create or replace function app.tg_immutable() returns trigger
language plpgsql as $$
begin
  raise exception '% rows are immutable; record a reversal or compensating entry instead', tg_table_name
    using errcode = 'P0001';
end $$;

-- Raised errors use SQLSTATE codes the app maps to friendly messages:
--   42501 permission denied, P0001 business rule, P0002 not found, 23514 check
create or replace function app.raise_rule(msg text) returns void
language plpgsql as $$ begin raise exception '%', msg using errcode = 'P0001'; end $$;

-- ---------------------------------------------------------------------------
-- Profiles (1:1 with auth.users)
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  full_name text not null default '',
  phone text,
  avatar_url text,
  last_organization_id uuid,
  is_platform_admin boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid
);

create or replace function app.tg_handle_new_user() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, coalesce(new.email, ''), coalesce(new.raw_user_meta_data ->> 'full_name', ''))
  on conflict (id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function app.tg_handle_new_user();

create trigger profiles_touch before update on public.profiles
  for each row execute function app.tg_touch();

-- Users may never promote themselves to platform admin.
create or replace function app.tg_profiles_guard() returns trigger
language plpgsql as $$
begin
  if new.is_platform_admin is distinct from old.is_platform_admin
     and current_user in ('authenticated', 'anon') then
    raise exception 'is_platform_admin cannot be changed from the client' using errcode = '42501';
  end if;
  if new.email is distinct from old.email and current_user in ('authenticated', 'anon') then
    raise exception 'email is managed by authentication' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger profiles_guard before update on public.profiles
  for each row execute function app.tg_profiles_guard();

-- ---------------------------------------------------------------------------
-- Organisations
-- ---------------------------------------------------------------------------
create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 2 and 120),
  slug text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{1,62}$'),
  business_type text,
  industry text,
  country text not null default 'NG' check (country ~ '^[A-Z]{2}$'),
  address text,
  email text,
  phone text,
  website text,
  logo_url text,
  main_products text,
  employee_count_range text,
  factory_count integer check (factory_count is null or factory_count >= 0),
  production_model text check (production_model is null or production_model in
    ('make_to_order', 'make_to_stock', 'mixed', 'job_shop', 'batch', 'continuous')),
  production_challenges text[] not null default '{}',
  is_demo boolean not null default false,
  status text not null default 'active' check (status in ('active', 'suspended')),
  onboarding_completed_at timestamptz,
  onboarding_state jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid,
  deleted_at timestamptz
);
create trigger organizations_touch before update on public.organizations
  for each row execute function app.tg_touch();

alter table public.profiles
  add constraint profiles_last_org_fk foreign key (last_organization_id)
  references public.organizations (id) on delete set null;

create table public.organization_settings (
  organization_id uuid primary key references public.organizations (id) on delete cascade,
  currency text not null default 'NGN' check (currency in ('NGN', 'USD', 'GBP', 'EUR')),
  measurement_system text not null default 'metric' check (measurement_system in ('metric', 'imperial')),
  date_format text not null default 'dd/MM/yyyy' check (date_format in ('dd/MM/yyyy', 'MM/dd/yyyy', 'yyyy-MM-dd')),
  fiscal_year_start_month smallint not null default 1 check (fiscal_year_start_month between 1 and 12),
  inventory_valuation text not null default 'weighted_average' check (inventory_valuation in ('weighted_average', 'fifo')),
  costing_method text not null default 'actual' check (costing_method in ('actual', 'standard')),
  timezone text not null default 'Africa/Lagos',
  allow_negative_stock boolean not null default false,
  require_production_approval boolean not null default true,
  updated_at timestamptz not null default now(),
  updated_by uuid
);
create trigger organization_settings_touch before update on public.organization_settings
  for each row execute function app.tg_touch();

create table public.organization_members (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  status text not null default 'active' check (status in ('active', 'suspended', 'removed')),
  job_title text,
  factory_id uuid,
  invited_by uuid references auth.users (id),
  joined_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid,
  unique (organization_id, user_id)
);
create index organization_members_user_idx on public.organization_members (user_id) where status = 'active';
create trigger organization_members_touch before update on public.organization_members
  for each row execute function app.tg_touch();

-- ---------------------------------------------------------------------------
-- RBAC
-- ---------------------------------------------------------------------------
create table public.permissions (
  key text primary key check (key ~ '^[a-z_]+\.[a-z_]+$'),
  module text not null,
  action text not null,
  description text not null
);

create table public.roles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  key text not null check (key ~ '^[a-z][a-z0-9_]{1,40}$'),
  name text not null,
  description text,
  is_system boolean not null default false,
  is_owner boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid,
  unique (organization_id, key)
);
create unique index roles_one_owner_per_org on public.roles (organization_id) where is_owner;
create trigger roles_touch before update on public.roles for each row execute function app.tg_touch();

create table public.role_permissions (
  role_id uuid not null references public.roles (id) on delete cascade,
  permission_key text not null references public.permissions (key) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (role_id, permission_key)
);
create index role_permissions_org_idx on public.role_permissions (organization_id);

create table public.member_roles (
  member_id uuid not null references public.organization_members (id) on delete cascade,
  role_id uuid not null references public.roles (id) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  assigned_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  primary key (member_id, role_id)
);
create index member_roles_role_idx on public.member_roles (role_id);

-- Default role templates copied into every new organisation.
create table app.role_templates (
  role_key text not null,
  name text not null,
  description text not null,
  sort smallint not null,
  is_owner boolean not null default false,
  primary key (role_key)
);
create table app.role_template_permissions (
  role_key text not null references app.role_templates (role_key) on delete cascade,
  permission_key text not null references public.permissions (key) on delete cascade,
  primary key (role_key, permission_key)
);

-- Permission checks. SECURITY DEFINER so they can read membership tables without
-- recursive RLS evaluation; they only ever answer for the calling user.
create or replace function app.is_member(p_org uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from public.organization_members m
    join public.organizations o on o.id = m.organization_id
    where m.organization_id = p_org and m.user_id = auth.uid()
      and m.status = 'active' and o.deleted_at is null
  )
$$;

create or replace function app.is_owner(p_org uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from public.organization_members m
    join public.member_roles mr on mr.member_id = m.id
    join public.roles r on r.id = mr.role_id
    where m.organization_id = p_org and m.user_id = auth.uid() and m.status = 'active' and r.is_owner
  )
$$;

create or replace function app.has_permission(p_org uuid, p_permission text) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1
    from public.organization_members m
    join public.organizations o on o.id = m.organization_id and o.deleted_at is null and o.status = 'active'
    join public.member_roles mr on mr.member_id = m.id
    join public.roles r on r.id = mr.role_id
    left join public.role_permissions rp on rp.role_id = r.id and rp.permission_key = p_permission
    where m.organization_id = p_org and m.user_id = auth.uid() and m.status = 'active'
      and (r.is_owner or rp.permission_key is not null)
  )
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
end $$;

create or replace function app.member_id(p_org uuid) returns uuid
language sql stable security definer set search_path = public, pg_temp as $$
  select id from public.organization_members
  where organization_id = p_org and user_id = auth.uid() and status = 'active'
$$;

grant execute on all functions in schema app to authenticated, service_role;

-- Public read helpers for the UI (permission-aware navigation).
create or replace function public.my_permissions(p_org uuid) returns text[]
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(array_agg(distinct p.key order by p.key), '{}')
  from public.permissions p
  where app.has_permission(p_org, p.key)
$$;

create or replace function public.my_organizations()
returns table (id uuid, name text, slug text, is_demo boolean, onboarding_completed_at timestamptz, role_names text[])
language sql stable security definer set search_path = public, pg_temp as $$
  select o.id, o.name, o.slug, o.is_demo, o.onboarding_completed_at,
         coalesce(array_agg(r.name order by r.name) filter (where r.id is not null), '{}')
  from public.organization_members m
  join public.organizations o on o.id = m.organization_id and o.deleted_at is null
  left join public.member_roles mr on mr.member_id = m.id
  left join public.roles r on r.id = mr.role_id
  where m.user_id = auth.uid() and m.status = 'active'
  group by o.id
  order by o.is_demo, o.name
$$;

-- ---------------------------------------------------------------------------
-- Invitations
-- ---------------------------------------------------------------------------
create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  email text not null check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  role_id uuid not null references public.roles (id) on delete cascade,
  token_hash text not null unique,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'revoked', 'expired')),
  expires_at timestamptz not null default now() + interval '14 days',
  invited_by uuid references auth.users (id),
  accepted_by uuid references auth.users (id),
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid
);
create unique index invitations_pending_email on public.invitations (organization_id, lower(email)) where status = 'pending';
create trigger invitations_touch before update on public.invitations for each row execute function app.tg_touch();

-- ---------------------------------------------------------------------------
-- Factories & work centres
-- ---------------------------------------------------------------------------
create table public.factories (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 120),
  code text not null check (code ~ '^[A-Z0-9][A-Z0-9_-]{0,19}$'),
  address text,
  capacity_per_day numeric(14, 2) check (capacity_per_day is null or capacity_per_day >= 0),
  capacity_unit text,
  planned_work_centres integer check (planned_work_centres is null or planned_work_centres >= 0),
  opens_at time,
  closes_at time,
  working_days smallint[] not null default '{1,2,3,4,5,6}' check (working_days <@ '{1,2,3,4,5,6,7}'::smallint[]),
  timezone text not null default 'Africa/Lagos',
  is_active boolean not null default true,
  default_warehouse_id uuid,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid,
  deleted_at timestamptz,
  unique (organization_id, code),
  unique (organization_id, id)
);
create trigger factories_touch before update on public.factories for each row execute function app.tg_touch();

alter table public.organization_members
  add constraint organization_members_factory_fk foreign key (factory_id) references public.factories (id) on delete set null;

create table public.work_centres (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  factory_id uuid not null,
  name text not null,
  code text not null check (code ~ '^[A-Z0-9][A-Z0-9_-]{0,19}$'),
  description text,
  capacity_units_per_hour numeric(14, 2) check (capacity_units_per_hour is null or capacity_units_per_hour >= 0),
  hourly_cost numeric(18, 2) check (hourly_cost is null or hourly_cost >= 0),
  is_active boolean not null default true,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid,
  deleted_at timestamptz,
  unique (organization_id, code),
  foreign key (organization_id, factory_id) references public.factories (organization_id, id)
);
create index work_centres_factory_idx on public.work_centres (factory_id);
create trigger work_centres_touch before update on public.work_centres for each row execute function app.tg_touch();

-- ---------------------------------------------------------------------------
-- Document numbering (gap-free per organisation and document type)
-- ---------------------------------------------------------------------------
create table public.document_sequences (
  organization_id uuid not null references public.organizations (id) on delete cascade,
  doc_type text not null,
  prefix text not null,
  next_value bigint not null default 1,
  primary key (organization_id, doc_type)
);

create or replace function app.next_doc_number(p_org uuid, p_type text, p_default_prefix text)
returns text language plpgsql security definer set search_path = public, pg_temp as $$
declare v_prefix text; v_val bigint;
begin
  insert into public.document_sequences (organization_id, doc_type, prefix)
  values (p_org, p_type, p_default_prefix) on conflict do nothing;
  update public.document_sequences set next_value = next_value + 1
  where organization_id = p_org and doc_type = p_type
  returning prefix, next_value - 1 into v_prefix, v_val;
  return v_prefix || lpad(v_val::text, 5, '0');
end $$;

-- ---------------------------------------------------------------------------
-- Audit log (append-only)
-- ---------------------------------------------------------------------------
create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations (id) on delete cascade,
  actor_id uuid references auth.users (id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  summary text,
  old_values jsonb,
  new_values jsonb,
  source text not null default 'app' check (source in ('app', 'api', 'system', 'ai', 'import', 'platform')),
  request_id text,
  created_at timestamptz not null default now()
);
create index audit_logs_org_created_idx on public.audit_logs (organization_id, created_at desc);
create index audit_logs_entity_idx on public.audit_logs (organization_id, entity_type, entity_id);
create trigger audit_logs_immutable before update or delete on public.audit_logs
  for each row execute function app.tg_immutable();

create or replace function app.audit(
  p_org uuid, p_action text, p_entity_type text, p_entity_id uuid,
  p_summary text default null, p_old jsonb default null, p_new jsonb default null, p_source text default 'app'
) returns void language sql security definer set search_path = public, pg_temp as $$
  insert into public.audit_logs (organization_id, actor_id, action, entity_type, entity_id, summary, old_values, new_values, source, request_id)
  values (p_org, auth.uid(), p_action, p_entity_type, p_entity_id, p_summary, p_old, p_new,
          coalesce(nullif(current_setting('app.audit_source', true), ''), p_source), app.request_id())
$$;

-- Row-level audit trigger for master data and configuration tables.
create or replace function app.tg_audit_row() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_old jsonb := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end;
  v_new jsonb := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end;
  v_row jsonb := coalesce(v_new, v_old);
  v_org uuid := coalesce((v_row ->> 'organization_id')::uuid, case when tg_table_name = 'organizations' then (v_row ->> 'id')::uuid end);
  v_id uuid := coalesce((v_row ->> 'id')::uuid, (v_row ->> 'organization_id')::uuid);
  k text;
begin
  if tg_op = 'UPDATE' then
    -- keep only changed keys
    for k in select jsonb_object_keys(v_new) loop
      if v_new -> k = v_old -> k then
        v_new := v_new - k; v_old := v_old - k;
      end if;
    end loop;
    v_new := v_new - 'updated_at' - 'updated_by';
    v_old := v_old - 'updated_at' - 'updated_by';
    if v_new = '{}'::jsonb then return null; end if;
  end if;
  perform app.audit(v_org, lower(tg_op), tg_table_name, v_id, null, v_old, v_new);
  return null;
end $$;

-- ---------------------------------------------------------------------------
-- Notifications
-- ---------------------------------------------------------------------------
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  type text not null,
  severity text not null default 'info' check (severity in ('info', 'success', 'warning', 'critical')),
  title text not null,
  body text,
  link text check (link is null or link ~ '^/'),
  entity_type text,
  entity_id uuid,
  dedupe_key text,
  read_at timestamptz,
  emailed_at timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_user_idx on public.notifications (user_id, organization_id, created_at desc);
create unique index notifications_dedupe on public.notifications (user_id, dedupe_key) where dedupe_key is not null;

create table public.notification_preferences (
  organization_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  type text not null,
  in_app boolean not null default true,
  email boolean not null default false,
  primary key (organization_id, user_id, type)
);

-- Send a notification to every active member holding a permission.
create or replace function app.notify_permission(
  p_org uuid, p_permission text, p_type text, p_severity text, p_title text, p_body text,
  p_link text, p_entity_type text, p_entity_id uuid, p_dedupe text default null
) returns integer language plpgsql security definer set search_path = public, pg_temp as $$
declare n integer;
begin
  insert into public.notifications (organization_id, user_id, type, severity, title, body, link, entity_type, entity_id, dedupe_key)
  select distinct p_org, m.user_id, p_type, p_severity, p_title, p_body, p_link, p_entity_type, p_entity_id, p_dedupe
  from public.organization_members m
  join public.member_roles mr on mr.member_id = m.id
  join public.roles r on r.id = mr.role_id
  left join public.role_permissions rp on rp.role_id = r.id and rp.permission_key = p_permission
  left join public.notification_preferences np
    on np.organization_id = p_org and np.user_id = m.user_id and np.type = p_type
  where m.organization_id = p_org and m.status = 'active'
    and (r.is_owner or rp.permission_key is not null)
    and coalesce(np.in_app, true)
  on conflict do nothing;
  get diagnostics n = row_count;
  return n;
end $$;

create or replace function app.notify_user(
  p_org uuid, p_user uuid, p_type text, p_severity text, p_title text, p_body text,
  p_link text, p_entity_type text, p_entity_id uuid, p_dedupe text default null
) returns void language sql security definer set search_path = public, pg_temp as $$
  insert into public.notifications (organization_id, user_id, type, severity, title, body, link, entity_type, entity_id, dedupe_key)
  select p_org, p_user, p_type, p_severity, p_title, p_body, p_link, p_entity_type, p_entity_id, p_dedupe
  where not exists (
    select 1 from public.notification_preferences np
    where np.organization_id = p_org and np.user_id = p_user and np.type = p_type and not np.in_app
  )
  on conflict do nothing
$$;
