-- Workforce: employees (who don't need a login), departments, shifts and attendance.
-- Pay rates are kept apart from employee records so only managers and cost viewers see them.

insert into public.permissions (key, module, action, description) values
  ('workforce.read', 'workforce', 'read', 'View employees, departments, shifts and attendance'),
  ('workforce.manage', 'workforce', 'manage', 'Manage employees, departments, shifts and pay rates'),
  ('attendance.record', 'attendance', 'record', 'Take daily attendance')
on conflict (key) do nothing;

insert into app.role_template_permissions (role_key, permission_key)
select r.role_key, p.key from (values
  ('administrator', array['workforce.read', 'workforce.manage', 'attendance.record']),
  ('production_manager', array['workforce.read', 'attendance.record']),
  ('supervisor', array['workforce.read', 'attendance.record']),
  ('finance_analyst', array['workforce.read'])
) as r(role_key, perms)
cross join lateral unnest(r.perms) as p(key)
on conflict do nothing;
insert into public.role_permissions (role_id, permission_key, organization_id)
select ro.id, tp.permission_key, ro.organization_id
from public.roles ro join app.role_template_permissions tp on tp.role_key = ro.key
where ro.is_system and not ro.is_owner and tp.permission_key in ('workforce.read', 'workforce.manage', 'attendance.record')
on conflict do nothing;

create table public.departments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name text not null check (length(trim(name)) between 2 and 80),
  factory_id uuid references public.factories (id) on delete set null,
  description text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid,
  unique (organization_id, name),
  unique (organization_id, id)
);
create trigger departments_touch before update on public.departments for each row execute function app.tg_touch();

create table public.shifts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name text not null check (length(trim(name)) between 2 and 60),
  factory_id uuid references public.factories (id) on delete set null,
  start_time time not null,
  end_time time not null,
  break_minutes integer not null default 0 check (break_minutes between 0 and 600),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid,
  unique (organization_id, name),
  unique (organization_id, id)
);
create trigger shifts_touch before update on public.shifts for each row execute function app.tg_touch();

-- Scheduled hours of a shift (handles overnight shifts).
create or replace function app.shift_hours(p_start time, p_end time, p_break int) returns numeric
language sql immutable as $$
  select round(greatest(extract(epoch from (case when p_end > p_start then p_end - p_start else p_end - p_start + interval '24 hours' end)) / 3600
                        - coalesce(p_break, 0) / 60.0, 0)::numeric, 2)
$$;

create table public.employees (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  code text not null check (code ~ '^[A-Z0-9][A-Z0-9_-]{0,23}$'),
  full_name text not null check (length(trim(full_name)) between 2 and 120),
  department_id uuid,
  factory_id uuid references public.factories (id) on delete set null,
  default_shift_id uuid,
  job_title text,
  phone text,
  email text,
  employment_type text not null default 'full_time' check (employment_type in ('full_time', 'part_time', 'contract', 'casual', 'apprentice')),
  skills text[] not null default '{}',
  user_id uuid references public.profiles (id) on delete set null,
  start_date date,
  status text not null default 'active' check (status in ('active', 'on_leave', 'left')),
  notes text,
  created_by uuid references public.profiles (id) default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid,
  unique (organization_id, code),
  unique (organization_id, id),
  foreign key (organization_id, department_id) references public.departments (organization_id, id),
  foreign key (organization_id, default_shift_id) references public.shifts (organization_id, id)
);
create unique index employees_user_unique on public.employees (organization_id, user_id) where user_id is not null;
create index employees_department_idx on public.employees (department_id);
create trigger employees_touch before update on public.employees for each row execute function app.tg_touch();
create trigger employees_audit after insert or update on public.employees for each row execute function app.tg_audit_row();

create table public.employee_pay (
  employee_id uuid primary key references public.employees (id) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  hourly_rate numeric(18, 4) check (hourly_rate is null or hourly_rate >= 0),
  overtime_multiplier numeric(5, 2) not null default 1.5 check (overtime_multiplier between 1 and 5),
  updated_at timestamptz not null default now(),
  updated_by uuid default auth.uid()
);
create trigger employee_pay_audit after insert or update on public.employee_pay for each row execute function app.tg_audit_row();

