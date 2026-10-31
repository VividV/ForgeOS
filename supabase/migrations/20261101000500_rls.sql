-- Row Level Security. Default deny: every public table has RLS enabled; access is
-- granted only through the policies below. Workflow tables have no write
-- policies at all: they change only through SECURITY DEFINER functions that
-- verify permissions and keep the ledger consistent.

do $$
declare t record;
begin
  for t in select tablename from pg_tables where schemaname = 'public' and tablename <> '_local_migrations' loop
    execute format('alter table public.%I enable row level security', t.tablename);
    execute format('revoke all on public.%I from anon', t.tablename);
  end loop;
end $$;

-- helper: any of several permissions
create or replace function app.has_any(p_org uuid, p_perms text[]) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from unnest(p_perms) k where app.has_permission(p_org, k))
$$;

-- Soft-delete guard: setting deleted_at requires a specific permission.
create or replace function app.tg_soft_delete_guard() returns trigger
language plpgsql as $$
begin
  if new.deleted_at is distinct from old.deleted_at and current_user = 'authenticated'
     and not app.has_permission(new.organization_id, tg_argv[0]) then
    raise exception 'missing permission: %', tg_argv[0] using errcode = '42501';
  end if;
  return new;
end $$;
create trigger products_soft_delete before update of deleted_at on public.products
  for each row execute function app.tg_soft_delete_guard('products.delete');
create trigger materials_soft_delete before update of deleted_at on public.materials
  for each row execute function app.tg_soft_delete_guard('materials.delete');

-- organization_id is immutable on every table that has it.
create or replace function app.tg_org_immutable() returns trigger
language plpgsql as $$
begin
  if new.organization_id is distinct from old.organization_id then
    raise exception 'organization_id cannot change' using errcode = '42501';
  end if;
  return new;
end $$;
do $$
declare t record;
begin
  for t in select c.table_name from information_schema.columns c
           join information_schema.tables tb on tb.table_name = c.table_name and tb.table_schema = c.table_schema and tb.table_type = 'BASE TABLE'
           where c.table_schema = 'public' and c.column_name = 'organization_id'
             and c.table_name not in ('audit_logs', 'inventory_transactions', 'production_logs', 'production_outputs',
                                      'production_order_status_history', 'stock_adjustments')
  loop
    execute format('create trigger %I before update on public.%I for each row execute function app.tg_org_immutable()',
                   t.table_name || '_org_immutable', t.table_name);
  end loop;
end $$;

-- Reference tables
create policy permissions_read on public.permissions for select to authenticated using (true);

-- Profiles: yourself, and people you share an organisation with.
create policy profiles_select on public.profiles for select to authenticated using (
  id = auth.uid() or exists (
    select 1 from public.organization_members a
    join public.organization_members b on b.organization_id = a.organization_id
    where a.user_id = auth.uid() and a.status = 'active' and b.user_id = profiles.id)
);
create policy profiles_update on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- Organisations
create policy organizations_select on public.organizations for select to authenticated using (app.is_member(id));
create policy organizations_update on public.organizations for update to authenticated
  using (app.has_permission(id, 'settings.manage')) with check (app.has_permission(id, 'settings.manage'));
create policy org_settings_select on public.organization_settings for select to authenticated using (app.is_member(organization_id));
create policy org_settings_update on public.organization_settings for update to authenticated
  using (app.has_permission(organization_id, 'settings.manage')) with check (app.has_permission(organization_id, 'settings.manage'));

-- Membership & RBAC (writes via functions)
create policy members_select on public.organization_members for select to authenticated using (
  user_id = auth.uid() or app.has_any(organization_id, array['team.read', 'job_cards.create', 'production_orders.read']));
create policy roles_select on public.roles for select to authenticated using (app.is_member(organization_id));
create policy roles_insert on public.roles for insert to authenticated with check (
  app.has_permission(organization_id, 'roles.manage') and not is_system and not is_owner);
create policy roles_update on public.roles for update to authenticated
  using (app.has_permission(organization_id, 'roles.manage') and not is_system)
  with check (app.has_permission(organization_id, 'roles.manage') and not is_system and not is_owner);
create policy roles_delete on public.roles for delete to authenticated using (
  app.has_permission(organization_id, 'roles.manage') and not is_system);
create policy role_permissions_select on public.role_permissions for select to authenticated using (
  app.has_any(organization_id, array['roles.read', 'team.read']));
create policy member_roles_select on public.member_roles for select to authenticated using (
  app.has_any(organization_id, array['team.read', 'roles.read'])
  or member_id = app.member_id(organization_id));
create policy invitations_select on public.invitations for select to authenticated using (
  app.has_permission(organization_id, 'team.manage'));

