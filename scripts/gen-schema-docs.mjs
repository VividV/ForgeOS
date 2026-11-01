// Generates docs/DATA_DICTIONARY.md and docs/ERD.md from the live database schema.
// Usage: TEST_DATABASE_URL=postgres://... node scripts/gen-schema-docs.mjs
import { writeFileSync } from "node:fs";
import pg from "pg";

const client = new pg.Client({ connectionString: process.env.TEST_DATABASE_URL ?? "postgres://postgres@127.0.0.1:54322/postgres" });
await client.connect();

const { rows: cols } = await client.query(`
  select c.table_name, c.column_name, c.data_type, c.is_nullable, c.column_default
  from information_schema.columns c
  join information_schema.tables t on t.table_name = c.table_name and t.table_schema = c.table_schema
  where c.table_schema = 'public' and t.table_type = 'BASE TABLE' and c.table_name not like '\\_%'
  order by c.table_name, c.ordinal_position`);
const { rows: fks } = await client.query(`
  select distinct tc.table_name as src, ccu.table_name as dst, kcu.column_name as col
  from information_schema.table_constraints tc
  join information_schema.key_column_usage kcu on kcu.constraint_name = tc.constraint_name and kcu.table_schema = tc.table_schema
  join information_schema.constraint_column_usage ccu on ccu.constraint_name = tc.constraint_name and ccu.table_schema = tc.table_schema
  where tc.constraint_type = 'FOREIGN KEY' and tc.table_schema = 'public' and ccu.table_schema = 'public'
    and kcu.column_name <> 'organization_id' and ccu.table_name <> tc.table_name`);
const { rows: rls } = await client.query(`select relname from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity`);
const { rows: fns } = await client.query(`
  select p.proname, pg_get_function_identity_arguments(p.oid) args from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.prokind = 'f' order by 1`);
await client.end();

const rlsSet = new Set(rls.map((r) => r.relname));
const byTable = new Map();
for (const c of cols) {
  if (!byTable.has(c.table_name)) byTable.set(c.table_name, []);
  byTable.get(c.table_name).push(c);
}

let dd = `# Data dictionary\n\nGenerated from the database by \`scripts/gen-schema-docs.mjs\`. Do not edit by hand.\n\n`;
dd += `All primary keys are UUIDs. Every organisation-owned table carries \`organization_id\` and has Row Level Security enabled (✔ below). Ledger tables (\`inventory_transactions\`, \`audit_logs\`, \`production_logs\`, \`production_outputs\`, \`stock_adjustments\`, \`production_order_status_history\`) are append-only: updates and deletes are rejected by trigger.\n\n`;
dd += `| Table | Columns | RLS |\n|---|---|---|\n`;
for (const [t, cs] of byTable) dd += `| [\`${t}\`](#${t}) | ${cs.length} | ${rlsSet.has(t) ? "✔" : "—"} |\n`;
for (const [t, cs] of byTable) {
  dd += `\n## ${t}\n\n| Column | Type | Null | Default |\n|---|---|---|---|\n`;
  for (const c of cs) dd += `| \`${c.column_name}\` | ${c.data_type} | ${c.is_nullable === "YES" ? "yes" : ""} | ${c.column_default ? `\`${String(c.column_default).slice(0, 48).replace(/\|/g, "\\|")}\`` : ""} |\n`;
}
dd += `\n## Database functions (Data API / RPC)\n\n| Function | Arguments |\n|---|---|\n`;
for (const f of fns) dd += `| \`${f.proname}\` | \`${f.args.replace(/\|/g, "\\|")}\` |\n`;
writeFileSync("docs/DATA_DICTIONARY.md", dd);

const groups = {
  "Identity & RBAC": ["profiles", "organizations", "organization_settings", "organization_members", "roles", "role_permissions", "permissions", "member_roles", "invitations"],
  "Factory": ["factories", "work_centres", "warehouses", "warehouse_locations", "production_stages", "routing_templates", "routing_steps"],
  "Catalogue & inventory": ["products", "product_variants", "product_categories", "materials", "material_categories", "suppliers", "units_of_measure", "stock_items", "inventory_balances", "inventory_transactions", "stock_adjustments", "bills_of_materials", "bom_items"],
  "Production": ["production_orders", "production_order_materials", "material_reservations", "production_operations", "job_cards", "production_logs", "production_outputs", "production_scrap", "downtime_logs", "production_order_status_history"],
};
let erd = `# Entity relationship diagram\n\nGenerated from foreign keys by \`scripts/gen-schema-docs.mjs\`. Links to \`organizations\` (present on every tenant table) are omitted for readability.\n\n`;
for (const [g, tables] of Object.entries(groups)) {
  const set = new Set(tables);
  erd += `## ${g}\n\n\`\`\`mermaid\nerDiagram\n`;
  const seen = new Set();
  for (const f of fks) {
    if (!set.has(f.src) && !set.has(f.dst)) continue;
    if (!(set.has(f.src) && set.has(f.dst))) continue;
    const k = `${f.dst}-${f.src}-${f.col}`;
    if (seen.has(k)) continue;
    seen.add(k);
    erd += `  ${f.dst} ||--o{ ${f.src} : "${f.col}"\n`;
  }
  erd += "```\n\n";
}
writeFileSync("docs/ERD.md", erd);
console.log(`Wrote data dictionary (${byTable.size} tables, ${fns.length} functions) and ERD.`);
