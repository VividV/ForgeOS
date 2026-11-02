-- Demo workspace: a separate, clearly-labelled organisation filled with realistic sample data,
-- created only when a user asks for it. Real organisations never receive sample data.

create or replace function app.demo_run_steps(p_order uuid, p_good numeric, p_rej numeric, p_steps int) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare op record; n int := 0;
begin
  for op in select id from public.production_operations where production_order_id = p_order order by sequence loop
    exit when n >= p_steps;
    perform public.production_operation_action(op.id, 'progress', p_good, case when n = 0 then p_rej else 0 end, null);
    perform public.production_operation_action(op.id, 'complete', null, null, null);
    n := n + 1;
  end loop;
end $$;

create or replace function public.create_demo_organization() returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_org uuid; v_fac uuid; v_wh uuid; v_uid uuid := auth.uid();
  m_ank uuid; m_lin uuid; m_thr uuid; m_btn uuid; m_zip uuid; m_lbl uuid; m_bag uuid;
  s_kano uuid; s_trim uuid; p_shirt uuid; p_dress uuid; b uuid; c_eko uuid; c_abj uuid;
  o1 uuid; o2 uuid; o3 uuid; so1 uuid; so2 uuid; li uuid; po uuid; d_cut uuid; d_sew uuid; sh uuid; e uuid;
  si record;