-- Factories, work centres, warehouses, stages, units: visible to all members.
create policy factories_select on public.factories for select to authenticated using (app.is_member(organization_id));
create policy factories_write on public.factories for all to authenticated
  using (app.has_permission(organization_id, 'work_centres.manage'))
  with check (app.has_permission(organization_id, 'work_centres.manage'));
create policy work_centres_select on public.work_centres for select to authenticated using (app.is_member(organization_id));
create policy work_centres_write on public.work_centres for all to authenticated
  using (app.has_permission(organization_id, 'work_centres.manage'))
  with check (app.has_permission(organization_id, 'work_centres.manage'));
create policy warehouses_select on public.warehouses for select to authenticated using (app.is_member(organization_id));
create policy warehouses_write on public.warehouses for all to authenticated
  using (app.has_permission(organization_id, 'warehouses.manage'))
  with check (app.has_permission(organization_id, 'warehouses.manage'));
create policy warehouse_locations_select on public.warehouse_locations for select to authenticated using (app.is_member(organization_id));
create policy warehouse_locations_write on public.warehouse_locations for all to authenticated
  using (app.has_permission(organization_id, 'warehouses.manage'))
  with check (app.has_permission(organization_id, 'warehouses.manage'));
create policy uom_select on public.units_of_measure for select to authenticated using (app.is_member(organization_id));
create policy uom_write on public.units_of_measure for all to authenticated
  using (app.has_permission(organization_id, 'settings.manage'))
  with check (app.has_permission(organization_id, 'settings.manage'));
create policy stages_select on public.production_stages for select to authenticated using (app.is_member(organization_id));
create policy stages_write on public.production_stages for all to authenticated
  using (app.has_permission(organization_id, 'routing.manage'))
  with check (app.has_permission(organization_id, 'routing.manage'));
create policy routings_select on public.routing_templates for select to authenticated using (app.is_member(organization_id));
create policy routings_write on public.routing_templates for all to authenticated
  using (app.has_permission(organization_id, 'routing.manage'))
  with check (app.has_permission(organization_id, 'routing.manage'));
create policy routing_steps_select on public.routing_steps for select to authenticated using (app.is_member(organization_id));
create policy routing_steps_write on public.routing_steps for all to authenticated
  using (app.has_permission(organization_id, 'routing.manage'))
  with check (app.has_permission(organization_id, 'routing.manage'));

-- Suppliers
create policy suppliers_select on public.suppliers for select to authenticated using (
  app.has_any(organization_id, array['suppliers.read', 'materials.read']));
create policy suppliers_insert on public.suppliers for insert to authenticated with check (app.has_permission(organization_id, 'suppliers.manage'));
create policy suppliers_update on public.suppliers for update to authenticated
  using (app.has_permission(organization_id, 'suppliers.manage')) with check (app.has_permission(organization_id, 'suppliers.manage'));

-- Products
create policy product_categories_select on public.product_categories for select to authenticated using (app.is_member(organization_id));
create policy product_categories_write on public.product_categories for all to authenticated
  using (app.has_permission(organization_id, 'products.update'))
  with check (app.has_any(organization_id, array['products.create', 'products.update']));
create policy products_select on public.products for select to authenticated using (
  app.has_any(organization_id, array['products.read', 'bom.read', 'production_orders.read', 'inventory.read']));
create policy products_insert on public.products for insert to authenticated with check (app.has_permission(organization_id, 'products.create'));
create policy products_update on public.products for update to authenticated
  using (app.has_any(organization_id, array['products.update', 'products.delete']))
  with check (app.has_any(organization_id, array['products.update', 'products.delete']));
create policy variants_select on public.product_variants for select to authenticated using (
  app.has_any(organization_id, array['products.read', 'bom.read', 'production_orders.read', 'inventory.read']));
create policy variants_insert on public.product_variants for insert to authenticated with check (
  app.has_any(organization_id, array['products.create', 'products.update']));
create policy variants_update on public.product_variants for update to authenticated
  using (app.has_permission(organization_id, 'products.update')) with check (app.has_permission(organization_id, 'products.update'));

-- Materials
create policy material_categories_select on public.material_categories for select to authenticated using (app.is_member(organization_id));
create policy material_categories_write on public.material_categories for all to authenticated
  using (app.has_permission(organization_id, 'materials.update'))
  with check (app.has_any(organization_id, array['materials.create', 'materials.update']));
create policy materials_select on public.materials for select to authenticated using (
  app.has_any(organization_id, array['materials.read', 'inventory.read', 'bom.read', 'production_orders.read']));
create policy materials_insert on public.materials for insert to authenticated with check (app.has_permission(organization_id, 'materials.create'));
create policy materials_update on public.materials for update to authenticated
  using (app.has_any(organization_id, array['materials.update', 'materials.delete']))
  with check (app.has_any(organization_id, array['materials.update', 'materials.delete']));

