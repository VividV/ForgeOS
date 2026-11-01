# ForgeOS

**Know your factory. Control your production. Grow your business.**

ForgeOS is a manufacturing operations platform: production orders, bills of materials, a stock ledger, factory-floor job cards and real-time operational visibility, in one multi-tenant SaaS application.

This repository contains **phase 1: the P0 foundation**. It covers every P0 capability in the build brief, working end to end and tested. P1 and P2 modules (procurement, quality templates, costing, billing, AI Copilot, WhatsApp) are not built yet. See [docs/ROADMAP.md](docs/ROADMAP.md).

## What works today

| Area | Capability |
|---|---|
| Accounts & tenancy | Sign-up with email verification, password reset, optional Google sign-in, multiple organisations per user, organisation switcher, 7-step onboarding with guided checklist |
| Access control | 9 default roles, ~50 granular permissions (create/read/update/delete/approve/export/manage), custom roles, anti-escalation, enforced in **Postgres RLS + security-definer functions + server actions + UI** |
| Factory setup | Multiple factories, warehouses and work centres; configurable production stages with industry templates (garment, food, furniture, general); routings per product/factory |
| Catalogue | Products with variants (size, colour), materials with units, purchase conversion, reorder/min/max levels, preferred supplier; suppliers |
| BOM | Versioned BOMs, draft → approval → approved/superseded/archived, wastage %, nested BOMs (sub-assemblies), cost estimate per unit, read-only once approved |
| Inventory | Immutable ledger: opening balances, receipts, transfers, adjustments (count / damage / wastage / found / expired), production issues & returns, finished-goods receipts, reversals. Weighted-average valuation. Available = on hand − reserved. Negative stock blocked unless authorised (audited). Low/out/excess/slow-moving detection. Idempotent submissions |
| Production | Order numbers, BOM + routing snapshot at creation, 10-status state machine with enforced transitions and history, automatic material reservation and shortage detection on approval, issue/return/wastage, per-step progress with "can't exceed previous step" rule, downtime, notes, job cards with QR printouts, completion that stocks **only accepted units** at **actual material cost per accepted unit**, planned-vs-actual material reconciliation |
| Planning | Kanban board (stages as columns), table and timeline views with filters |
| Factory floor | Mobile-first "My job cards": start, record output, report defects/shortages, notes, pause, finish. **Offline queue** with pending/synced/error states and idempotent replay. PWA manifest + service worker |
| Mission Control | KPIs, charts and rule-based alerts (overdue, materials pending, over-consumption vs BOM, idle work centres, rising rejection, low stock), daily production, activity feed |
| Notifications | In-app notifications with deep links, read/unread; scheduled overdue checks via cron; email via Resend when configured |
| Reports & data | Production, efficiency, material consumption, wastage, inventory valuation, stock movements; CSV export (formula-injection safe) and print/PDF; CSV import for materials (with opening balances) and products with column mapping, validation, duplicate detection, preview and all-or-nothing save |
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
npx playwright test                  # browser acceptance tests 1–5 and 10 from the brief
```

## Documentation

- [Architecture](docs/ARCHITECTURE.md): design, security model, key decisions
- [ERD](docs/ERD.md) and [Data dictionary](docs/DATA_DICTIONARY.md): generated from the schema (`node scripts/gen-schema-docs.mjs`)
- [API](docs/API.md): server actions, database functions and HTTP routes
- [User onboarding guide](docs/USER_GUIDE.md)
- [Deployment checklist](docs/DEPLOYMENT.md): Supabase, Vercel, environments, backups
- [Roadmap & known limitations](docs/ROADMAP.md)
- [`.env.example`](.env.example): every environment variable
