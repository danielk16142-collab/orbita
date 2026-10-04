# Orbita — Plan

Marketing management platform for an agency and its clients: live metrics, content planning, an AI agent trained per brand, and a client portal.

## 1. Product sections

### Home (dashboard)
- KPI cards per client and network: followers, reach, engagement rate, posts published, ad spend, ROAS, CPA.
- Campaigns: active ads with status, spend, results.
- Next posts: next 7 days from the calendar, plus items awaiting approval.
- Agent insights: what is working now in the client's niche, suggested ideas.
- Alerts: missed posts, performance drops, stale brand profile.

### Posts (planning)
- Day / week / month views. Filter by client and network.
- Each post opens a detail view: caption, hashtags, visuals, network-specific format, status, notes.
- Statuses: idea, draft, approved, scheduled, published.
- Video posts: script shown as scenes (hook, body, CTA) with shot notes, plus a **teleprompter mode** (speed, font size, mirror, countdown).
- Client approval and comments per post.
- CSV export of calendars.

### Agent (chat)
- **Brand training**: interviews the business and fills the brand profile (see 3.2).
- **Plan and post generation**: weekly/monthly plans per network, captions, scripts, blogs.
- **Competitor research**: manual links first, optional automated research. Feeds ideas into the calendar.
- Built on the `client-content-engine` skill (see section 4).

### Clients
- Client list; per-client profile: brand profile, connected accounts, competitors, plan, history.
- **Client portal**: each client logs in to their own dashboard, calendar, approvals and agent chat.
- **Branding per client**: logo (light and dark), primary and accent colors, optional font.

### Later
- Asset library, PDF reports for clients, notifications, ideas bank, billing and usage caps.

## 2. Decisions

| Topic | Decision |
|---|---|
| Stack | Next.js (App Router, TypeScript), Supabase (Postgres, Auth, Storage), Claude API |
| Hosting | Vercel for the web app. Long jobs on a queue (Inngest or Trigger.dev) or a small worker |
| Networks | Instagram and TikTok first. LinkedIn and YouTube as later adapters |
| Metrics | Live where possible via official APIs, synced into our own tables |
| Publishing | Built through connectors. Launch in reminder/manual mode until platform app review passes |
| Languages | English, French, Spanish: UI, agent and content (each piece has its own language) |
| Competitors | Manual links always supported. Automated research behind a provider adapter |
| Branding | Orbita branding (style reference to come). Clients can theme their own portal |

## 3. Architecture (built to scale)

### 3.1 Multi-tenancy
- `agency` owns many `clients`. Every row carries `client_id` (and `agency_id`).
- Supabase row-level security: admin and team see their agency; client users see only their own client.
- Roles: `admin`, `team`, `client`.

### 3.2 Core data model
- `agencies`, `profiles` (user, role, agency, client)
- `clients` (name, languages, markets, branding: logo_light, logo_dark, primary, accent, font, branding_locked)
- `brand_briefs` (per client): brand, voice, avoid-list, personas, objections, content pillars, channels and cadence, CTAs, visual identity
- `proof_items`: approved stats and claims with source (the agent may only use these)
- `client_rules`: standing rules with date and reason
- `competitors` (client_id, network, url, source: manual | auto, last_researched_at)
- `competitor_snapshots`, `trend_insights`
- `social_accounts` (client_id, network, external_id, encrypted tokens, status)
- `metrics_daily` (account_id, date, metric, value)
- `campaigns`, `ad_metrics_daily`
- `posts` (client_id, network, language, type, pillar, persona, funnel_stage, status, scheduled_at, caption, hashtags, media)
- `post_scripts` (post_id, scenes, duration, format)
- `comments`, `approvals`
- `conversations`, `messages` (agent chat, per client)
- `usage_events` (tokens and job counts per client)

### 3.3 Connector layer
Every network or ad platform is an adapter with one interface:

```
connect(client) · refreshToken() · fetchMetrics(range) · listPosts() · publish(post)
```

Instagram, TikTok, LinkedIn, YouTube and Meta Ads are separate modules. New networks do not touch the core. Per-client OAuth with encrypted token storage. An MCP-backed adapter is optional, not the foundation.

