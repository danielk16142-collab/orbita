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

## 5. Phases

1. **Foundation**: repo, Next.js, Supabase, auth, roles, RLS, i18n, base layout and theming tokens.
2. **Clients**: client CRUD, branding (logo, colors), client portal login, invitations.
3. **Brand training**: brief schema, proof items, rules, chat with the agent that fills the brief.
4. **Posts**: calendar views, post detail, script view, teleprompter, statuses, approvals, CSV export.
5. **Agent generation**: plans, captions, scripts, blogs, quality check.
6. **Metrics**: connector interface, Instagram and TikTok adapters, sync jobs, dashboard.
7. **Competitors**: manual links, research jobs, trend insights, idea suggestions.
8. **Publishing**: queue, per-network publish, platform app review.
9. **Campaigns**: Meta Ads connector and campaign view.
10. **Hardening**: usage caps, audit log, monitoring, reports.

## 6. Open items
- Style reference and Orbita visual identity.
- First test client.
- Platform app review for Meta and TikTok (start early, it takes time).
- Competitor data provider choice.
