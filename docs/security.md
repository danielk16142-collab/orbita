# Security setup

## Cloudflare Turnstile (bot verification)

Turnstile is on the login form. Add it to any other form reachable without a session.

1. Cloudflare dashboard > Turnstile > **Add widget**. Mode: Managed. Add your production and preview hostnames. Copy the **site key** and **secret key**.
2. **Vercel** env vars (Production and Preview, with separate widgets per environment):
   - `NEXT_PUBLIC_TURNSTILE_SITE_KEY` = site key (public)
   - `TURNSTILE_SECRET_KEY` = secret key (server only)
3. **Supabase** > Authentication > Attack Protection > enable CAPTCHA, provider **Cloudflare Turnstile**, paste the secret key.
   Supabase then verifies the token on `signInWithPassword`, so calls made directly to the Supabase auth API cannot skip the check.
4. Own endpoints (invitations, contact, agent entry points) call `passesTurnstile(form, "<action>")` from `apps/web/src/lib/turnstile-guard.ts`. It fails closed: missing secret, missing token, network error or wrong action all reject.
5. Tokens are single-use and expire after 5 minutes. Never verify the same token twice (the login token is consumed by Supabase).
6. Local development: Cloudflare test keys (`1x00000000000000000000AA` site key) always pass and only exercise the widget. Test real keys in a preview deployment.

## Cloudflare proxy / WAF (optional, recommended in production)

- Put the domain's DNS in Cloudflare and proxy the app hostname. SSL/TLS mode **Full (strict)**.
- Enable managed WAF rules and Bot Fight Mode. Add rate-limiting rules for `/*/login` and `/api/*`.
- Do not cache dynamic routes (pages are per-user). Bypass cache for everything except static assets under `/_next/static`.
- Behind Cloudflare the real client IP is in `cf-connecting-ip`; the code prefers it over `x-forwarded-for`.
- Do not let attackers skip Cloudflare by hitting the Vercel URL directly: enable Vercel deployment protection for non-production URLs and keep the production alias on the proxied domain.
- Turn on HSTS only after the domain works on HTTPS everywhere (the app already sends it).

## Secrets and keys
- Secrets only in Vercel/Supabase secret stores. `.env*` is git-ignored. CI runs gitleaks.
- `ORBITA_MASTER_KEY` (32 bytes, base64) encrypts social tokens via envelope encryption (`packages/security/src/crypto.ts`). Production should hold it in a KMS or Supabase Vault. Losing it makes stored tokens unreadable, so back it up. Rotation: add a key version and re-wrap data keys.
- Rotate the Turnstile secret and Supabase service-role key at least yearly and after any suspected exposure.

## Tenant isolation
- Every table has RLS enabled with default deny. Policies are in `supabase/migrations/0002_rls.sql`.
- `pnpm test:rls` runs `supabase/tests/isolation.sql` and blocks merges in CI. Any new table needs policies and a test.
- The service-role key is server-only and used only for token writes, metrics sync jobs, audit-log writes and role changes.

## Known gaps (tracked in PLAN.md)
MFA enrollment UI, invitations, audit-log writes from server code, shared-store rate limiting, RLS tests against a full Supabase stack.