create table public.attendance_records (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  employee_id uuid not null,
  work_date date not null,
  shift_id uuid,
  status text not null check (status in ('present', 'late', 'half_day', 'absent', 'leave', 'off')),
  clock_in time,
  clock_out time,
  hours_worked numeric(6, 2) not null default 0 check (hours_worked between 0 and 24),
  overtime_hours numeric(6, 2) not null default 0 check (overtime_hours between 0 and 24),
  notes text,
  recorded_by uuid references public.profiles (id) default auth.uid(),
  recorded_at timestamptz not null default now(),
  unique (employee_id, work_date),
  foreign key (organization_id, employee_id) references public.employees (organization_id, id) on delete cascade,
  foreign key (organization_id, shift_id) references public.shifts (organization_id, id)
);
create index attendance_org_date_idx on public.attendance_records (organization_id, work_date);
create trigger attendance_audit after update or delete on public.attendance_records for each row execute function app.tg_audit_row();

-- Labour costs can name the employee who did the work.
alter table public.labour_cost_entries add column employee_id uuid references public.employees (id) on delete set null;

-- RLS
alter table public.departments enable row level security;
alter table public.shifts enable row level security;
alter table public.employees enable row level security;
alter table public.employee_pay enable row level security;
alter table public.attendance_records enable row level security;
revoke all on public.departments, public.shifts, public.employees, public.employee_pay, public.attendance_records from anon;

create policy departments_select on public.departments for select to authenticated using (app.has_any(organization_id, array['workforce.read', 'attendance.record', 'costing.manage']));
create policy departments_write on public.departments for all to authenticated
  using (app.has_permission(organization_id, 'workforce.manage')) with check (app.has_permission(organization_id, 'workforce.manage'));
create policy shifts_select on public.shifts for select to authenticated using (app.has_any(organization_id, array['workforce.read', 'attendance.record']));
create policy shifts_write on public.shifts for all to authenticated
  using (app.has_permission(organization_id, 'workforce.manage')) with check (app.has_permission(organization_id, 'workforce.manage'));
create policy employees_select on public.employees for select to authenticated using (
  app.has_any(organization_id, array['workforce.read', 'attendance.record', 'costing.manage']) or (user_id = auth.uid() and app.is_member(organization_id)));
create policy employees_insert on public.employees for insert to authenticated with check (app.has_permission(organization_id, 'workforce.manage'));
create policy employees_update on public.employees for update to authenticated
  using (app.has_permission(organization_id, 'workforce.manage')) with check (app.has_permission(organization_id, 'workforce.manage'));
create policy employee_pay_select on public.employee_pay for select to authenticated using (
  app.has_permission(organization_id, 'workforce.manage') or app.has_permission(organization_id, 'costing.read'));
create policy employee_pay_write on public.employee_pay for all to authenticated
  using (app.has_permission(organization_id, 'workforce.manage')) with check (app.has_permission(organization_id, 'workforce.manage'));
create policy attendance_select on public.attendance_records for select to authenticated using (
  app.has_any(organization_id, array['workforce.read', 'attendance.record'])
  or exists (select 1 from public.employees e where e.id = employee_id and e.user_id = auth.uid()));
revoke insert, update, delete on public.attendance_records from authenticated;
revoke delete on public.employees from authenticated;

do $$
declare t text;
begin
  foreach t in array array['departments', 'shifts', 'employees', 'employee_pay'] loop
    execute format('create trigger %I before update on public.%I for each row execute function app.tg_org_immutable()', t || '_org_immutable', t);
  end loop;
end $$;

-- Pay rows must belong to an employee of the same organisation.
create or replace function app.tg_employee_pay_org() returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not exists (select 1 from public.employees where id = new.employee_id and organization_id = new.organization_id) then
    raise exception 'Employee not found' using errcode = 'P0002';
  end if;
  new.updated_at := now();
  return new;
