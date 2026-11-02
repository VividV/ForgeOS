# ForgeOS

**Know your factory. Control your production. Grow your business.**

ForgeOS is a manufacturing operations platform: production orders, bills of materials, a stock ledger, factory-floor job cards and real-time operational visibility, in one multi-tenant SaaS application.

This repository contains **phase 1 (the P0 foundation)**, **phase 2 (procurement, quality control and costing)** and **phase 3 (customer orders and workforce)**, **phase 4 (stock counts, returns, credit notes, tax invoices, uploads)**, **phase 5 (billing, plans, platform admin, demo workspace)** and **phase 6 (AI copilot, forecasting, bottlenecks, anomalies, WhatsApp)**, working end to end and tested. Integrations without credentials (Paystack, AI, WhatsApp, Resend) stay switched off and say so. See [docs/ROADMAP.md](docs/ROADMAP.md).

## What works today

| Area | Capability |
|---|---|
| Accounts & tenancy | Sign-up with email verification, password reset, optional Google sign-in, multiple organisations per user, organisation switcher, 7-step onboarding with guided checklist |
| Access control | 9 default roles, ~50 granular permissions (create/read/update/delete/approve/export/manage), custom roles, anti-escalation, enforced in **Postgres RLS + security-definer functions + server actions + UI** |
| Factory setup | Multiple factories, warehouses and work centres; configurable production stages with industry templates (garment, food, furniture, general); routings per product/factory |
| Catalogue | Products with variants (size, colour), materials with units, purchase conversion, reorder/min/max levels, preferred supplier; suppliers |
| BOM | Versioned BOMs, draft → approval → approved/superseded/archived, wastage %, nested BOMs (sub-assemblies), cost estimate per unit, read-only once approved |
| Inventory | Immutable ledger: opening balances, receipts, transfers, adjustments (count / damage / wastage / found / expired), production issues & returns, finished-goods receipts, reversals. Weighted-average valuation. Available = on hand − reserved. Negative stock blocked unless authorised (audited). Low/out/excess/slow-moving detection. Idempotent submissions |
| Production | Order numbers, BOM + routing snapshot at creation, 10-status state machine with enforced transitions and history, automatic material reservation and shortage detection on approval, issue/return/wastage, per-step progress with "can't exceed previous step" rule, downtime, notes, job cards with QR printouts, completion that stocks **only accepted units** at **full actual cost per accepted unit**, planned-vs-actual material reconciliation |
| Procurement | Purchase requisitions (manual, from reorder suggestions or production shortages) with approval, purchase orders with discounts, VAT, shipping and an auto-approve threshold, printable POs, goods received with partial deliveries, rejected quantities with reasons, over-receipt blocked; only accepted goods enter stock, valued at the net (ex-VAT) price |
| Quality control | Reusable checklists, production and incoming-goods inspections, pass/fail/conditional (conditional needs a quality approver), defects by category and severity, corrective actions with owners and due dates, defect analytics; **final-inspection gate**: completed units can't exceed units that passed, optionally mandatory |
| Customer orders | Customers with balances and credit limits; orders with discounts, VAT and delivery charge; confirming holds finished goods for the order; per-line shortfall with one-click production orders linked to the line, whose output is held for the customer automatically on completion; dispatches (stock leaves at average cost, idempotent) with printable delivery notes and delivery confirmation; payments with void-with-reason; pro-forma invoices; late / needs-production / ready-to-dispatch alerts |
| Workforce | Employees who don't need a login, departments, shifts (including overnight), daily attendance register with hours and overtime, monthly summary, pay rates visible only to managers and cost viewers, labour costing from the employee's own rate |
| Costing | Labour rate and overhead rates (per hour, per unit, % of material, per order), labour/machine/other cost entries on orders, estimate vs actual per cost type, gross margin, product cost estimates with saved standards; finished goods valued at material + labour + machine + overhead ÷ accepted units, frozen in a cost snapshot |
| Planning | Kanban board (stages as columns), table and timeline views with filters |
| Factory floor | Mobile-first "My job cards": start, record output, report defects/shortages, notes, pause, finish. **Offline queue** with pending/synced/error states and idempotent replay. PWA manifest + service worker |
| Mission Control | KPIs, charts and rule-based alerts (overdue, materials pending, over-consumption vs BOM, idle work centres, rising rejection, low stock, late supplier deliveries, POs awaiting approval, overdue corrective actions), daily production, activity feed |
| Notifications | In-app notifications with deep links, read/unread; scheduled overdue checks via cron; email via Resend when configured |
| Reports & data | Production, efficiency, material consumption, wastage, inventory valuation, stock movements, purchase orders, supplier performance, quality and defects, production cost (estimate vs actual); CSV export (formula-injection safe) and print/PDF; CSV import for materials (with opening balances) and products with column mapping, validation, duplicate detection, preview and all-or-nothing save |
| Stock counts | Blind count sheets per warehouse, record → submit → approve; approval posts count adjustments to the ledger |
| Returns & invoicing | Customer returns back into stock (or written off), credit notes netted from balances, numbered tax invoices with VAT, bank details and footer, void with reason |
| Files | Photos and PDFs (≤ 4 MB) on inspections, receipts, dispatches, POs, customer orders, production orders, stock counts and job cards; organisation logo on printouts |
| Billing | 14-day Growth trial, Starter / Growth / Professional / Enterprise plans with user, factory and AI limits, Paystack checkout + signed webhook, payment history, 7-day grace then read-only lock (enforced in the database) |
| Platform admin & demo | Internal admin for platform staff (organisations, plans, suspend with a note); optional "ForgeOS Manufacturing Demo" sample workspace kept separate from real data |
| Intelligence | Insights page: demand forecast, materials to order (MRP through the BOM), bottleneck ranking, anomaly checks. AI copilot that answers from live data with the user's own permissions and prepares requisitions / production orders for the user to confirm. Monthly AI allowance per plan |
| WhatsApp | Opt-in per person: warning and critical alerts, daily summary, and replies (`STATUS PRD-00012`, `JC-… 12 1` to record output) |
| Audit | Append-only audit log of master-data changes, adjustments, reversals, role/permission changes, overrides, approvals, completions, with request IDs |

