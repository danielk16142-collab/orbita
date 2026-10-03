# Setup

## 1. Supabase project
1. Create a project in the region chosen for data residency (see `docs/compliance/launch-checklist.md`).
2. Apply the migrations in order: `supabase/migrations/0001` to `0005` (`supabase db push`, or paste into the SQL editor).
3. **Authentication → Providers → Email**: keep enabled; **disable "Allow new users to sign up"** (accounts come only from invitations or the bootstrap script).
4. **Authentication → Attack Protection → CAPTCHA**: provider Cloudflare Turnstile + secret key (see `docs/security.md`).
5. **Authentication → Multi-factor**: TOTP enabled.
6. **Authentication → Password**: minimum length 12; enable leaked-password protection if your plan offers it.
7. Storage: the migration creates the private `client-logos` bucket. Confirm it is **not public**.

## 2. Environment
Copy `apps/web/.env.example` to `apps/web/.env.local` and fill it in. On Vercel set the same variables per environment (separate Supabase projects and Turnstile widgets for preview and production). `SUPABASE_SERVICE_ROLE_KEY` and all secrets stay server-only.

## 3. First admin
```
cd apps/web
SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... BOOTSTRAP_PASSWORD='a-long-unique-password' \
  pnpm bootstrap --agency "Your Agency" --email you@example.com --name "Your Name"
```
Then sign in, set up two-step verification (required for admin and team), and accept the terms.

## 4. Daily flow
Admin: **Clients → New client → Branding** (logo, colors, optional lock) → **Users → Invite**. The client opens the emailed link, creates an account (accepting the terms) and signs in to a portal themed with their branding.

## 5. Tests
`pnpm test` (security package), `pnpm test:rls` (tenant isolation on Postgres), `pnpm typecheck`, `pnpm build`.
