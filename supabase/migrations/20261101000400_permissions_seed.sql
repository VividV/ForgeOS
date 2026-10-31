-- Permission catalogue and default role templates.

insert into public.permissions (key, module, action, description) values
  ('dashboard.read', 'dashboard', 'read', 'View Mission Control and alerts'),
  ('production_orders.create', 'production_orders', 'create', 'Create production orders'),
  ('production_orders.read', 'production_orders', 'read', 'View production orders, board and timeline'),
  ('production_orders.update', 'production_orders', 'update', 'Edit orders and run day-to-day production actions'),
  ('production_orders.delete', 'production_orders', 'delete', 'Cancel production orders'),
  ('production_orders.approve', 'production_orders', 'approve', 'Approve orders and start production with shortages'),
  ('production_orders.export', 'production_orders', 'export', 'Export production data'),
  ('production_orders.manage', 'production_orders', 'manage', 'Issue and return materials, complete orders'),
  ('job_cards.create', 'job_cards', 'create', 'Issue job cards and assign work'),
  ('job_cards.read', 'job_cards', 'read', 'View all job cards'),
  ('job_cards.update', 'job_cards', 'update', 'Update any job card'),
  ('job_cards.work', 'job_cards', 'work', 'View and update job cards assigned to me'),
  ('work_centres.read', 'work_centres', 'read', 'View factories and work centres'),
  ('work_centres.manage', 'work_centres', 'manage', 'Manage factories and work centres'),
  ('routing.read', 'routing', 'read', 'View production stages and routings'),
  ('routing.manage', 'routing', 'manage', 'Configure production stages and routings'),
  ('products.create', 'products', 'create', 'Create products and variants'),
  ('products.read', 'products', 'read', 'View products'),
  ('products.update', 'products', 'update', 'Edit products and variants'),
  ('products.delete', 'products', 'delete', 'Archive products'),
  ('products.export', 'products', 'export', 'Export products'),
  ('bom.create', 'bom', 'create', 'Create BOMs and new versions'),
  ('bom.read', 'bom', 'read', 'View BOMs'),
  ('bom.update', 'bom', 'update', 'Edit draft BOMs and submit for approval'),
  ('bom.approve', 'bom', 'approve', 'Approve BOMs'),
  ('materials.create', 'materials', 'create', 'Create materials'),
  ('materials.read', 'materials', 'read', 'View materials'),
  ('materials.update', 'materials', 'update', 'Edit materials'),
  ('materials.delete', 'materials', 'delete', 'Archive materials'),
  ('materials.export', 'materials', 'export', 'Export materials'),
  ('inventory.read', 'inventory', 'read', 'View stock levels and movements'),
  ('inventory.create', 'inventory', 'create', 'Receive stock, record opening balances, transfer stock'),
  ('inventory.adjust', 'inventory', 'adjust', 'Post stock adjustments, damage and wastage'),
  ('inventory.approve', 'inventory', 'approve', 'Reverse transactions and override negative stock'),
  ('inventory.export', 'inventory', 'export', 'Export inventory data'),
  ('warehouses.read', 'warehouses', 'read', 'View warehouses'),
  ('warehouses.manage', 'warehouses', 'manage', 'Manage warehouses and locations'),
  ('suppliers.read', 'suppliers', 'read', 'View suppliers'),
  ('suppliers.manage', 'suppliers', 'manage', 'Manage suppliers'),
  ('costing.read', 'costing', 'read', 'See costs, stock values and margins'),
  ('reports.read', 'reports', 'read', 'View reports'),
  ('reports.export', 'reports', 'export', 'Export reports to CSV'),
  ('team.read', 'team', 'read', 'View team members'),
  ('team.manage', 'team', 'manage', 'Invite, suspend and assign roles to members'),
  ('roles.read', 'roles', 'read', 'View roles and permissions'),
  ('roles.manage', 'roles', 'manage', 'Create and edit roles'),
  ('settings.read', 'settings', 'read', 'View organisation and factory settings'),
  ('settings.manage', 'settings', 'manage', 'Change organisation and factory settings'),
  ('audit_logs.read', 'audit_logs', 'read', 'View the audit log'),
  ('billing.manage', 'billing', 'manage', 'Manage subscription and billing');

