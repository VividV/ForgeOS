# Roadmap & known limitations

## Status

**Phase 1: P0 foundation, complete and tested.**

**Phase 2: procurement, quality control and costing, complete and tested** (acceptance tests 5, 6 and 7).

**Phase 3: customer orders and workforce, complete and tested.**

**Phase 4: stock counts, returns and credit notes, tax invoices, employee job cards, photo/PDF uploads, logo, complete and tested.**

**Phase 5: billing (Paystack), trials and plan limits, platform admin, demo workspace, complete and tested.** Plan limits (users / factories / AI questions) are placeholders to confirm before launch.

**Phase 6: AI copilot, demand forecasting, material planning, bottleneck and anomaly detection, WhatsApp, complete and tested** (copilot and WhatsApp need provider credentials; without them they say they're switched off).

## Known limitations of the current build

| Limitation | Detail / plan |
|---|---|
| FIFO valuation | Selectable as "coming soon", blocked server-side. Weighted average is applied everywhere. Needs cost layers |
| Costing | Finished goods are valued at full actual cost (material + labour + machine + overhead + other) per accepted unit. Standard costing variance analysis by cause (price vs usage) is not yet broken out; estimate vs actual is shown per cost type |
| Overhead allocation | Automatic overheads are allocated on completion by basis (per labour hour, per unit, % of material, per order). Period-based absorption (monthly overhead pools spread across all output) is not yet supported |
| Single final output per order | Partial completions (stocking batches before the order closes) are not yet supported |
| Quality | Checklists, inspections, defects, corrective actions and the final-inspection gate are built. Quarantine stock (holding received goods pending inspection) is not; rejected goods on receipt never enter stock, and accepted goods enter stock immediately. Defect photos need storage (below) |
| Customer orders | Orders use the organisation currency. A confirmed order can't be edited (cancel and re-create). Customer payments are recorded manually (Paystack is used for ForgeOS subscriptions only) |
| Workforce | Payroll is not calculated; attendance gives hours and overtime for export. Job cards can be assigned to employees without logins |
| Procurement | Supplier invoices / three-way match, supplier price lists, multi-currency purchase orders (orders use the organisation currency) and emailing POs to suppliers are not yet built; POs print to PDF from the browser |
| Column-level cost hiding | Costs are hidden in the UI, exports and worker views for users without `costing.read`, but RLS on `stock_items.average_cost` is row-level only. Move cost columns behind a security-definer view before onboarding sensitive customers |
| Files | Stored in the database (≤ 4 MB each, Vercel's request limit). Move to Supabase Storage before heavy photo use |
| Billing | Paystack only (no Flutterwave). Plan prices and limits are placeholders. Subscription invoices are the Paystack receipts plus the payment history in Admin → Billing |
| AI copilot | Conversations aren't stored (only usage counts). Write actions are prepared, never executed, until the user confirms. Quality depends on the chosen model |
| Forecasting | Weighted moving average of 8 weeks of dispatches plus open orders; no seasonality model yet |
| WhatsApp | Business-initiated messages outside the 24-hour window need approved templates in Meta; until then alerts reach people who've messaged the number in the last 24 h. Voice notes and machine integrations aren't built |
| Rate limiting | Relies on Supabase Auth limits plus an org-creation limit in the database; add Vercel WAF rules (see deployment checklist) |
| Error tracking | Structured server logs only; add Sentry before launch |
| Email notifications | Invitations email via Resend when configured; per-event notification emails (preferences table exists) are not yet sent |
| Local dev stack | `scripts/local-stack` runs Supabase Auth + PostgREST without Docker; Storage and Realtime are not included |

## Next

1. Confirm plan prices and limits; Flutterwave as a second payment provider.
2. Quarantine stock, supplier invoices / three-way match.
3. Move file storage to Supabase Storage; Sentry error tracking.
4. WhatsApp message templates; voice updates; machine integrations.
5. Seasonal forecasting once there's a year of history.