### 3.3.1 Metrics pipeline
Scheduled jobs pull metrics into `metrics_daily` and `ad_metrics_daily`. The dashboard reads our tables (fast, rate-limit safe). A manual refresh button queues a sync.

### 3.3.2 Publishing
Queue-based with retries and per-network format validation. Status flows `scheduled -> publishing -> published | failed`. Reminder mode when a platform has not approved publishing.

### 3.4 Agent
- Claude API with per-client context from the brand brief, proof items and rules.
- Tools: read brief, update brief (with confirmation), create or update posts, add competitor, read research and metrics.
- Quality check before showing a draft (section 4, step 8).
- Usage tracked per client.

### 3.5 Theming
- App colors are CSS variables (design tokens). Client colors override them in the portal.
- Contrast checking on color choice. Chart palette stays fixed and accessible; the client accent is used for highlights only.
- Admin sets defaults and can lock branding. Client can reset to default.
- Optional white-label and custom domains later.

### 3.6 i18n
English, French, Spanish from day one (UI strings in message catalogs). Content is written natively per language, never machine-translated from a first draft.

## 4. Agent playbook: client-content-engine

| Skill step | In Orbita |
|---|---|
| Client brief | `brand_briefs` + `proof_items` + `client_rules`, filled by the training chat |
| Intake by content type | Agent question flows for video, blog and caption; skips questions the brief already answers |
| Video scripts | HPASBC structure (hook, problem, agitate, solution, benefit, CTA), 3 ranked hooks, feeds teleprompter |
| Blog posts | SEO title, meta description, H1, internal links, image description |
| Captions | 3 variations (emotional, educational, social proof), network-specific |
| Calendars and series | Posts calendar with pillar, series, persona, funnel stage |
| Standing rules | Client corrections become dated rules; affected planned posts are flagged |
| Quality check | Auto pass: stats vs proof list, objections, voice, single CTA, rules |

## 5. Security

Orbita holds client business data, social account tokens and ad accounts, so security is a design constraint from phase 1, not a later phase.

### 5.1 Authentication and sessions
- Supabase Auth with email + password and magic link. Passkeys/OAuth later.
- **MFA (TOTP) required for admin and team**, optional for clients.
- Password policy and breached-password check; rate limiting and lockout on login.
- Short-lived access tokens with refresh rotation; session revocation and "sign out everywhere".
- Invitations only: clients cannot self-register. Invite links are single-use and expire.

### 5.2 Authorization and tenant isolation
- **Row-level security on every table, default deny.** Policies derive from `agency_id` / `client_id` on the user's profile.
- Roles: `admin`, `team`, `client`. Permissions are checked in RLS and again in server code (defense in depth).
- Service-role key is server-only, never shipped to the browser; used only in jobs and narrow server functions.
- Automated tenant-isolation tests: a client user must fail to read or write any other client's rows, files, conversations and metrics. These run in CI and block merges.
- Storage buckets are private; files are served through signed URLs scoped per client.

### 5.3 Secrets and third-party tokens
- Social/ad OAuth tokens are **encrypted at rest** (envelope encryption: per-record data key, master key in a managed KMS or Supabase Vault; never in env files or the repo).
- Least-privilege OAuth scopes per network; request publish scopes only when publishing is enabled.
- Token refresh and revocation handled by the connector layer; a client can disconnect an account at any time, which deletes its tokens.
- Secrets live in Vercel/Supabase secret stores. Secret scanning and pre-commit hooks; `.env*` git-ignored.

