-- Phase 2 permissions: procurement, quality and costing management.

insert into public.permissions (key, module, action, description) values
  ('requisitions.create', 'requisitions', 'create', 'Request materials (purchase requisitions)'),
  ('procurement.read', 'procurement', 'read', 'View requisitions, purchase orders and goods received'),
  ('procurement.create', 'procurement', 'create', 'Create purchase orders and record goods received'),
  ('procurement.approve', 'procurement', 'approve', 'Approve requisitions and purchase orders'),
  ('procurement.manage', 'procurement', 'manage', 'Send, close and cancel purchase orders'),
  ('quality.read', 'quality', 'read', 'View inspections, defects and corrective actions'),
  ('quality.create', 'quality', 'create', 'Record inspections and defects'),
  ('quality.approve', 'quality', 'approve', 'Give conditional approvals and close corrective actions'),
  ('quality.manage', 'quality', 'manage', 'Manage inspection templates'),
  ('costing.manage', 'costing', 'manage', 'Record labour and overhead, manage cost rates')
on conflict (key) do nothing;

insert into app.role_template_permissions (role_key, permission_key)
select r.role_key, p.key from (values
  ('administrator', array['requisitions.create', 'procurement.read', 'procurement.create', 'procurement.approve', 'procurement.manage', 'quality.read', 'quality.create', 'quality.approve', 'quality.manage', 'costing.manage']),
  ('production_manager', array['requisitions.create', 'procurement.read', 'quality.read', 'quality.create', 'costing.manage']),
  ('inventory_manager', array['requisitions.create', 'procurement.read', 'procurement.create', 'procurement.approve', 'procurement.manage', 'quality.read', 'quality.create']),
  ('procurement_officer', array['requisitions.create', 'procurement.read', 'procurement.create', 'procurement.manage', 'quality.read']),
  ('quality_controller', array['quality.read', 'quality.create', 'quality.approve', 'quality.manage', 'procurement.read']),
  ('supervisor', array['requisitions.create', 'quality.read', 'quality.create']),
  ('finance_analyst', array['procurement.read', 'quality.read', 'costing.manage'])
) as r(role_key, perms)
cross join lateral unnest(r.perms) as p(key)
on conflict do nothing;

-- Backfill existing organisations' default roles.
insert into public.role_permissions (role_id, permission_key, organization_id)
select ro.id, tp.permission_key, ro.organization_id
from public.roles ro
join app.role_template_permissions tp on tp.role_key = ro.key
where ro.is_system and not ro.is_owner
  and tp.permission_key in ('requisitions.create', 'procurement.read', 'procurement.create', 'procurement.approve', 'procurement.manage',
                            'quality.read', 'quality.create', 'quality.approve', 'quality.manage', 'costing.manage')
on conflict do nothing;

alter table public.organization_settings
  add column if not exists require_final_inspection boolean not null default false,
  add column if not exists po_approval_threshold numeric(18, 2) not null default 0 check (po_approval_threshold >= 0);
comment on column public.organization_settings.po_approval_threshold is 'Purchase orders with a total above this need approval (0 = always).';
