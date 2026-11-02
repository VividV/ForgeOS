# Architecture

## Overview

```
Browser (Next.js client components, offline queue)
        │  server actions / route handlers (Zod-validated)
        ▼
Next.js server (Vercel) ── user's JWT ──► Supabase Data API (PostgREST)
        │                                      │
        │ service role (cron only)             ▼
        └──────────────────────────────► PostgreSQL
                                          • RLS on every tenant table
                                          • SECURITY DEFINER workflow functions
                                          • triggers: audit, immutability, guards
Supabase Auth (email + optional Google)
Resend (optional email) · Vercel Cron (scheduled checks)
```

**The database is the system of record and the last line of defence.** Every business rule that protects data integrity (stock can't go negative, reservations, state transitions, BOM immutability, ledger immutability, permission checks) lives in Postgres, so it holds no matter which client calls it. The Next.js layer validates input, checks permissions again for clear error messages, and renders.

## Multi-tenancy

- Every organisation-owned row has `organization_id`; RLS is enabled on **all** public tables (default deny).
- Membership is resolved by `app.is_member(org)` / `app.has_permission(org, key)`. These are `SECURITY DEFINER` helpers that only ever answer for `auth.uid()`.
- Composite foreign keys `(organization_id, x_id)` make cross-tenant references impossible at the schema level (an order can't point at another org's warehouse).
- `organization_id` is immutable (trigger) and client-supplied org IDs are always re-checked against membership.
- The service-role key is used only by `/api/cron/checks`.

## Authorisation (RBAC)

- `permissions` is a fixed catalogue (`module.action`). Each org gets copies of 9 default roles from `app.role_templates`, editable per org, plus custom roles.
- The owner role has implicit full access; the last owner can't be removed; only owners grant ownership; non-owners can't grant permissions they don't hold.
- Enforcement layers: (1) RLS select/write policies, (2) `app.require_permission` inside every workflow function, (3) `actionContext(...)` in server actions, (4) `requirePermission` on pages, (5) permission-aware navigation. Layers 1–2 are authoritative.
- Workers (`job_cards.work`) can see only job cards assigned to them, through `my_job_cards` / `get_job_card`, which return no costs.

## Inventory engine

- `stock_items` unifies materials and product variants, so BOMs can reference either (nested BOMs) and one ledger covers raw materials and finished goods.
- `app.post_inventory_txn` is the single writer: it locks the balance row (`SELECT … FOR UPDATE`), enforces the available/on-hand check, updates the weighted-average cost, writes one immutable `inventory_transactions` row and raises low-stock notifications when a material crosses its reorder level.
- `inventory_balances.available` is a generated column `on_hand − reserved`.
- Corrections are reversals (`inventory_reverse`) that post a compensating entry; transfers reverse both legs.
- Idempotency keys (unique per org) make retried submissions safe; the UI rotates a key per intended movement.
- **Valuation:** weighted average is implemented and applied consistently. FIFO is shown as "coming soon" and blocked server-side (needs cost layers).

## Production engine

1. `production_order_create` snapshots the approved BOM (JSON + `production_order_materials` lines with required qty incl. wastage) and the routing (`production_operations`). Later BOM/routing edits never change existing orders.
2. Approval (`production_order_transition → approved`) calls `production_order_reserve`: reserves `min(outstanding, available)` per line, then moves to `ready_to_start` or `materials_pending` and notifies the store.
3. `production_issue_materials` consumes reservations first, then available stock; `production_return_materials` returns at issued cost; `production_record_wastage` classifies already-issued material.
4. Progress is recorded per operation (manager UI or worker job cards). A step can't process more than passed the previous step; finishing the last step moves the order to quality inspection.
5. `production_order_complete` refuses output that exceeds issued material (unless an approver records an audited exception), enforces the final-inspection gate (accepted ≤ units that passed final inspection; mandatory if `require_final_inspection`), allocates automatic overheads, posts a finished-goods receipt for **accepted units only** valued at (material + labour + machine + overhead + other) ÷ accepted units, writes an immutable `production_cost_snapshots` row, releases leftover reservations and closes job cards.

Allowed transitions: draft→awaiting_approval→approved→(materials_pending|ready_to_start)→in_progress⇄paused, in_progress⇄quality_inspection→completed; any open state→cancelled (requires a reason and that issued material is returned or written off). Starting with shortages requires approve permission and a reason.

## Procurement

Requisitions (`purchase_requisitions`) → approval → purchase orders (`purchase_orders`, line totals as generated columns, header totals recalculated by `app.po_recalc`) → goods receipts. `goods_receipts` and their lines are immutable; each accepted line posts a `goods_receipt` inventory transaction at the net unit price (after discount, excluding VAT), so weighted-average cost reflects what stock actually cost. Rejected quantity is recorded with a reason and never stocked; over-receipt beyond the outstanding quantity is refused. Receipts are idempotent per submission key.

## Quality

`quality_checks` (immutable) record inspected / passed / rejected with an optional checklist (`quality_templates`), defects and corrective actions. Final production inspections are summed in `production_inspection_totals`; completion cannot stock more units than passed.

## Costing

Rates live in `cost_rates` (one default labour rate; overheads applied automatically by basis). Labour and machine time (`labour_cost_entries`) and direct overheads (`overhead_cost_entries`) are recorded against open orders. `production_cost_summary` returns estimate vs actual; completion freezes the actual in `production_cost_snapshots`.

## Customer orders

`sales_orders` → `sales_order_items`. Confirming calls `app.so_allocate`, which holds free finished goods in `sales_allocations` and raises `inventory_balances.reserved` (the same mechanism as material reservations, so other orders and production can't take that stock). `sales_order_make` creates a production order linked through `production_orders.sales_order_item_id` (clients can't change that link); a trigger allocates its output to the order when it completes. `dispatch_post` consumes the line's allocation first, then free stock, and posts a `sales_dispatch` movement at average cost; `dispatches` and `dispatch_items` are permanent except for the one-time delivery confirmation. Goods-receipt and dispatch movements can't be reversed in the ledger (a trigger blocks it) because that would desynchronise the purchase or customer order. Payments are append-only with void-with-reason; `amount_paid` is recalculated from them.

## Workforce

`employees` don't need a login (optional link to a profile). Pay lives in `employee_pay`, readable only with `workforce.manage` or `costing.read`. `attendance_record` upserts one row per employee per day, computing hours from clock times (or the shift length) minus the unpaid break, and overtime beyond the shift; overnight shifts are handled.

## Alerts

Critical conditions are detected by deterministic SQL rules (`operational_alerts`, low-stock trigger, `run_scheduled_checks`), never by AI. When the AI Copilot arrives it will explain these alerts, not be responsible for detecting them.

## Billing

`plans` and one `subscriptions` row per organisation (created by trigger: 14-day Growth trial; demo orgs are comped). `billing_state()` gives plan, limits, usage and lock state. Limits are enforced by triggers on invitations and factories, and `app.require_permission` refuses any non-read permission (except `billing.manage`) once the subscription is locked (7 days after the trial or period ends), so the lock holds for direct API calls too. Paystack: the server starts a pending checkout, redirects to hosted checkout, verifies on callback, and also accepts the HMAC-SHA512-signed webhook; `billing_events` makes both idempotent, and `billing_record_payment` is callable only by the service role.

## Intelligence

Deterministic first: `demand_forecast` (8-week weighted average of dispatches + open orders vs free stock and WIP), `material_requirements` (explodes forecast gaps and unreserved open production through BOMs with wastage, nets stock and open POs), `bottleneck_analysis` and `detect_anomalies` are plain SQL with permission checks. The copilot (`src/lib/copilot`) is provider-independent (OpenAI-compatible Chat Completions with tools). Read tools run through the user's own RLS client, so it can never see more than the user; `propose_*` tools only return a proposal card, which the user confirms through the normal server action. Usage is reserved per request against the plan's monthly allowance; prompts and answers aren't stored. Missing credentials → 503 and a plain message; provider failure → 502.

## WhatsApp

`whatsapp_contacts` (opt-in per person and organisation). A trigger on `notifications` queues warning/critical alerts for opted-in recipients in `whatsapp_outbox`; the outbox is flushed after each server action (`after()`) and by the daily cron, with 3 attempts. Inbound messages are verified with `X-Hub-Signature-256` and handled by `whatsapp_handle_message` (service role only), which acts with the linked user's permissions.

## Offline factory floor

Job-card updates carry a `client_ref`. If a request fails because the device is offline, the update is stored in `localStorage` and replayed when connectivity returns; the database ignores a `client_ref` it has already applied (`production_logs.client_ref` unique), so replays are safe. Rejected replays stay visible as errors; nothing is discarded silently.

## Audit

`audit_logs` is append-only (trigger blocks update/delete, even for the table owner). Row triggers capture changed fields on master data; workflow functions write explicit entries (adjustments, reversals, overrides, approvals, role and permission changes, completions). Each entry records actor, org, entity, old/new values, source and the request ID propagated from the Next.js proxy as `x-request-id`.

## Frontend

- App Router with server components for data, client components for interaction; `cacheComponents` is off because every page is per-tenant and per-user.
- `src/lib/auth.ts` is the data-access layer for session, active organisation and permissions (React `cache` per request).
- Lists are server-driven (URL search params for search, filters, sort, pagination) so they scale and are shareable.
- Design tokens live in `src/app/globals.css` (`@theme`); chart colours are validated for colour-vision deficiency and contrast.

## Key decisions & assumptions

| Decision | Why |
|---|---|
| Postgres functions for multi-row workflows | Atomic transactions and row locks; the same rules hold for any client (web, future mobile, AI tools) |
| Weighted average first, FIFO later | Weighted average is the common SME practice and fully consistent with the ledger; FIFO requires cost layers |
| Completion posts one final output | Keeps finished-goods costing exact (cost ÷ accepted units). Partial completions are on the roadmap |
| Material cost only in finished-goods valuation | Labour/overhead costing is the P1 costing module; the UI labels figures as material cost |
| Generic default stages, templates optional | The brief forbids hardcoding garment stages in the core |
| NGN default for Nigeria, currency is a label | No FX conversion is implied |
