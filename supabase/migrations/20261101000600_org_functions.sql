-- Organisation lifecycle, membership, roles and invitations.

-- Audit triggers on master data / configuration tables.
do $$
declare t text;
begin
  foreach t in array array['organizations', 'organization_settings', 'factories', 'work_centres', 'warehouses',
    'products', 'product_variants', 'materials', 'bills_of_materials', 'bom_items', 'suppliers', 'roles',
    'production_stages', 'routing_templates', 'routing_steps', 'production_orders', 'units_of_measure'] loop
    execute format('create trigger %I after insert or update or delete on public.%I for each row execute function app.tg_audit_row()',
                   t || '_audit', t);
  end loop;
end $$;

create or replace function app.slugify(p text) returns text
language sql immutable as $$
  select trim(both '-' from regexp_replace(lower(coalesce(p, '')), '[^a-z0-9]+', '-', 'g'))
$$;

create or replace function app.seed_org_defaults(p_org uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_routing uuid;
begin
  insert into public.units_of_measure (organization_id, code, name, kind, decimals) values
    (p_org, 'pcs', 'Pieces', 'count', 0), (p_org, 'unit', 'Units', 'count', 0), (p_org, 'set', 'Sets', 'count', 0),
    (p_org, 'pair', 'Pairs', 'count', 0), (p_org, 'box', 'Boxes', 'count', 0), (p_org, 'roll', 'Rolls', 'count', 0),
    (p_org, 'm', 'Metres', 'length', 2), (p_org, 'cm', 'Centimetres', 'length', 1), (p_org, 'yd', 'Yards', 'length', 2),
    (p_org, 'kg', 'Kilograms', 'mass', 3), (p_org, 'g', 'Grams', 'mass', 1), (p_org, 'l', 'Litres', 'volume', 3),
    (p_org, 'ml', 'Millilitres', 'volume', 0), (p_org, 'sqm', 'Square metres', 'area', 2), (p_org, 'hr', 'Hours', 'time', 2);

  -- Generic, industry-neutral stages. Organisations rename, reorder or replace them.
  insert into public.production_stages (organization_id, name, sequence, colour, is_quality_stage) values
    (p_org, 'Preparation', 10, 'slate', false), (p_org, 'Processing', 20, 'blue', false),
    (p_org, 'Assembly', 30, 'violet', false), (p_org, 'Finishing', 40, 'amber', false),
    (p_org, 'Quality inspection', 50, 'green', true), (p_org, 'Packaging', 60, 'orange', false);

  insert into public.routing_templates (organization_id, name, is_default)
  values (p_org, 'Standard routing', true) returning id into v_routing;
  insert into public.routing_steps (organization_id, routing_id, sequence, stage_id, name, requires_quality_check)
  select p_org, v_routing, row_number() over (order by s.sequence), s.id, s.name, s.is_quality_stage
  from public.production_stages s where s.organization_id = p_org;
end $$;

-- Replace the default stages with an industry template while no production exists.
create or replace function public.apply_stage_template(p_org uuid, p_template text) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_names text[]; v_quality text[] := array['Quality inspection']; v_routing uuid; i int;
begin
  perform app.require_permission(p_org, 'routing.manage');
  if exists (select 1 from public.production_orders where organization_id = p_org) then
    perform app.raise_rule('Stage templates can only be applied before the first production order. Edit stages individually instead.');
  end if;
  v_names := case p_template
    when 'garment' then array['Design approval', 'Fabric inspection', 'Cutting', 'Printing/dyeing', 'Sewing', 'Finishing', 'Quality inspection', 'Packaging', 'Finished goods storage']
    when 'food' then array['Ingredient preparation', 'Mixing', 'Cooking/processing', 'Cooling', 'Quality inspection', 'Packaging']
    when 'furniture' then array['Material preparation', 'Cutting', 'Machining', 'Assembly', 'Sanding', 'Finishing', 'Quality inspection', 'Packaging']
    when 'generic' then array['Preparation', 'Processing', 'Assembly', 'Finishing', 'Quality inspection', 'Packaging']
    else null end;
  if v_names is null then perform app.raise_rule('Unknown stage template'); end if;

  delete from public.routing_steps where organization_id = p_org;
  delete from public.production_stages where organization_id = p_org;
  for i in 1 .. array_length(v_names, 1) loop
    insert into public.production_stages (organization_id, name, sequence, colour, is_quality_stage)
    values (p_org, v_names[i], i * 10,
            (array['slate', 'blue', 'violet', 'amber', 'green', 'orange', 'cyan', 'rose', 'teal'])[1 + (i - 1) % 9],
            v_names[i] = any (v_quality));
  end loop;
  select id into v_routing from public.routing_templates where organization_id = p_org and is_default;
  if v_routing is null then
    insert into public.routing_templates (organization_id, name, is_default) values (p_org, 'Standard routing', true)
    returning id into v_routing;
  end if;
  insert into public.routing_steps (organization_id, routing_id, sequence, stage_id, name, requires_quality_check)
  select p_org, v_routing, row_number() over (order by s.sequence), s.id, s.name, s.is_quality_stage
  from public.production_stages s where s.organization_id = p_org;
  perform app.audit(p_org, 'apply_stage_template', 'production_stages', null, 'Applied ' || p_template || ' stage template');
end $$;

create or replace function public.create_organization(p jsonb) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := auth.uid();
  v_org uuid;
  v_member uuid;
  v_owner_role uuid;
  v_name text := trim(coalesce(p ->> 'name', ''));
  v_country text := upper(coalesce(nullif(p ->> 'country', ''), 'NG'));
  v_slug text;
  v_currency text;
begin
  if v_uid is null then raise exception 'authentication required' using errcode = '42501'; end if;
  if length(v_name) < 2 then perform app.raise_rule('Company name must be at least 2 characters'); end if;
  if (select count(*) from public.organizations where created_by = v_uid and created_at > now() - interval '1 hour') >= 5 then
    perform app.raise_rule('Too many organisations created recently. Please try again later.');
  end if;

  v_slug := left(coalesce(nullif(app.slugify(v_name), ''), 'org'), 48) || '-' || substr(md5(gen_random_uuid()::text), 1, 6);
  v_currency := coalesce(nullif(p ->> 'currency', ''), case v_country when 'NG' then 'NGN' when 'GB' then 'GBP'
    when 'US' then 'USD' when 'IE' then 'EUR' when 'FR' then 'EUR' when 'DE' then 'EUR' when 'NL' then 'EUR' else 'USD' end);

  insert into public.organizations (name, slug, business_type, industry, country, address, email, phone, website, is_demo, created_by,
                                    onboarding_state)
  values (v_name, v_slug, p ->> 'business_type', p ->> 'industry', v_country, p ->> 'address', p ->> 'email',
          p ->> 'phone', nullif(p ->> 'website', ''), coalesce((p ->> 'is_demo')::boolean, false), v_uid,
          jsonb_build_object('organization', true))
  returning id into v_org;

  insert into public.organization_settings (organization_id, currency, timezone)
  values (v_org, v_currency, coalesce(nullif(p ->> 'timezone', ''), 'Africa/Lagos'));

  insert into public.roles (organization_id, key, name, description, is_system, is_owner)
  select v_org, role_key, name, description, true, is_owner from app.role_templates order by sort;
  insert into public.role_permissions (role_id, permission_key, organization_id)
  select r.id, tp.permission_key, v_org
  from app.role_template_permissions tp join public.roles r on r.organization_id = v_org and r.key = tp.role_key;

  insert into public.organization_members (organization_id, user_id, job_title)
  values (v_org, v_uid, nullif(p ->> 'job_title', '')) returning id into v_member;
  select id into v_owner_role from public.roles where organization_id = v_org and is_owner;
  insert into public.member_roles (member_id, role_id, organization_id, assigned_by) values (v_member, v_owner_role, v_org, v_uid);

  perform app.seed_org_defaults(v_org);
  update public.profiles set last_organization_id = v_org where id = v_uid;
  perform app.audit(v_org, 'create', 'organizations', v_org, 'Organisation created');
  return v_org;
end $$;

create or replace function public.create_factory(p_org uuid, p jsonb) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_factory uuid; v_wh uuid; v_code text; v_n int; i int;
begin
  perform app.require_permission(p_org, 'work_centres.manage');
  if (select count(*) from public.factories where organization_id = p_org and deleted_at is null) >= 50 then
    perform app.raise_rule('Factory limit reached');
  end if;
  v_code := upper(coalesce(nullif(p ->> 'code', ''), regexp_replace(left(upper(coalesce(p ->> 'name', 'F')), 6), '[^A-Z0-9]', '', 'g')));
  if v_code = '' then v_code := 'F'; end if;
  while exists (select 1 from public.factories where organization_id = p_org and code = v_code) loop
    v_code := left(v_code, 16) || substr(md5(random()::text), 1, 3);
    v_code := upper(v_code);
  end loop;

  insert into public.factories (organization_id, name, code, address, capacity_per_day, capacity_unit, planned_work_centres,
                                opens_at, closes_at, working_days, timezone)
  values (p_org, trim(p ->> 'name'), v_code, p ->> 'address', nullif(p ->> 'capacity_per_day', '')::numeric,
          nullif(p ->> 'capacity_unit', ''), nullif(p ->> 'work_centre_count', '')::int,
          nullif(p ->> 'opens_at', '')::time, nullif(p ->> 'closes_at', '')::time,
          coalesce((select array_agg(x::smallint) from jsonb_array_elements_text(p -> 'working_days') x), '{1,2,3,4,5,6}'),
          coalesce(nullif(p ->> 'timezone', ''), 'Africa/Lagos'))
  returning id into v_factory;

  insert into public.warehouses (organization_id, factory_id, code, name)
  values (p_org, v_factory, left(v_code, 15) || '-STR', trim(p ->> 'name') || ' store')
  returning id into v_wh;
  update public.factories set default_warehouse_id = v_wh where id = v_factory;

  v_n := least(coalesce(nullif(p ->> 'work_centre_count', '')::int, 0), 30);
  for i in 1 .. v_n loop
    insert into public.work_centres (organization_id, factory_id, name, code)
    values (p_org, v_factory, 'Work centre ' || i, left(v_code, 14) || '-WC' || i);
  end loop;

  update public.organizations set onboarding_state = onboarding_state || '{"factory": true}'::jsonb where id = p_org;
  return v_factory;
end $$;

-- Invitations ---------------------------------------------------------------
create or replace function public.create_invitation(p_org uuid, p_email text, p_role uuid)
returns table (invitation_id uuid, token text)
language plpgsql security definer set search_path = public, pg_temp as $$
#variable_conflict use_column
declare v_token text := encode(extensions.gen_random_bytes(24), 'hex'); v_id uuid; v_email text := lower(trim(p_email));
begin
  perform app.require_permission(p_org, 'team.manage');
  if not exists (select 1 from public.roles where id = p_role and organization_id = p_org) then
    raise exception 'role not found' using errcode = 'P0002';
  end if;
  if (select is_owner from public.roles where id = p_role) and not app.is_owner(p_org) then
    raise exception 'Only an owner can invite another owner' using errcode = '42501';
  end if;
  if exists (select 1 from public.organization_members m join auth.users u on u.id = m.user_id
             where m.organization_id = p_org and lower(u.email) = v_email and m.status = 'active') then
    perform app.raise_rule('This person is already a member of the organisation');
  end if;
  update public.invitations set status = 'revoked' where organization_id = p_org and lower(email) = v_email and status = 'pending';
  insert into public.invitations (organization_id, email, role_id, token_hash, invited_by)
  values (p_org, v_email, p_role, encode(extensions.digest(v_token, 'sha256'), 'hex'), auth.uid())
  returning id into v_id;
  perform app.audit(p_org, 'invite', 'invitations', v_id, 'Invited ' || v_email);
  return query select v_id, v_token;
end $$;

create or replace function public.revoke_invitation(p_invitation uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_org uuid;
begin
  select organization_id into v_org from public.invitations where id = p_invitation;
  if v_org is null then raise exception 'invitation not found' using errcode = 'P0002'; end if;
  perform app.require_permission(v_org, 'team.manage');
  update public.invitations set status = 'revoked' where id = p_invitation and status = 'pending';
  perform app.audit(v_org, 'revoke', 'invitations', p_invitation, 'Invitation revoked');
end $$;

create or replace function public.get_invitation(p_token text)
returns table (organization_name text, role_name text, email text, status text, expired boolean)
language sql stable security definer set search_path = public, pg_temp as $$
  select o.name, r.name, i.email, i.status, i.expires_at < now()
  from public.invitations i join public.organizations o on o.id = i.organization_id join public.roles r on r.id = i.role_id
  where i.token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex')
$$;

create or replace function public.accept_invitation(p_token text) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_inv public.invitations; v_member uuid; v_email text;
begin
  if auth.uid() is null then raise exception 'authentication required' using errcode = '42501'; end if;
  select * into v_inv from public.invitations
  where token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex') for update;
  if v_inv.id is null then raise exception 'Invitation not found' using errcode = 'P0002'; end if;
  if v_inv.status <> 'pending' then perform app.raise_rule('This invitation is no longer valid'); end if;
  if v_inv.expires_at < now() then
    update public.invitations set status = 'expired' where id = v_inv.id;
    perform app.raise_rule('This invitation has expired. Ask your administrator for a new one.');
  end if;
  select lower(email) into v_email from auth.users where id = auth.uid();
  if v_email is distinct from lower(v_inv.email) then
    raise exception 'This invitation was sent to a different email address' using errcode = '42501';
  end if;

  insert into public.organization_members (organization_id, user_id, invited_by, status)
  values (v_inv.organization_id, auth.uid(), v_inv.invited_by, 'active')
  on conflict (organization_id, user_id) do update set status = 'active'
  returning id into v_member;
  delete from public.member_roles where member_id = v_member;
  insert into public.member_roles (member_id, role_id, organization_id, assigned_by)
  values (v_member, v_inv.role_id, v_inv.organization_id, v_inv.invited_by);
  update public.invitations set status = 'accepted', accepted_by = auth.uid(), accepted_at = now() where id = v_inv.id;
  update public.profiles set last_organization_id = v_inv.organization_id where id = auth.uid();
  perform app.audit(v_inv.organization_id, 'accept', 'invitations', v_inv.id, 'Invitation accepted by ' || v_email);
  return v_inv.organization_id;
end $$;

-- Members & roles -------------------------------------------------------------
create or replace function app.owner_count(p_org uuid) returns int
language sql stable security definer set search_path = public, pg_temp as $$
  select count(distinct m.id)::int from public.organization_members m
  join public.member_roles mr on mr.member_id = m.id join public.roles r on r.id = mr.role_id
  where m.organization_id = p_org and m.status = 'active' and r.is_owner
$$;

create or replace function public.set_member_roles(p_member uuid, p_roles uuid[]) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_org uuid; v_old jsonb; v_was_owner boolean; v_will_owner boolean;
begin
  select organization_id into v_org from public.organization_members where id = p_member;
  if v_org is null then raise exception 'member not found' using errcode = 'P0002'; end if;
  perform app.require_permission(v_org, 'team.manage');
  if coalesce(array_length(p_roles, 1), 0) = 0 then perform app.raise_rule('A member needs at least one role'); end if;
  if exists (select 1 from unnest(p_roles) r where not exists (select 1 from public.roles x where x.id = r and x.organization_id = v_org)) then
    raise exception 'role not found' using errcode = 'P0002';
  end if;
  select exists (select 1 from public.member_roles mr join public.roles r on r.id = mr.role_id where mr.member_id = p_member and r.is_owner)
    into v_was_owner;
  select exists (select 1 from public.roles where id = any (p_roles) and is_owner) into v_will_owner;
  if (v_was_owner or v_will_owner) and not app.is_owner(v_org) then
    raise exception 'Only an owner can grant or remove the owner role' using errcode = '42501';
  end if;
  if v_was_owner and not v_will_owner and app.owner_count(v_org) <= 1 then
    perform app.raise_rule('The organisation must keep at least one owner');
  end if;
  select jsonb_agg(r.name order by r.name) into v_old from public.member_roles mr join public.roles r on r.id = mr.role_id where mr.member_id = p_member;
  delete from public.member_roles where member_id = p_member;
  insert into public.member_roles (member_id, role_id, organization_id, assigned_by)
  select p_member, r, v_org, auth.uid() from unnest(p_roles) r;
  perform app.audit(v_org, 'role_change', 'organization_members', p_member, 'Member roles changed',
    jsonb_build_object('roles', v_old),
    jsonb_build_object('roles', (select jsonb_agg(name order by name) from public.roles where id = any (p_roles))));
end $$;

create or replace function public.update_member(p_member uuid, p_status text, p_job_title text, p_factory uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_m public.organization_members;
begin
  select * into v_m from public.organization_members where id = p_member;
  if v_m.id is null then raise exception 'member not found' using errcode = 'P0002'; end if;
  perform app.require_permission(v_m.organization_id, 'team.manage');
  if p_status not in ('active', 'suspended', 'removed') then perform app.raise_rule('Invalid status'); end if;
  if p_status <> 'active' and v_m.user_id = auth.uid() then perform app.raise_rule('You cannot suspend or remove yourself'); end if;
  if p_status <> 'active' and exists (select 1 from public.member_roles mr join public.roles r on r.id = mr.role_id
                                      where mr.member_id = p_member and r.is_owner) then
    perform app.raise_rule('Owners cannot be suspended. Transfer ownership first.');
  end if;
  if p_factory is not null and not exists (select 1 from public.factories where id = p_factory and organization_id = v_m.organization_id) then
    raise exception 'factory not found' using errcode = 'P0002';
  end if;
  update public.organization_members set status = p_status, job_title = nullif(trim(p_job_title), ''), factory_id = p_factory
  where id = p_member;
  perform app.audit(v_m.organization_id, 'update', 'organization_members', p_member, 'Member updated',
    jsonb_build_object('status', v_m.status, 'job_title', v_m.job_title, 'factory_id', v_m.factory_id),
    jsonb_build_object('status', p_status, 'job_title', p_job_title, 'factory_id', p_factory));
end $$;

create or replace function public.set_role_permissions(p_role uuid, p_permissions text[]) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_role public.roles; v_old jsonb; v_missing text;
begin
  select * into v_role from public.roles where id = p_role;
  if v_role.id is null then raise exception 'role not found' using errcode = 'P0002'; end if;
  perform app.require_permission(v_role.organization_id, 'roles.manage');
  if v_role.is_owner then perform app.raise_rule('The owner role always has full access'); end if;
  if exists (select 1 from unnest(p_permissions) k where not exists (select 1 from public.permissions p where p.key = k)) then
    perform app.raise_rule('Unknown permission');
  end if;
  -- Anti-escalation: non-owners can only grant permissions they hold themselves.
  if not app.is_owner(v_role.organization_id) then
    select k into v_missing from unnest(p_permissions) k where not app.has_permission(v_role.organization_id, k) limit 1;
    if v_missing is not null then
      raise exception 'You cannot grant a permission you do not have: %', v_missing using errcode = '42501';
    end if;
  end if;
  select jsonb_agg(permission_key order by permission_key) into v_old from public.role_permissions where role_id = p_role;
  delete from public.role_permissions where role_id = p_role;
  insert into public.role_permissions (role_id, permission_key, organization_id)
  select p_role, k, v_role.organization_id from (select distinct unnest(p_permissions) k) x;
  perform app.audit(v_role.organization_id, 'permission_change', 'roles', p_role, 'Permissions changed for ' || v_role.name,
    jsonb_build_object('permissions', v_old), jsonb_build_object('permissions', to_jsonb(p_permissions)));
end $$;

create or replace function public.complete_onboarding(p_org uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform app.require_permission(p_org, 'settings.manage');
  if not exists (select 1 from public.factories where organization_id = p_org and deleted_at is null) then
    perform app.raise_rule('Add at least one factory before finishing setup');
  end if;
  update public.organizations set onboarding_completed_at = coalesce(onboarding_completed_at, now()) where id = p_org;
end $$;

create or replace function public.set_active_organization(p_org uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not app.is_member(p_org) then raise exception 'not a member' using errcode = '42501'; end if;
  update public.profiles set last_organization_id = p_org where id = auth.uid();
end $$;
