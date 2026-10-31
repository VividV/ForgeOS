-- Local development bootstrap ONLY.
-- Recreates the roles and schemas a hosted Supabase project already has, so the
-- migrations in ../migrations can run unchanged against a plain PostgreSQL 15+
-- instance together with the Supabase Auth (GoTrue) and PostgREST binaries.
-- Never run this against a hosted Supabase project.

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin noinherit bypassrls;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticator') then
    create role authenticator login noinherit password 'postgres';
  end if;
  if not exists (select 1 from pg_roles where rolname = 'supabase_auth_admin') then
    create role supabase_auth_admin login noinherit createrole password 'postgres';
  end if;
end $$;

grant anon, authenticated, service_role to authenticator;

create schema if not exists auth authorization supabase_auth_admin;
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

grant usage on schema auth to anon, authenticated, service_role, postgres;
grant usage on schema extensions to anon, authenticated, service_role;
grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;

alter role supabase_auth_admin set search_path = auth;
alter database postgres set "app.settings.local" = 'true';
alter database postgres set search_path = "$user", public, extensions;
alter role authenticator set search_path = "$user", public, extensions;
