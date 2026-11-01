# Roadmap & known limitations

## Status

**Phase 1 (this release): P0 foundation, complete and tested.** The P1 and P2 items below are **not built yet**. Their navigation entries are hidden rather than shown as placeholders.

## Known limitations of the current build

| Limitation | Detail / plan |
|---|---|
| Not deployed | No live URL yet; see [DEPLOYMENT.md](DEPLOYMENT.md) |
| FIFO valuation | Selectable as "coming soon", blocked server-side. Weighted average is applied everywhere. Needs cost layers |
| Costing | Finished goods are valued at actual **material** cost per accepted unit. Labour, machine and overhead costing arrive with the P1 costing module |
| Single final output per order | Partial completions (stocking batches before the order closes) are not yet supported |
| Quality module | Rejected units are recorded and never stocked, but reusable inspection templates, defect categories, severity and corrective actions are P1 |
| Photos / attachments | Not yet implemented (needs Supabase Storage buckets with signed URLs). The worker flow supports text defect and shortage reports |
| Logo upload | Organisation logo upload not yet implemented (same storage dependency) |
| Column-level cost hiding | Costs are hidden in the UI, exports and worker views for users without `costing.read`, but RLS on `stock_items.average_cost` is row-level only. Move cost columns behind a security-definer view before onboarding sensitive customers |
| Rate limiting | Relies on Supabase Auth limits plus an org-creation limit in the database; add Vercel WAF rules (see deployment checklist) |
| Error tracking | Structured server logs only; add Sentry before launch |
| Email notifications | Invitations email via Resend when configured; per-event notification emails (preferences table exists) are not yet sent |
| Demo workspace | The optional "ForgeOS Manufacturing Demo" sample organisation (brief §29) is not built yet |
| Platform admin | Internal platform administration (brief §26) is not built; `profiles.is_platform_admin` exists and can't be self-assigned |
| Local dev stack | `scripts/local-stack` runs Supabase Auth + PostgREST without Docker; Storage and Realtime are not included |

## P1: commercial operating capabilities (next)

1. **Procurement**: purchase requisitions → approval → purchase orders (taxes, discounts, shipping) → goods received with partial deliveries and discrepancies → stock. Supplier tables already exist.
2. **Quality control**: templates, inspections at configurable stages, defect categories and severity, pass/fail/conditional, corrective actions, defect analytics; quarantine stock.
3. **Costing**: labour entries and rates, machine hours (work-centre hourly cost exists), overhead allocation, estimated vs actual, margins.
4. **Customer orders** → production orders (the `source` field exists).
5. **Workforce**: employees without logins, departments, shifts, optional attendance, skills.
6. **Billing**: Paystack (Starter ₦40k / Growth ₦120k / Professional ₦250k / Enterprise), webhooks, plan limits, trials, invoices; Flutterwave as an alternative provider.
7. Stock counts (count sheets) and storage for photos/attachments.

## P2: intelligence

- **Forge AI Copilot**: provider-independent service layer, read-only tools built on the existing permission-checked functions, write tools behind explicit confirmation, usage tracking, and graceful degradation when the provider is down.
- Forecasting (production and material demand), bottleneck and anomaly detection on top of the deterministic alerts.
- WhatsApp Business notifications and updates, voice updates, machine integrations.
