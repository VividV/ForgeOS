# Roadmap & known limitations

## Status

**Phase 1: P0 foundation, complete and tested.**

**Phase 2 (this release): procurement, quality control and costing, complete and tested** (acceptance tests 5, 6 and 7). The remaining P1 items and all P2 items below are **not built yet**. Their navigation entries are hidden rather than shown as placeholders.

## Known limitations of the current build

| Limitation | Detail / plan |
|---|---|
| Not deployed | No live URL yet; see [DEPLOYMENT.md](DEPLOYMENT.md) |
| FIFO valuation | Selectable as "coming soon", blocked server-side. Weighted average is applied everywhere. Needs cost layers |
| Costing | Finished goods are valued at full actual cost (material + labour + machine + overhead + other) per accepted unit. Standard costing variance analysis by cause (price vs usage) is not yet broken out; estimate vs actual is shown per cost type |
| Overhead allocation | Automatic overheads are allocated on completion by basis (per labour hour, per unit, % of material, per order). Period-based absorption (monthly overhead pools spread across all output) is not yet supported |
| Single final output per order | Partial completions (stocking batches before the order closes) are not yet supported |
| Quality | Checklists, inspections, defects, corrective actions and the final-inspection gate are built. Quarantine stock (holding received goods pending inspection) is not; rejected goods on receipt never enter stock, and accepted goods enter stock immediately. Defect photos need storage (below) |
| Procurement | Supplier invoices / three-way match, supplier price lists, multi-currency purchase orders (orders use the organisation currency) and emailing POs to suppliers are not yet built; POs print to PDF from the browser |
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

Done in phase 2: **procurement** (requisitions → approval → purchase orders with tax, discounts and shipping → goods received with partial deliveries and discrepancies; only accepted goods enter stock), **quality control** (checklists, inspections, defects with severity, pass/fail/conditional, corrective actions, defect analytics, final-inspection gate on completion) and **costing** (labour and overhead rates, labour/machine/overhead entries, estimate vs actual, gross margin, full-cost finished-goods valuation).

Next:

1. **Customer orders** → production orders (the `source` field exists).
2. **Workforce**: employees without logins, departments, shifts, optional attendance, skills.
3. **Billing**: Paystack (Starter ₦40k / Growth ₦120k / Professional ₦250k / Enterprise), webhooks, plan limits, trials, invoices; Flutterwave as an alternative provider.
4. Quarantine stock, supplier invoices / three-way match.
5. Stock counts (count sheets) and storage for photos/attachments.

## P2: intelligence

- **Forge AI Copilot**: provider-independent service layer, read-only tools built on the existing permission-checked functions, write tools behind explicit confirmation, usage tracking, and graceful degradation when the provider is down.
- Forecasting (production and material demand), bottleneck and anomaly detection on top of the deterministic alerts.
- WhatsApp Business notifications and updates, voice updates, machine integrations.