insert into app.role_templates (role_key, name, description, sort, is_owner) values
  ('owner', 'Owner', 'Full access, subscription management and organisation ownership.', 1, true),
  ('administrator', 'Administrator', 'Manage operations, employees, settings and reports.', 2, false),
  ('production_manager', 'Production Manager', 'Manage production plans, work orders, assignments and production reports.', 3, false),
  ('inventory_manager', 'Inventory Manager', 'Manage materials, stock movements, warehouses and purchasing.', 4, false),
  ('procurement_officer', 'Procurement Officer', 'Manage suppliers, requisitions and purchase orders.', 5, false),
  ('quality_controller', 'Quality Controller', 'Manage inspections, defects and quality approvals.', 6, false),
  ('supervisor', 'Supervisor', 'Manage assigned production activities and workers.', 7, false),
  ('production_worker', 'Production Worker', 'View assigned tasks and submit production updates.', 8, false),
  ('finance_analyst', 'Finance / Analyst', 'Access costing, operational financial information and reports.', 9, false);

-- Administrator: everything except billing.
insert into app.role_template_permissions (role_key, permission_key)
select 'administrator', key from public.permissions where key <> 'billing.manage';

insert into app.role_template_permissions (role_key, permission_key)
select r.role_key, p.key from (values
  ('production_manager', array[
    'dashboard.read', 'production_orders.create', 'production_orders.read', 'production_orders.update',
    'production_orders.delete', 'production_orders.approve', 'production_orders.export', 'production_orders.manage',
    'job_cards.create', 'job_cards.read', 'job_cards.update', 'job_cards.work', 'work_centres.read', 'routing.read',
    'routing.manage', 'products.read', 'bom.read', 'bom.create', 'bom.update', 'materials.read', 'inventory.read',
    'warehouses.read', 'costing.read', 'reports.read', 'reports.export', 'team.read', 'settings.read']),
  ('inventory_manager', array[
    'dashboard.read', 'materials.create', 'materials.read', 'materials.update', 'materials.delete', 'materials.export',
    'inventory.read', 'inventory.create', 'inventory.adjust', 'inventory.approve', 'inventory.export',
    'warehouses.read', 'warehouses.manage', 'suppliers.read', 'suppliers.manage', 'products.read', 'bom.read',
    'production_orders.read', 'production_orders.manage', 'work_centres.read', 'costing.read', 'reports.read',
    'reports.export', 'team.read', 'settings.read']),
  ('procurement_officer', array[
    'dashboard.read', 'suppliers.read', 'suppliers.manage', 'materials.read', 'inventory.read', 'inventory.create',
    'warehouses.read', 'costing.read', 'reports.read', 'team.read']),
  ('quality_controller', array[
    'dashboard.read', 'production_orders.read', 'production_orders.update', 'job_cards.read', 'job_cards.work',
    'products.read', 'bom.read', 'routing.read', 'work_centres.read', 'reports.read', 'team.read']),
  ('supervisor', array[
    'dashboard.read', 'production_orders.read', 'production_orders.update', 'job_cards.create', 'job_cards.read',
    'job_cards.update', 'job_cards.work', 'work_centres.read', 'routing.read', 'products.read', 'bom.read',
    'materials.read', 'inventory.read', 'warehouses.read', 'team.read', 'reports.read']),
  ('production_worker', array['job_cards.work']),
  ('finance_analyst', array[
    'dashboard.read', 'reports.read', 'reports.export', 'costing.read', 'inventory.read', 'inventory.export',
    'materials.read', 'materials.export', 'products.read', 'products.export', 'bom.read', 'production_orders.read',
    'production_orders.export', 'warehouses.read', 'suppliers.read', 'work_centres.read', 'audit_logs.read', 'team.read'])
) as r(role_key, perms)
cross join lateral unnest(r.perms) as p(key);
