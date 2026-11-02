# Production deployment checklist

Nothing in this repository has been deployed yet. Follow these steps to go live, and verify each one.

## Environments

| Environment | Supabase project | Vercel environment | Branch |
|---|---|---|---|
| Development | local (`supabase start` or `scripts/local-stack`) | `npm run dev` | any |
| Staging | `forgeos-staging` | Preview | pull requests / `staging` |
| Production | `forgeos-prod` | Production | `main` |

Use separate Supabase projects for staging and production. Never point staging at production data.

## 1. Supabase (per environment)

- [ ] Create the project (region close to your users, e.g. `eu-west-2` or `af-south-1` if available on your plan).
- [ ] `supabase link --project-ref <ref>` then `supabase db push` to apply `supabase/migrations` in order (or paste the combined setup SQL into the SQL Editor).
- [ ] Make yourself a platform admin (SQL Editor): `update profiles set is_platform_admin = true where email = 'you@example.com';`
- [ ] Verify: `select count(*) from pg_tables where schemaname='public' and not rowsecurity;` returns **0**.
- [ ] Auth → Providers → Email: **Confirm email ON**, secure password change ON, minimum password length ≥ 10.
- [ ] Auth → URL configuration: Site URL = production URL; redirect URLs include `https://<domain>/auth/confirm` and `/auth/callback`.
- [ ] Auth → Email templates: the default templates work (the confirmation link must be opened in the browser used to sign up). Once custom SMTP is set up (Supabase only allows template editing with custom SMTP on new free projects), switch confirmation and recovery links to the token-hash flow so they work in any browser: `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email` (recovery: `type=recovery`).
- [ ] Auth → SMTP: configure a custom SMTP sender (e.g. Resend or Brevo). Without it, Supabase only sends auth emails to members of your Supabase organisation, at about 2 per hour, so nobody else can confirm a sign-up.
- [ ] Auth → Rate limits: review sign-in/sign-up/email limits.
- [ ] (Optional) Google provider: client ID/secret, then set `GOOGLE_AUTH_ENABLED=true`.
- [ ] Database → Backups: enable daily backups; on Pro, enable **Point-in-Time Recovery** for production.
- [ ] Run a restore drill on staging at least once before launch.

## 2. Vercel

- [ ] Import the GitHub repo; framework preset Next.js; Node 22.
- [ ] Set environment variables per environment from [`.env.example`](../.env.example):
  `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (server only), `CRON_SECRET`, optional `RESEND_API_KEY` + `EMAIL_FROM`, `GOOGLE_AUTH_ENABLED`, `PAYSTACK_SECRET_KEY` (+ optional `PAYSTACK_PLAN_*`), `AI_BASE_URL` + `AI_API_KEY` + `AI_MODEL`, `WHATSAPP_TOKEN` + `WHATSAPP_PHONE_NUMBER_ID` + `WHATSAPP_VERIFY_TOKEN` + `WHATSAPP_APP_SECRET`. All of these are server-only (type Secret); only `NEXT_PUBLIC_*` are Config.
- [ ] Cron: `vercel.json` schedules `/api/cron/checks` daily at 06:00 UTC; Vercel sends `CRON_SECRET` as a Bearer token. Verify the first run in Vercel → Cron Jobs.
- [ ] Domain: add your domain, set DNS, confirm HTTPS. Update `NEXT_PUBLIC_APP_URL` and Supabase Site URL.
- [ ] Firewall/WAF: enable Vercel's bot protection and a rate-limit rule on `/login`, `/signup` and server-action POSTs.

## 3. Email (optional but recommended)

- [ ] Resend: verify the sending domain (SPF/DKIM), create an API key, set `RESEND_API_KEY` and `EMAIL_FROM`.
- [ ] Without it, invitations show a copyable link and Settings → Integrations shows "Not configured".

## 3b. Payments, AI and WhatsApp (optional)

- [ ] **Paystack**: Settings → API Keys & Webhooks → copy the secret key into `PAYSTACK_SECRET_KEY`; set the webhook URL to `https://<domain>/api/billing/paystack/webhook`. Test with `sk_test_` keys and Paystack's test card before going live.
- [ ] **AI**: any OpenAI-compatible endpoint (`AI_BASE_URL`, e.g. `https://api.openai.com/v1`), key and model. Settings → Integrations shows whether it's on.
- [ ] **WhatsApp**: Meta for Developers → WhatsApp → API setup: phone number ID and a permanent token; App settings → Basic → App secret. Webhook callback `https://<domain>/api/whatsapp/webhook`, verify token = `WHATSAPP_VERIFY_TOKEN`, subscribe to `messages`. People opt in from Account → WhatsApp.

## 4. Monitoring

- [ ] Vercel → Logs / Observability: server actions log unexpected database errors as `[db] unexpected error` with code and message.
- [ ] Add an error tracker (e.g. Sentry for Next.js) before inviting customers. It isn't bundled yet.
- [ ] Supabase → Reports: watch slow queries; indexes exist for the hot paths (ledger by item/time, orders by status/due date, logs by order/time).

## 5. Go-live verification

- [ ] CI is green (typecheck, lint, unit, DB security tests, E2E).
- [ ] Sign up on production with a real email → confirmation email arrives → onboarding completes.
- [ ] Invite a second user → they join with the right role and restricted navigation.
- [ ] Run one production order end to end; finished goods appear; audit log shows the trail.
- [ ] Create a second organisation and confirm it can't see the first one's records.
- [ ] Call `/api/cron/checks` with the secret → `200 {ok:true}`; without it → `401`.

## Backups & recovery procedure

1. Daily automated backups (Supabase), retained per plan; PITR on production.
2. Before every migration on production: take a manual backup (`supabase db dump` to secure storage).
3. Restore: Supabase dashboard → Database → Backups → Restore (or PITR to a timestamp). Then redeploy the matching app commit.
4. The ledger is append-only, so data errors are corrected with reversals in the app, never by editing rows.
