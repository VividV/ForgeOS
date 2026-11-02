/** Permission-aware navigation. An item is shown when the user has ANY of its permissions. */
export type NavItem = { href: string; label: string; icon: string; anyOf: string[] };
export type NavGroup = { label: string; items: NavItem[] };

export const NAV: NavGroup[] = [
  {
    label: "Mission Control",
    items: [
      { href: "/overview", label: "Overview", icon: "gauge", anyOf: ["dashboard.read"] },
      { href: "/daily", label: "Daily Production", icon: "calendar-check", anyOf: ["production_orders.read"] },
      { href: "/alerts", label: "Alerts", icon: "triangle-alert", anyOf: ["dashboard.read"] },
      { href: "/activity", label: "Activity Feed", icon: "activity", anyOf: ["production_orders.read", "audit_logs.read"] },
    ],
  },
  {
    label: "My Work",
    items: [{ href: "/floor", label: "My Job Cards", icon: "hard-hat", anyOf: ["job_cards.work"] }],
  },
  {
    label: "Operations",
    items: [
      { href: "/operations/production-orders", label: "Production Orders", icon: "factory", anyOf: ["production_orders.read"] },
      { href: "/operations/planning", label: "Production Planning", icon: "kanban", anyOf: ["production_orders.read"] },
      { href: "/operations/job-cards", label: "Job Cards", icon: "clipboard-list", anyOf: ["job_cards.read", "job_cards.create"] },
      { href: "/operations/quality", label: "Quality Control", icon: "shield-check", anyOf: ["quality.read"] },
      { href: "/operations/work-centres", label: "Factories & Work Centres", icon: "cog", anyOf: ["work_centres.read"] },
      { href: "/operations/stages", label: "Production Stages", icon: "route", anyOf: ["routing.read"] },
    ],
  },
  {
    label: "Inventory",
    items: [
      { href: "/inventory", label: "Inventory Overview", icon: "boxes", anyOf: ["inventory.read"] },
      { href: "/inventory/materials", label: "Raw Materials", icon: "layers", anyOf: ["materials.read"] },
      { href: "/inventory/finished-goods", label: "Finished Goods", icon: "package-check", anyOf: ["inventory.read"] },
      { href: "/inventory/movements", label: "Stock Movements", icon: "arrow-left-right", anyOf: ["inventory.read"] },
      { href: "/inventory/reservations", label: "Material Reservations", icon: "lock", anyOf: ["inventory.read"] },
      { href: "/inventory/adjustments", label: "Stock Adjustments", icon: "sliders-horizontal", anyOf: ["inventory.read"] },
      { href: "/inventory/counts", label: "Stock Counts", icon: "clipboard-check", anyOf: ["inventory.read"] },
      { href: "/inventory/warehouses", label: "Warehouses", icon: "warehouse", anyOf: ["warehouses.read"] },
      { href: "/inventory/reorder", label: "Reorder Alerts", icon: "bell-ring", anyOf: ["inventory.read"] },
    ],
  },
  {
    label: "Commerce",
    items: [
      { href: "/commerce/customer-orders", label: "Customer Orders", icon: "receipt", anyOf: ["sales_orders.read"] },
      { href: "/commerce/dispatches", label: "Dispatches", icon: "send", anyOf: ["sales_orders.read"] },
      { href: "/commerce/invoices", label: "Invoices", icon: "file-text", anyOf: ["sales_orders.read"] },
      { href: "/commerce/customers", label: "Customers", icon: "contact", anyOf: ["customers.read", "sales_orders.read"] },
      { href: "/commerce/products", label: "Products", icon: "shirt", anyOf: ["products.read"] },
      { href: "/commerce/boms", label: "Bills of Materials", icon: "list-tree", anyOf: ["bom.read"] },
      { href: "/commerce/suppliers", label: "Suppliers", icon: "truck", anyOf: ["suppliers.read"] },
      { href: "/commerce/requisitions", label: "Purchase Requisitions", icon: "file-plus", anyOf: ["procurement.read", "requisitions.create"] },
      { href: "/commerce/purchase-orders", label: "Purchase Orders", icon: "shopping-cart", anyOf: ["procurement.read"] },
      { href: "/commerce/goods-received", label: "Goods Received", icon: "package-open", anyOf: ["procurement.read"] },
      { href: "/commerce/costing", label: "Product Costing", icon: "calculator", anyOf: ["costing.read"] },
    ],
  },
  {
    label: "Workforce",
    items: [
      { href: "/workforce/employees", label: "Employees", icon: "id-card", anyOf: ["workforce.read", "attendance.record"] },
      { href: "/workforce/attendance", label: "Attendance", icon: "clock", anyOf: ["workforce.read", "attendance.record"] },
      { href: "/workforce/setup", label: "Departments & Shifts", icon: "network", anyOf: ["workforce.read"] },
    ],
  },
  {
    label: "Intelligence",
    items: [{ href: "/intelligence/reports", label: "Operational Reports", icon: "file-bar-chart", anyOf: ["reports.read"] }],
  },
  {
    label: "Administration",
    items: [
      { href: "/admin/team", label: "Team Members", icon: "users", anyOf: ["team.read"] },
      { href: "/admin/roles", label: "Roles & Permissions", icon: "shield", anyOf: ["roles.read"] },
      { href: "/admin/settings", label: "Organisation Settings", icon: "settings", anyOf: ["settings.read"] },
      { href: "/admin/audit", label: "Audit Logs", icon: "scroll-text", anyOf: ["audit_logs.read"] },
    ],
  },
];

export function visibleNav(perms: Set<string>): NavGroup[] {
  return NAV.map((g) => ({ ...g, items: g.items.filter((i) => i.anyOf.some((p) => perms.has(p))) })).filter((g) => g.items.length > 0);
}

/** Where a user lands after sign-in, based on what they can see. */
export function homeFor(perms: Set<string>): string {
  if (perms.has("dashboard.read")) return "/overview";
  if (perms.has("job_cards.work")) return "/floor";
  return visibleNav(perms)[0]?.items[0]?.href ?? "/forbidden";
}