## Tech stack

Next.js 16 (App Router, server actions) · React 19 · TypeScript strict · Tailwind CSS 4 · Radix primitives (shadcn-style components) · React Hook Form + Zod · Recharts · Supabase (Postgres 15+, Auth, RLS) · Vitest · Playwright.

## Quick start (local)

Requirements: Node 22, and either the [Supabase CLI](https://supabase.com/docs/guides/cli) with Docker **or** the Docker-free local stack in `scripts/local-stack`.

```bash
npm ci

# Option A — Supabase CLI (recommended)
supabase start                       # applies supabase/migrations
supabase status -o env               # copy API_URL / ANON_KEY / SERVICE_ROLE_KEY into .env.local

# Option B — no Docker (Postgres 16 + Supabase Auth + PostgREST binaries)
./scripts/local-stack/start.sh       # prints local API keys
node scripts/local-stack/keys.mjs --env > .env.local

echo "NEXT_PUBLIC_APP_URL=http://localhost:3000" >> .env.local
npm run dev                          # http://localhost:3000 → sign up → onboarding
```

## Tests

```bash
npx vitest run tests/unit            # pure helpers
npx vitest run tests/db              # RLS, tenancy, RBAC, inventory engine, production flow (needs the database)
npm run build && npm start &         # then:
npx playwright test                  # browser acceptance tests 1–7 and 10 from the brief, plus customer orders and workforce
node scripts/check-selects.mjs src "$SERVICE_ROLE_KEY"   # every app query checked against the Data API
```

## Documentation

- [Architecture](docs/ARCHITECTURE.md): design, security model, key decisions
- [ERD](docs/ERD.md) and [Data dictionary](docs/DATA_DICTIONARY.md): generated from the schema (`node scripts/gen-schema-docs.mjs`)
- [API](docs/API.md): server actions, database functions and HTTP routes
- [User onboarding guide](docs/USER_GUIDE.md)
- [Deployment checklist](docs/DEPLOYMENT.md): Supabase, Vercel, environments, backups
- [Roadmap & known limitations](docs/ROADMAP.md)
- [`.env.example`](.env.example): every environment variable