end $$;
create trigger employee_pay_org before insert or update on public.employee_pay for each row execute function app.tg_employee_pay_org();

-- Daily attendance register (upsert per employee and day).
-- p: {work_date, shift_id, entries: [{employee_id, status, clock_in, clock_out, shift_id, notes}]}
create or replace function public.attendance_record(p_org uuid, p jsonb) returns integer
language plpgsql security definer set search_path = public, pg_temp as $$
declare e jsonb; v_date date := (p ->> 'work_date')::date; v_shift public.shifts; v_status text; v_in time; v_out time; v_hours numeric; v_sched numeric;
        v_emp public.employees; n int := 0; v_tz text;
begin
  perform app.require_permission(p_org, 'attendance.record');
  if v_date is null then perform app.raise_rule('Choose a date'); end if;
  select timezone into v_tz from public.organization_settings where organization_id = p_org;
  if v_date > (now() at time zone coalesce(v_tz, 'UTC'))::date then perform app.raise_rule('Attendance cannot be recorded for a future date'); end if;
  for e in select * from jsonb_array_elements(coalesce(p -> 'entries', '[]'::jsonb)) loop
    select * into v_emp from public.employees where id = (e ->> 'employee_id')::uuid and organization_id = p_org;
    if v_emp.id is null then raise exception 'Employee not found' using errcode = 'P0002'; end if;
    v_status := e ->> 'status';
    continue when coalesce(v_status, '') = '';
    if v_status not in ('present', 'late', 'half_day', 'absent', 'leave', 'off') then perform app.raise_rule('Invalid attendance status'); end if;
    select * into v_shift from public.shifts where organization_id = p_org
      and id = coalesce(nullif(e ->> 'shift_id', '')::uuid, nullif(p ->> 'shift_id', '')::uuid, v_emp.default_shift_id);
    v_in := nullif(e ->> 'clock_in', '')::time;
    v_out := nullif(e ->> 'clock_out', '')::time;
    v_sched := case when v_shift.id is null then 8 else app.shift_hours(v_shift.start_time, v_shift.end_time, v_shift.break_minutes) end;
    if v_status in ('absent', 'leave', 'off') then
      v_hours := 0; v_in := null; v_out := null;
    elsif v_in is not null and v_out is not null then
      v_hours := app.shift_hours(v_in, v_out, coalesce(v_shift.break_minutes, 0));
    elsif v_status = 'half_day' then
      v_hours := round(v_sched / 2, 2);
    else
      v_hours := v_sched;
    end if;
    insert into public.attendance_records (organization_id, employee_id, work_date, shift_id, status, clock_in, clock_out, hours_worked, overtime_hours, notes)
    values (p_org, v_emp.id, v_date, v_shift.id, v_status, v_in, v_out, least(v_hours, 24), least(greatest(v_hours - v_sched, 0), 24), nullif(e ->> 'notes', ''))
    on conflict (employee_id, work_date) do update set shift_id = excluded.shift_id, status = excluded.status, clock_in = excluded.clock_in,
      clock_out = excluded.clock_out, hours_worked = excluded.hours_worked, overtime_hours = excluded.overtime_hours, notes = excluded.notes,
      recorded_by = auth.uid(), recorded_at = now();
    n := n + 1;
  end loop;
  return n;
end $$;

create or replace function public.attendance_summary(p_org uuid, p_from date, p_to date)
returns table (employee_id uuid, code text, full_name text, department text, days_recorded bigint, present bigint, late bigint, half_days bigint,
               absent bigint, leave bigint, hours numeric, overtime numeric)
