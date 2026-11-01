-- Atomic CSV imports. Either every row is saved or none is; errors name the row.

create or replace function public.import_materials(p_org uuid, p_rows jsonb, p_warehouse uuid default null)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  r jsonb; i int := 0; v_uom uuid; v_cat uuid; v_mat uuid; v_si uuid; v_created int := 0; v_opening int := 0;
  v_qty numeric; v_cost numeric;
begin
  perform app.require_permission(p_org, 'materials.create');
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) = 0 then perform app.raise_rule('The file has no rows'); end if;
  if jsonb_array_length(p_rows) > 5000 then perform app.raise_rule('Import at most 5,000 rows at a time'); end if;
  if exists (select 1 from jsonb_array_elements(p_rows) x where coalesce((x ->> 'opening_quantity')::numeric, 0) > 0) then
    perform app.require_permission(p_org, 'inventory.create');
    if p_warehouse is null then perform app.raise_rule('Choose a warehouse for opening balances'); end if;
  end if;
  perform set_config('app.audit_source', 'import', true);

  for r in select * from jsonb_array_elements(p_rows) loop
    i := i + 1;
    select id into v_uom from public.units_of_measure where organization_id = p_org and code = lower(trim(r ->> 'unit'));
    if v_uom is null then perform app.raise_rule(format('Row %s: unknown unit "%s"', i, r ->> 'unit')); end if;
    if exists (select 1 from public.materials where organization_id = p_org and code = upper(trim(r ->> 'code'))) then
      perform app.raise_rule(format('Row %s: material code %s already exists', i, upper(trim(r ->> 'code'))));
    end if;
    v_cat := null;
    if nullif(trim(r ->> 'category'), '') is not null then
      select id into v_cat from public.material_categories where organization_id = p_org and lower(name) = lower(trim(r ->> 'category'));
      if v_cat is null then
        insert into public.material_categories (organization_id, name) values (p_org, trim(r ->> 'category')) returning id into v_cat;
      end if;
    end if;
    begin
      insert into public.materials (organization_id, code, name, kind, category_id, sku, stock_uom_id, standard_cost, reorder_level, min_stock, max_stock, description, default_warehouse_id)
      values (p_org, upper(trim(r ->> 'code')), trim(r ->> 'name'), coalesce(nullif(r ->> 'kind', ''), 'raw_material'), v_cat, nullif(trim(r ->> 'sku'), ''),
              v_uom, nullif(r ->> 'standard_cost', '')::numeric, coalesce(nullif(r ->> 'reorder_level', '')::numeric, 0),
              coalesce(nullif(r ->> 'min_stock', '')::numeric, 0), nullif(r ->> 'max_stock', '')::numeric, nullif(r ->> 'description', ''), p_warehouse)
      returning id into v_mat;
    exception when others then
      perform app.raise_rule(format('Row %s: %s', i, sqlerrm));
    end;
    v_created := v_created + 1;
    v_qty := coalesce(nullif(r ->> 'opening_quantity', '')::numeric, 0);
    if v_qty > 0 then
      v_cost := coalesce(nullif(r ->> 'opening_unit_cost', '')::numeric, nullif(r ->> 'standard_cost', '')::numeric, 0);
      select id into v_si from public.stock_items where material_id = v_mat;
      perform app.post_inventory_txn(p_org, v_si, p_warehouse, 'opening_balance', v_qty, v_cost, 'given', 'none', false,
        'import', null, null, null, null, null, 'Opening balance (CSV import)', null, null);
      v_opening := v_opening + 1;
    elsif v_qty < 0 then
      perform app.raise_rule(format('Row %s: opening quantity cannot be negative', i));
    end if;
  end loop;
  perform app.audit(p_org, 'import', 'materials', null, format('Imported %s materials (%s with opening balances)', v_created, v_opening), null, null, 'import');
  return jsonb_build_object('created', v_created, 'opening_balances', v_opening);
end $$;

create or replace function public.import_products(p_org uuid, p_rows jsonb)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare r jsonb; i int := 0; v_uom uuid; v_cat uuid; v_created int := 0;
begin
  perform app.require_permission(p_org, 'products.create');
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) = 0 then perform app.raise_rule('The file has no rows'); end if;
  if jsonb_array_length(p_rows) > 5000 then perform app.raise_rule('Import at most 5,000 rows at a time'); end if;
  perform set_config('app.audit_source', 'import', true);
  for r in select * from jsonb_array_elements(p_rows) loop
    i := i + 1;
    select id into v_uom from public.units_of_measure where organization_id = p_org and code = lower(coalesce(nullif(trim(r ->> 'unit'), ''), 'pcs'));
    if v_uom is null then perform app.raise_rule(format('Row %s: unknown unit "%s"', i, r ->> 'unit')); end if;
    if exists (select 1 from public.products where organization_id = p_org and code = upper(trim(r ->> 'code'))) then
      perform app.raise_rule(format('Row %s: product code %s already exists', i, upper(trim(r ->> 'code'))));
    end if;
    v_cat := null;
    if nullif(trim(r ->> 'category'), '') is not null then
      select id into v_cat from public.product_categories where organization_id = p_org and lower(name) = lower(trim(r ->> 'category'));
      if v_cat is null then
        insert into public.product_categories (organization_id, name) values (p_org, trim(r ->> 'category')) returning id into v_cat;
      end if;
    end if;
    begin
      insert into public.products (organization_id, code, name, sku, category_id, description, uom_id, selling_price, target_cost, standard_minutes_per_unit, status)
      values (p_org, upper(trim(r ->> 'code')), trim(r ->> 'name'), nullif(trim(r ->> 'sku'), ''), v_cat, nullif(r ->> 'description', ''), v_uom,
              nullif(r ->> 'selling_price', '')::numeric, nullif(r ->> 'target_cost', '')::numeric, nullif(r ->> 'standard_minutes_per_unit', '')::numeric, 'active');
    exception when others then
      perform app.raise_rule(format('Row %s: %s', i, sqlerrm));
    end;
    v_created := v_created + 1;
  end loop;
  perform app.audit(p_org, 'import', 'products', null, format('Imported %s products', v_created), null, null, 'import');
  return jsonb_build_object('created', v_created);
end $$;