-- Inventory (read-only; writes via inventory functions)
create policy stock_items_select on public.stock_items for select to authenticated using (
  app.has_any(organization_id, array['materials.read', 'products.read', 'inventory.read', 'bom.read', 'production_orders.read']));
create policy balances_select on public.inventory_balances for select to authenticated using (
  app.has_any(organization_id, array['inventory.read', 'production_orders.read', 'materials.read']));
create policy inv_txn_select on public.inventory_transactions for select to authenticated using (
  app.has_any(organization_id, array['inventory.read', 'production_orders.read']));
create policy stock_adjustments_select on public.stock_adjustments for select to authenticated using (
  app.has_permission(organization_id, 'inventory.read'));
create policy reservations_select on public.material_reservations for select to authenticated using (
  app.has_any(organization_id, array['inventory.read', 'production_orders.read']));

-- BOMs
create policy boms_select on public.bills_of_materials for select to authenticated using (
  app.has_any(organization_id, array['bom.read', 'production_orders.read']));
create policy boms_insert on public.bills_of_materials for insert to authenticated with check (
  app.has_permission(organization_id, 'bom.create') and status = 'draft');
create policy boms_update on public.bills_of_materials for update to authenticated
  using (app.has_permission(organization_id, 'bom.update')) with check (app.has_permission(organization_id, 'bom.update'));
create policy boms_delete on public.bills_of_materials for delete to authenticated using (
  app.has_permission(organization_id, 'bom.update') and status = 'draft');
create policy bom_items_select on public.bom_items for select to authenticated using (
  app.has_any(organization_id, array['bom.read', 'production_orders.read']));
create policy bom_items_write on public.bom_items for all to authenticated
  using (app.has_permission(organization_id, 'bom.update')) with check (app.has_permission(organization_id, 'bom.update'));

-- Production (writes via workflow functions, except editing draft order fields)
create policy po_select on public.production_orders for select to authenticated using (
  app.has_permission(organization_id, 'production_orders.read'));
create policy po_update on public.production_orders for update to authenticated
  using (app.has_permission(organization_id, 'production_orders.update'))
  with check (app.has_permission(organization_id, 'production_orders.update'));
create policy po_history_select on public.production_order_status_history for select to authenticated using (
  app.has_permission(organization_id, 'production_orders.read'));
create policy po_materials_select on public.production_order_materials for select to authenticated using (
  app.has_any(organization_id, array['production_orders.read', 'inventory.read']));
create policy po_operations_select on public.production_operations for select to authenticated using (
  app.has_permission(organization_id, 'production_orders.read'));
create policy job_cards_select on public.job_cards for select to authenticated using (
  app.has_any(organization_id, array['job_cards.read', 'production_orders.read'])
  or (assigned_user_id = auth.uid() and app.has_permission(organization_id, 'job_cards.work')));
create policy production_logs_select on public.production_logs for select to authenticated using (
  app.has_permission(organization_id, 'production_orders.read')
  or (created_by = auth.uid() and app.is_member(organization_id)));
create policy downtime_select on public.downtime_logs for select to authenticated using (
  app.has_permission(organization_id, 'production_orders.read'));
create policy scrap_select on public.production_scrap for select to authenticated using (
  app.has_permission(organization_id, 'production_orders.read'));
create policy outputs_select on public.production_outputs for select to authenticated using (
  app.has_permission(organization_id, 'production_orders.read'));

-- Notifications: own rows only; only read_at may change.
create policy notifications_select on public.notifications for select to authenticated using (
  user_id = auth.uid() and app.is_member(organization_id));
create policy notifications_update on public.notifications for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
revoke update on public.notifications from authenticated;
grant update (read_at) on public.notifications to authenticated;
create policy notification_prefs_own on public.notification_preferences for all to authenticated
  using (user_id = auth.uid() and app.is_member(organization_id))
  with check (user_id = auth.uid() and app.is_member(organization_id));

-- Audit log
create policy audit_select on public.audit_logs for select to authenticated using (
  app.has_permission(organization_id, 'audit_logs.read'));

-- Sensitive columns that clients must never write directly.
revoke insert, update, delete on public.inventory_transactions, public.inventory_balances, public.stock_items,
  public.audit_logs, public.stock_adjustments, public.material_reservations, public.production_order_materials,
  public.production_operations, public.job_cards, public.production_logs, public.production_outputs,
  public.production_scrap, public.downtime_logs, public.production_order_status_history,
  public.organization_members, public.member_roles, public.role_permissions, public.invitations,
  public.document_sequences
  from authenticated;
revoke insert, delete on public.organizations, public.organization_settings, public.production_orders from authenticated;