language sql stable security definer set search_path = public, pg_temp as $$
  select e.id, e.code, e.full_name, d.name,
         count(a.id), count(a.id) filter (where a.status = 'present'), count(a.id) filter (where a.status = 'late'),
         count(a.id) filter (where a.status = 'half_day'), count(a.id) filter (where a.status = 'absent'), count(a.id) filter (where a.status = 'leave'),
         coalesce(sum(a.hours_worked), 0), coalesce(sum(a.overtime_hours), 0)
  from public.employees e
  left join public.departments d on d.id = e.department_id
  left join public.attendance_records a on a.employee_id = e.id and a.work_date between p_from and p_to
  where e.organization_id = p_org and app.has_any(p_org, array['workforce.read', 'attendance.record'])
    and (e.status <> 'left' or a.id is not null)
  group by e.id, e.code, e.full_name, d.name
  order by e.full_name
$$;

-- Cost entries: an employee's own hourly rate is used before the default labour rate.
create or replace function public.cost_entry_add(p_order uuid, p jsonb) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare o public.production_orders; v_id uuid; v_type text := coalesce(nullif(p ->> 'entry_type', ''), 'labour'); v_rate numeric; v_wc uuid;
        v_emp public.employees;
begin
  select * into o from public.production_orders where id = p_order for update;
  if o.id is null then raise exception 'Order not found' using errcode = 'P0002'; end if;
  perform app.require_permission(o.organization_id, 'costing.manage');
  if o.status in ('draft', 'awaiting_approval', 'completed', 'cancelled') then
    perform app.raise_rule('Costs can be recorded on approved orders that are not yet completed');
  end if;
  if v_type = 'overhead' then
    if coalesce(trim(p ->> 'description'), '') = '' then perform app.raise_rule('Describe the cost'); end if;
    if coalesce((p ->> 'amount')::numeric, -1) < 0 then perform app.raise_rule('Enter an amount'); end if;
    insert into public.overhead_cost_entries (organization_id, production_order_id, category, description, amount)
    values (o.organization_id, p_order, coalesce(nullif(p ->> 'category', ''), 'overhead'), p ->> 'description', (p ->> 'amount')::numeric)
    returning id into v_id;
  else
    v_wc := nullif(p ->> 'work_centre_id', '')::uuid;
    v_rate := nullif(p ->> 'rate', '')::numeric;
    if nullif(p ->> 'employee_id', '') is not null then
      select * into v_emp from public.employees where id = (p ->> 'employee_id')::uuid and organization_id = o.organization_id;
      if v_emp.id is null then raise exception 'Employee not found' using errcode = 'P0002'; end if;
    end if;
    if v_rate is null then
      if v_type = 'machine' then
        select hourly_cost into v_rate from public.work_centres where id = v_wc and organization_id = o.organization_id;
      else
        if v_emp.id is not null then select hourly_rate into v_rate from public.employee_pay where employee_id = v_emp.id; end if;
        if v_rate is null then
          select rate into v_rate from public.cost_rates where organization_id = o.organization_id and kind = 'labour' and is_default and is_active;
        end if;
      end if;
    end if;
    if v_rate is null then perform app.raise_rule(case when v_type = 'machine' then 'Set an hourly cost on the work centre or enter a rate' else 'Set a default labour rate or enter a rate' end); end if;
    insert into public.labour_cost_entries (organization_id, production_order_id, operation_id, entry_type, worker_id, worker_name, employee_id, work_centre_id, hours, rate, entry_date, notes)
    values (o.organization_id, p_order, nullif(p ->> 'operation_id', '')::uuid, v_type, coalesce(nullif(p ->> 'worker_id', '')::uuid, v_emp.user_id),
            coalesce(nullif(p ->> 'worker_name', ''), v_emp.full_name), v_emp.id,
            v_wc, (p ->> 'hours')::numeric, v_rate, coalesce(nullif(p ->> 'entry_date', '')::date, current_date), nullif(p ->> 'notes', ''))
    returning id into v_id;
  end if;
  perform app.audit(o.organization_id, 'cost_entry', 'production_orders', p_order, 'Cost recorded (' || v_type || ')', null, p);
  return v_id;
end $$;

grant execute on function public.attendance_record(uuid, jsonb), public.attendance_summary(uuid, date, date) to authenticated;