begin
  if v_uid is null then raise exception 'authentication required' using errcode = '42501'; end if;
  if exists (select 1 from public.organizations o join public.organization_members m on m.organization_id = o.id
             where o.is_demo and m.user_id = v_uid and m.status = 'active') then
    perform app.raise_rule('You already have a demo workspace. Switch to it from the organisation menu.');
  end if;
  v_org := public.create_organization(jsonb_build_object('name', 'ForgeOS Manufacturing Demo', 'country', 'NG', 'industry', 'Garments & textiles',
    'business_type', 'Manufacturer', 'is_demo', true, 'address', '12 Demo Industrial Estate, Ikeja, Lagos', 'phone', '+234 800 000 0000'));
  perform public.apply_stage_template(v_org, 'garment');
  v_fac := public.create_factory(v_org, jsonb_build_object('name', 'Lagos Factory', 'code', 'LAG', 'work_centre_count', 3));
  select default_warehouse_id into v_wh from public.factories where id = v_fac;
  update public.work_centres set hourly_cost = 1500 where factory_id = v_fac;
  update public.organizations set main_products = 'Shirts and dresses', tax_id = '00000000-0001',
    invoice_bank_details = 'Demo Bank · ForgeOS Manufacturing Demo · 0000000000' where id = v_org;

  -- suppliers & materials
  insert into public.suppliers (organization_id, code, name, contact_name, phone, lead_time_days, payment_terms)
  values (v_org, 'KANO', 'Kano Textiles', 'Musa Bello', '+234 800 000 0001', 7, '50% upfront') returning id into s_kano;
  insert into public.suppliers (organization_id, code, name, contact_name, lead_time_days) values (v_org, 'TRIMS', 'Trims Hub Lagos', 'Ada Obi', 3) returning id into s_trim;
  insert into public.materials (organization_id, code, name, stock_uom_id, standard_cost, reorder_level, preferred_supplier_id)
  select v_org, x.code, x.name, (select id from public.units_of_measure where organization_id = v_org and code = x.uom), x.cost, x.reorder, case when x.fab then s_kano else s_trim end
  from (values ('FAB-ANK', 'Ankara wax print fabric', 'm', 2500, 100, true), ('FAB-LIN', 'Linen fabric (natural)', 'm', 4200, 80, true),
               ('THR-POL', 'Polyester thread', 'm', 3, 5000, false), ('BTN-WOOD', 'Wooden buttons', 'pcs', 25, 300, false),
               ('ZIP-20', 'Invisible zip 20 cm', 'pcs', 120, 60, false), ('LBL-WOV', 'Woven brand label', 'pcs', 15, 200, false),
               ('PKG-BAG', 'Garment poly bag', 'pcs', 40, 150, false)) as x(code, name, uom, cost, reorder, fab);
  select id into m_ank from public.stock_items where material_id = (select id from public.materials where organization_id = v_org and code = 'FAB-ANK');
  select id into m_lin from public.stock_items where material_id = (select id from public.materials where organization_id = v_org and code = 'FAB-LIN');
  select id into m_thr from public.stock_items where material_id = (select id from public.materials where organization_id = v_org and code = 'THR-POL');
  select id into m_btn from public.stock_items where material_id = (select id from public.materials where organization_id = v_org and code = 'BTN-WOOD');
  select id into m_zip from public.stock_items where material_id = (select id from public.materials where organization_id = v_org and code = 'ZIP-20');
  select id into m_lbl from public.stock_items where material_id = (select id from public.materials where organization_id = v_org and code = 'LBL-WOV');
  select id into m_bag from public.stock_items where material_id = (select id from public.materials where organization_id = v_org and code = 'PKG-BAG');
  perform public.inventory_receive(v_org, m_ank, v_wh, 400, 2500, 'opening_balance', 'Demo opening stock');
  perform public.inventory_receive(v_org, m_lin, v_wh, 150, 4200, 'opening_balance', 'Demo opening stock');
  perform public.inventory_receive(v_org, m_thr, v_wh, 20000, 3, 'opening_balance', 'Demo opening stock');
  perform public.inventory_receive(v_org, m_btn, v_wh, 2000, 25, 'opening_balance', 'Demo opening stock');
  perform public.inventory_receive(v_org, m_zip, v_wh, 110, 120, 'opening_balance', 'Demo opening stock');
  perform public.inventory_receive(v_org, m_lbl, v_wh, 1000, 15, 'opening_balance', 'Demo opening stock');
  perform public.inventory_receive(v_org, m_bag, v_wh, 500, 40, 'opening_balance', 'Demo opening stock');

  -- products & BOMs
  insert into public.products (organization_id, code, name, uom_id, selling_price, standard_minutes_per_unit, description)
  values (v_org, 'SHIRT-ANK', 'Ankara short-sleeve shirt', (select id from public.units_of_measure where organization_id = v_org and code = 'pcs'), 18000, 45, 'Men''s shirt in wax print, wooden buttons')
  returning id into p_shirt;
  insert into public.products (organization_id, code, name, uom_id, selling_price, standard_minutes_per_unit, description)
  values (v_org, 'DRESS-LIN', 'Linen midi dress', (select id from public.units_of_measure where organization_id = v_org and code = 'pcs'), 35000, 90, 'Relaxed-fit linen dress with invisible zip')
  returning id into p_dress;
  b := public.bom_create_version(p_shirt);
  insert into public.bom_items (organization_id, bom_id, line_no, stock_item_id, quantity, wastage_pct) values
    (v_org, b, 1, m_ank, 1.8, 5), (v_org, b, 2, m_thr, 30, 10), (v_org, b, 3, m_btn, 8, 0), (v_org, b, 4, m_lbl, 1, 0), (v_org, b, 5, m_bag, 1, 0);
  perform public.bom_transition(b, 'approve');
  b := public.bom_create_version(p_dress);
  insert into public.bom_items (organization_id, bom_id, line_no, stock_item_id, quantity, wastage_pct) values
    (v_org, b, 1, m_lin, 3, 5), (v_org, b, 2, m_thr, 50, 10), (v_org, b, 3, m_zip, 1, 0), (v_org, b, 4, m_lbl, 1, 0), (v_org, b, 5, m_bag, 1, 0);
  perform public.bom_transition(b, 'approve');

  insert into public.cost_rates (organization_id, kind, name, basis, rate) values
    (v_org, 'labour', 'Tailor rate', 'per_hour', 600), (v_org, 'overhead', 'Factory overhead', 'percent_material', 10);
  insert into public.quality_templates (organization_id, name, applies_to, description) values (v_org, 'Final garment check', 'production', 'Before packing') returning id into b;
  insert into public.quality_template_items (organization_id, template_id, sequence, name, check_type, target) values
    (v_org, b, 1, 'Seams straight, no loose threads', 'pass_fail', null), (v_org, b, 2, 'Chest / bust width', 'measurement', 'Spec ±1 cm'),
    (v_org, b, 3, 'Label and care tag attached', 'pass_fail', null), (v_org, b, 4, 'Pressed and folded', 'pass_fail', null);

  -- people
  insert into public.departments (organization_id, name, factory_id) values (v_org, 'Cutting', v_fac) returning id into d_cut;
  insert into public.departments (organization_id, name, factory_id) values (v_org, 'Sewing', v_fac) returning id into d_sew;
  insert into public.shifts (organization_id, name, factory_id, start_time, end_time, break_minutes) values (v_org, 'Day', v_fac, '08:00', '17:00', 60) returning id into sh;
  insert into public.employees (organization_id, code, full_name, department_id, factory_id, default_shift_id, job_title, skills)
  values (v_org, 'EMP-001', 'Bisi Adewale', d_sew, v_fac, sh, 'Machinist', '{sewing,finishing}'),
         (v_org, 'EMP-002', 'Kunle Ojo', d_cut, v_fac, sh, 'Pattern cutter', '{cutting,pattern making}'),
         (v_org, 'EMP-003', 'Amaka Eze', d_sew, v_fac, sh, 'Machinist', '{sewing}'),
         (v_org, 'EMP-004', 'Tayo Bakare', d_sew, v_fac, sh, 'Finisher', '{finishing,pressing,quality}');
  insert into public.employee_pay (employee_id, organization_id, hourly_rate) select id, v_org, 650 from public.employees where organization_id = v_org;
  perform public.attendance_record(v_org, jsonb_build_object('work_date', (now() at time zone 'Africa/Lagos')::date - 1, 'entries',
    (select jsonb_agg(jsonb_build_object('employee_id', id, 'status', case code when 'EMP-003' then 'late' else 'present' end,
       'clock_in', case code when 'EMP-003' then '09:10' else '08:00' end, 'clock_out', case code when 'EMP-001' then '19:00' else '17:00' end))
     from public.employees where organization_id = v_org)));

  -- production: one finished, one in progress, one waiting for approval
  o1 := public.production_order_create(v_org, jsonb_build_object('product_id', p_shirt, 'factory_id', v_fac, 'quantity', 60, 'priority', 'high', 'submit', true,
    'due_date', ((now() at time zone 'Africa/Lagos')::date + 2)::text, 'manager_id', v_uid));
  perform public.production_order_transition(o1, 'approved');
  perform public.production_issue_materials(o1);
  perform public.production_order_transition(o1, 'in_progress');
  perform public.cost_entry_add(o1, jsonb_build_object('entry_type', 'labour', 'hours', 40, 'employee_id', (select id from public.employees where organization_id = v_org and code = 'EMP-001')));
  perform app.demo_run_steps(o1, 58, 2, 100);
  perform public.quality_check_record(v_org, jsonb_build_object('check_type', 'production', 'production_order_id', o1, 'is_final', true, 'quantity_inspected', 58,
    'quantity_rejected', 1, 'result', 'pass', 'defects', jsonb_build_array(jsonb_build_object('category', 'Stitching', 'severity', 'minor', 'quantity', 1))));
  perform public.production_order_complete(o1, 57, 3, 'Demo order');

  o2 := public.production_order_create(v_org, jsonb_build_object('product_id', p_dress, 'factory_id', v_fac, 'quantity', 40, 'submit', true,
    'due_date', ((now() at time zone 'Africa/Lagos')::date + 5)::text, 'manager_id', v_uid));
  perform public.production_order_transition(o2, 'approved');
  perform public.production_issue_materials(o2);
  perform public.production_order_transition(o2, 'in_progress');
  perform app.demo_run_steps(o2, 40, 0, 4);

  o3 := public.production_order_create(v_org, jsonb_build_object('product_id', p_shirt, 'factory_id', v_fac, 'quantity', 120, 'submit', true,
    'due_date', ((now() at time zone 'Africa/Lagos')::date + 14)::text, 'notes', 'Stock build for the festive season'));

  -- customers & orders
  insert into public.customers (organization_id, code, name, contact_name, phone, billing_address, payment_terms, customer_type)
  values (v_org, 'EKO', 'Eko Boutique', 'Funke Eko', '+234 800 000 0002', '5 Admiralty Way, Lekki, Lagos', '50% deposit, balance on delivery', 'retailer') returning id into c_eko;
  insert into public.customers (organization_id, code, name, contact_name, billing_address, payment_terms, customer_type)
  values (v_org, 'AFH', 'Abuja Fashion House', 'Zainab Musa', '14 Aminu Kano Crescent, Wuse 2, Abuja', '30 days', 'distributor') returning id into c_abj;
  select id into si from public.stock_items where product_variant_id = (select id from public.product_variants where product_id = p_shirt limit 1);
  so1 := public.sales_order_save(v_org, null, jsonb_build_object('customer_id', c_eko, 'warehouse_id', v_wh, 'shipping_charge', 5000,
    'requested_date', ((now() at time zone 'Africa/Lagos')::date + 3)::text, 'lines', jsonb_build_array(jsonb_build_object('stock_item_id', si.id, 'quantity', 40, 'unit_price', 18000, 'tax_pct', 7.5))));
  perform public.sales_order_transition(so1, 'confirm');
  select id into li from public.sales_order_items where sales_order_id = so1;
  perform public.dispatch_post(so1, jsonb_build_object('carrier', 'GIG Logistics', 'lines', jsonb_build_array(jsonb_build_object('so_item_id', li, 'quantity', 30))));
  perform public.payment_record(so1, jsonb_build_object('amount', 390000, 'method', 'bank_transfer', 'reference', 'DEMO-TRF-001'));
  select id into si from public.stock_items where product_variant_id = (select id from public.product_variants where product_id = p_dress limit 1);
  so2 := public.sales_order_save(v_org, null, jsonb_build_object('customer_id', c_abj, 'warehouse_id', v_wh,
    'requested_date', ((now() at time zone 'Africa/Lagos')::date + 10)::text, 'lines', jsonb_build_array(jsonb_build_object('stock_item_id', si.id, 'quantity', 30, 'unit_price', 33000, 'tax_pct', 7.5))));
  perform public.sales_order_transition(so2, 'confirm');

  -- a purchase order for linen on its way
  po := public.purchase_order_save(v_org, null, jsonb_build_object('supplier_id', s_kano, 'warehouse_id', v_wh,
    'expected_date', ((now() at time zone 'Africa/Lagos')::date + 3)::text, 'lines', jsonb_build_array(jsonb_build_object('stock_item_id', m_lin, 'quantity', 200, 'unit_price', 4100))));
  perform public.purchase_order_transition(po, 'submit');
  perform public.purchase_order_transition(po, 'approve');
  perform public.purchase_order_transition(po, 'send');

  perform public.complete_onboarding(v_org);
  perform public.set_active_organization(v_org);
  perform app.audit(v_org, 'demo_created', 'organizations', v_org, 'Demo workspace created with sample data');
  return v_org;
end $$;
grant execute on function public.create_demo_organization() to authenticated;
revoke all on function app.demo_run_steps(uuid, numeric, numeric, int) from public, anon, authenticated;

-- Leaving a demo workspace removes your access; the sample data is never mixed with a real organisation.
create or replace function public.leave_demo_organization(p_org uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_next uuid;
begin
  if not exists (select 1 from public.organizations where id = p_org and is_demo) then perform app.raise_rule('Only demo workspaces can be left this way'); end if;
  if not app.is_member(p_org) then raise exception 'Not found' using errcode = 'P0002'; end if;
  delete from public.member_roles where member_id in (select id from public.organization_members where organization_id = p_org and user_id = auth.uid());
  update public.organization_members set status = 'removed' where organization_id = p_org and user_id = auth.uid();
  update public.organizations set status = 'suspended' where id = p_org
    and not exists (select 1 from public.organization_members where organization_id = p_org and status = 'active');
  select m.organization_id into v_next from public.organization_members m where m.user_id = auth.uid() and m.status = 'active' order by m.created_at limit 1;
  update public.profiles set last_organization_id = v_next where id = auth.uid();
end $$;
grant execute on function public.leave_demo_organization(uuid) to authenticated;
