# API reference

ForgeOS has no separate public REST API yet. The application uses three interfaces, all authenticated with the user's Supabase session.

## 1. Database functions (Supabase RPC)

Called through `supabase.rpc(name, args)` with the user's JWT. Each checks permissions itself (`42501` if missing) and raises business-rule errors with `P0001` / not-found with `P0002`. All are atomic.

| Function | Permission | Purpose |
|---|---|---|
| `create_organization(p jsonb)` | signed in | Creates org, settings, roles, owner membership, units, default stages & routing |
| `create_factory(p_org, p jsonb)` | `work_centres.manage` | Factory + default store + N work centres |
| `apply_stage_template(p_org, template)` | `routing.manage` | Replace stages (before first order) |
| `complete_onboarding(p_org)` | `settings.manage` | Marks setup complete |
| `my_organizations()`, `my_permissions(p_org)` | member | Session context |
| `set_active_organization(p_org)` | member | Org switcher |
| `create_invitation(p_org, email, role)` → `(id, token)` | `team.manage` | Token is returned once; only its SHA-256 is stored |
| `get_invitation(token)`, `accept_invitation(token)`, `revoke_invitation(id)` | public / invitee / `team.manage` | Invitation flow (email must match) |
| `set_member_roles(member, roles[])`, `update_member(...)` | `team.manage` | Owner protections, audited |
| `set_role_permissions(role, keys[])` | `roles.manage` | Anti-escalation, audited |
| `inventory_receive(p_org, item, wh, qty, cost, type, ref, notes, idem)` | `inventory.create` | Goods receipt or opening balance |
| `inventory_transfer(p_org, item, from, to, qty, notes, idem)` | `inventory.create` | Two-leg transfer of available stock |
| `inventory_adjust(p_org, wh, reason, lines jsonb, notes, allow_negative, idem)` | `inventory.adjust` (+`inventory.approve` to go negative) | Multi-line adjustment |
| `inventory_reverse(txn, reason)` | `inventory.approve` | Compensating entry |
| `bom_create_version(product, variant?, copy_from?)` | `bom.create` | New draft (optionally copied) |
| `bom_transition(bom, submit\|approve\|reject\|archive, note?)` | `bom.update` / `bom.approve` | BOM workflow |
| `bom_cost_estimate(bom)` | `bom.read` | Lines with gross qty; costs only with `costing.read` |
| `production_order_create(p_org, p jsonb)` | `production_orders.create` | Snapshots BOM & routing |
| `production_order_transition(order, to, note?)` | per transition | State machine |
| `production_order_reserve(order)` | manage/approve/update | Reserve available material, report shortages |
| `production_issue_materials(order, lines?, operation?, idem)` | `production_orders.manage` | Issue (reservations first) |
| `production_return_materials(order, lines, idem)` | `production_orders.manage` | Return at issued cost |
| `production_record_wastage(order, line, qty, reason, operation?)` | `production_orders.update` | Classify issued material |
| `production_operation_action(op, start\|pause\|progress\|complete\|skip, good?, rejected?, msg?)` | `production_orders.update` (+approve to skip) | Step execution |
| `production_record_downtime(order, op, minutes, reason)`, `production_add_note(order, op, msg)` | `production_orders.update` | Floor records |
| `job_card_issue(op, assignee?, team?, target, instructions?)` | `job_cards.create` | Job card + notification |
| `job_card_action(card, action, good?, rejected?, msg?, client_ref?)` | assignee with `job_cards.work`, or `job_cards.update` | Worker updates; idempotent per `client_ref` |
| `get_job_card(card)`, `my_job_cards(p_org)` | assignee / readers | Worker views (no costs) |
| `production_order_complete(order, good, rejected, note?, allow_exception?, idem)` | `production_orders.manage` (+approve for exception) | Final output → finished goods at full cost; accepted ≤ units that passed final inspection |
| `import_materials(p_org, rows jsonb, warehouse?)`, `import_products(p_org, rows jsonb)` | `materials.create` (+`inventory.create`) / `products.create` | All-or-nothing CSV import |
| `dashboard_summary(p_org, factory?, from?, to?)`, `operational_alerts(p_org, factory?)` | `dashboard.read` | Mission Control |
| `run_scheduled_checks()` | service role only | Overdue notifications |
| `requisition_create(p_org, p jsonb)` | `requisitions.create` | Requisition with lines (source manual / reorder / production_shortage) |
| `requisition_decide(req, approve\|reject\|cancel, note?)` | `procurement.approve` (requester may cancel) | Reject needs a reason |
| `procurement_suggestions(p_org)` | `procurement.read` / `requisitions.create` / `inventory.read` | Shortages and reorder needs, net of open POs |
| `purchase_order_save(p_org, po?, p jsonb)` | `procurement.create` | Create/edit draft (edits return a pending PO to draft); recalculates totals |
| `purchase_order_transition(po, submit\|approve\|reject\|send\|close\|cancel, note?)` | create / approve / manage | Submit auto-approves at or under `po_approval_threshold` |
| `goods_receipt_post(po, p jsonb, idem?)` | `procurement.create` + `inventory.create` | Partial deliveries; rejected qty needs a reason; accepted qty posted to stock at net price |
| `overdue_purchase_orders(p_org)` | `procurement.read` | Late deliveries |
| `quality_check_record(p_org, p jsonb)` | `quality.create` (+`quality.approve` for conditional) | Inspection with checklist results, defects and corrective actions |
| `corrective_action_update(action, status, resolution?)` | assignee or `quality.approve` | Done needs a resolution |
| `defect_summary(p_org, from, to)` | `quality.read` | Defects by category and severity |
| `cost_entry_add(order, p jsonb)`, `cost_entry_remove(entry, kind)` | `costing.manage` | Labour / machine / overhead entries on open orders |
| `production_cost_summary(order)` | `costing.read` | Estimate vs actual by cost type, entries, margin inputs |
| `product_cost_estimate(product, save)` | `costing.read` (+`costing.manage` to save) | Unit cost from BOM, routing and rates |

Views (RLS via `security_invoker`): `stock_item_details`, `stock_levels`, `production_material_reconciliation`, `goods_receipt_summary`, `production_inspection_totals`.

## 2. Server actions (`src/app/actions/*`)

Thin wrappers used by the UI: they validate input with Zod, call the functions above with the user's session and return `{ ok, data?, message? } | { ok: false, error, fieldErrors? }`. Files: `session`, `onboarding`, `team`, `catalog`, `inventory`, `production`, `imports`, `settings`, `notifications`, `procurement`, `quality`, `costing`.

## 3. HTTP routes

| Route | Auth | Description |
|---|---|---|
| `GET /api/export/report?report=&from=&to=&factory=` | session + `reports.export` + report permission | CSV of any operational report |
| `GET /api/export/materials` | `materials.export` | Materials with stock |
| `GET /api/export/movements?type=&warehouse=` | `inventory.export` | Stock ledger |
| `GET /api/export/production-orders` | `production_orders.export` | Orders |
| `GET /api/cron/checks` | `Authorization: Bearer $CRON_SECRET` | Scheduled checks (Vercel Cron) |
| `GET /auth/confirm`, `GET /auth/callback` | — | Email verification / recovery, OAuth callback |

Costs are omitted from exports for users without `costing.read`.