### 5.4 Application security
- Input validation on every server boundary (zod schemas); output encoding by default.
- CSRF protection on mutating routes; SameSite, Secure, HttpOnly cookies.
- Security headers: strict CSP, HSTS, `frame-ancestors 'none'`, `X-Content-Type-Options`, Referrer-Policy, Permissions-Policy.
- Rate limiting per user, per client and per IP on auth, agent, upload and sync endpoints.
- **Cloudflare Turnstile** on login and every public form, verified server-side (login is verified by Supabase CAPTCHA so the auth API can't be hit directly). Optional **Cloudflare proxy/WAF** with rate-limit rules in front of production. Setup in `docs/security.md`.
- File uploads: type and size allowlist, content sniffing, image re-encoding for logos; SVG sanitized or disallowed.
- SSRF protection on any URL fetched on a user's behalf (competitor links, scraping): allowlist schemes, block private/internal IP ranges, timeouts and size caps.
- Webhooks from platforms verified by signature; idempotent handlers.

### 5.5 AI agent security
- **Prompt-injection hardening**: scraped competitor content, comments and uploaded text are treated as untrusted data, never as instructions. They are delimited and cannot trigger tool calls on their own.
- The agent only has tools scoped to the current client; tenant context is set server-side, never taken from the model or the client.
- State-changing tools (update brief, publish, delete) require explicit user confirmation or a human approval step.
- Approved-proof-list enforcement: stats not in `proof_items` are blocked by the quality check.
- No client data is shared across clients in prompts or memory. Per-client usage caps and cost alerts stop runaway loops.
- Log tool calls for audit. Do not log full secrets or tokens.

### 5.6 Data protection and privacy
- Encryption in transit (TLS) and at rest (managed by Supabase). Backups with point-in-time recovery; restore tested.
- Data minimization: store only metrics and content needed, not raw private messages.
- Privacy compliance planning: GDPR, Quebec Law 25 and CCPA-style rights. Consent record, data export and deletion per client, data retention policy, subprocessor list (Supabase, Vercel, Anthropic, data providers).
- Client offboarding: disconnect accounts, revoke tokens, export, then delete on request.
- Data residency decision (region) recorded before launch.

### 5.7 Audit, monitoring and incident response
- Append-only `audit_log` (who, what, when, from where) for logins, role changes, connection changes, publishes, exports and deletions. Visible to admins.
- Error and uptime monitoring (Sentry or similar) with PII scrubbing; alerts on auth anomalies and failed sync spikes.
- Documented incident response: token revocation runbook, user notification process.

### 5.8 Supply chain and delivery
- Lockfile, dependency review and automated updates (Dependabot or Renovate); `npm audit` in CI.
- CI gates: lint, typecheck, tests, tenant-isolation tests, secret scan, dependency audit.
- Protected `main`, required reviews, no direct pushes, preview deployments per PR with separate non-production data.
- Separate environments (local, preview, production) with separate Supabase projects and keys.
- Migrations are versioned and reviewed; RLS changes require a test.

### 5.9 Legal documents and compliance pack
Public documents (privacy policy, terms, cookie policy, acceptable use, DPA, subprocessors, data deletion) are served at `/{locale}/legal/{doc}` from `apps/web/content/legal/`. `legal_acceptances` records which version each user accepted; `data_requests` tracks rights requests against a 30-day deadline. Internal procedures (data map, rights requests, incident response, launch checklist) are in `docs/compliance/`. English drafts exist; French and Spanish follow legal review. `legal:check --strict` blocks release while placeholders remain.

### 5.10 Platform compliance
- Follow Meta, TikTok, LinkedIn and YouTube developer policies, including data use limits and deletion callbacks.
- Do not scrape platforms in violation of their terms; use official APIs or compliant data providers.
- Third-party data provider contracts reviewed before client data goes to them.

## 6. Repository structure

```
orbita/
  apps/
    web/                    Next.js app (App Router)
      src/app/[locale]/     routes: (agency) and (portal) groups
      src/components/
      src/lib/              supabase clients, auth, i18n, theming
      src/messages/         en.json, fr.json, es.json
  packages/
    connectors/             one module per network + shared interface
    agent/                  prompts, tools, quality check, content-engine logic
    db/                     generated types, query helpers
    security/               crypto helpers, validators, rate limit, ssrf guard
    ui/                     shared components and design tokens
  supabase/
    migrations/             SQL migrations (schema + RLS)
    tests/                  RLS and tenant-isolation tests
    seed.sql
  jobs/                     queue functions: metrics sync, research, publish
  docs/                     security.md, runbooks, ADRs
  .github/workflows/        CI (lint, test, audit, secret scan)
  PLAN.md
```

A monorepo (pnpm workspaces) keeps connectors, agent and security code independent and testable, so they can move to a separate worker service later without rewrites.

## 7. Phases

1. **Foundation and security baseline** (done, see below): monorepo, Next.js, Supabase, auth with MFA, roles, default-deny RLS, tenant-isolation tests, security headers, CI gates, audit log, i18n, theming tokens.
2. **Clients**: client CRUD, branding (logo, colors), client portal login, invitations.
3. **Brand training**: brief schema, proof items, rules, chat with the agent that fills the brief.
4. **Posts**: calendar views, post detail, script view, teleprompter, statuses, approvals, CSV export.
5. **Agent generation**: plans, captions, scripts, blogs, quality check.
6. **Metrics**: connector interface, Instagram and TikTok adapters, sync jobs, dashboard.
7. **Competitors**: manual links, research jobs, trend insights, idea suggestions.
8. **Publishing**: queue, per-network publish, platform app review.
9. **Campaigns**: Meta Ads connector and campaign view.
10. **Hardening**: usage caps, monitoring and alerting, backup restore test, privacy export/delete flows, pen-test and security review, reports.

## 7.1 Phase 2 status (access and clients)
Built: server-only service client, audit log writes, session guards with MFA (AAL2) for staff, invitations (hashed single-use tokens, Turnstile, consent recorded), Clients section with branding (private logo bucket, re-encoded uploads, contrast-checked colors, admin lock), client portal themed per client at `/{locale}/portal`, Settings with Privacy (requests, export, account deletion, admin queue), re-acceptance of terms on version change, bootstrap script, Upstash-backed rate limiter, email interface (Resend). Setup: `docs/setup.md`.
Not yet verified: the authenticated flows end to end against a real Supabase project (only database policies, security helpers, build and unauthenticated access rules are tested). Retention/purge jobs and French/Spanish legal text remain.

## 7.2 Phase 3 status (brand-training agent)
Built: onboarding (website and social links first, audit, adaptive interview) and everyday partner chat in one place; weekly plans the user edits and accepts into draft posts; every learned item is a suggestion a person accepts, edits or rejects; accept/edit/reject recorded as learning signal; periodic "what's worth remembering" pass on a cheap model; completeness meter; per-client daily token cap; prompt-injection defenses (untrusted page content, registered-sites-only fetching, links only from what the person wrote, no query strings, images blocked); SSRF-safe fetcher with robots.txt and a connect-time DNS guard.
Not verified here: live model behavior and the signed-in flows (need ANTHROPIC_API_KEY and a Supabase project). Social networks are not read directly (no scraping): the agent asks for numbers until the connectors phase.

## 7.3 Agent as strategist (content formats, weekly strategy, research)
Built: the agent writes **reel scripts** (3 hook options, scene table with timing/visual/voiceover/on-screen text, one CTA), **carousels** (slides) and **static posts** (headline, visual brief, caption) as structured draft posts the user edits and accepts; **weekly plans** with an objective, a posting day and time and a reason per post, tied to evidence; a **monthly/quarterly content strategy** (objectives, pillars with share, series, cadence per network, topic bank) that becomes the active strategy guiding later plans; **web research** (Anthropic web search) saved as research notes, shown to the model as untrusted and visible/deletable by users; continuity from the last accepted plan. Posting times are labelled assumptions until account analytics are connected (connectors phase).
Not yet: scheduled background research (needs the job queue; today research runs on demand and when the agent finds notes older than 7 days), account analytics (connectors), a posts calendar with script/teleprompter view (Posts phase; the data is already stored on `posts.content`).
Client-owned Claude keys (BYOK): designed in `docs/byok.md`; the single seam `resolveModelAccess()` is in place.

## 8. Open items
- Style reference and Orbita visual identity.
- First test client.
- Platform app review for Meta and TikTok (start early, it takes time).
- Competitor data provider choice.
- Fill legal placeholders, lawyer review, then French and Spanish translations (see `docs/compliance/launch-checklist.md`).
- Data residency region.
- BYOK decisions (see `docs/byok.md`): who sets the key, default mode, plan policy.
- Master key management choice (Supabase Vault vs cloud KMS).
