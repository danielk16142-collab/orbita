# Bring your own Claude key (BYOK): design

**Status: designed, not built.** The code is ready for it: every AI request already goes through one function, `resolveModelAccess()` in `apps/web/src/lib/agent/model.ts`. Today it always returns the agency's key (`billing: "agency"`). Client-owned keys plug in there.

## Why
When more agencies and clients use Orbita, AI usage becomes a real cost (the chat uses a large model, web research is billed per search, and the agent can run several steps per reply). With BYOK a client connects their own Anthropic account, so Anthropic bills **them** directly for their usage. The agency (or Orbita) carries no AI cost for that client, and the client keeps control and visibility over spend.

## What a client does
1. Create an Anthropic Console account (or use their existing one).
2. Create a **workspace** for Orbita and set a **monthly spend limit** on it (Anthropic enforces it, which protects them even if our caps fail).
3. Create an API key in that workspace.
4. In Orbita: **Settings -> AI**, paste the key, choose a monthly token cap, save.
5. Orbita validates the key, shows only the last 4 characters, and from then on that client's chat, research and learning run on their account.
They can replace or remove the key at any time; removing it deletes the stored ciphertext immediately.

Web search (used for research) must be enabled for the key's Anthropic organization; the validation step checks this and tells the user how to enable it if it is off.

## Modes per client
| Mode | Who pays | Behavior |
|---|---|---|
| `agency` (default) | The agency | Agency key, per-client daily token cap |
| `own_key` | The client | Client key only. If it is missing, invalid or out of budget the agent says so; **it never silently falls back to the agency key** |
| `own_key_with_fallback` (optional, agency admin only) | Client first, agency as backup | For agencies that want to absorb outages, with a cap |

Agency-level policy: an admin can require `own_key` for all new clients (or per plan), so cost never lands on the agency.

## Data model (migration `0009`, sketch)
```
client_ai_settings(
  client_id uuid primary key references clients on delete cascade,
  mode text check (mode in ('agency','own_key','own_key_with_fallback')) default 'agency',
  encrypted_key text,            -- envelope-encrypted; NEVER selectable by API roles
  key_hint text,                 -- last 4 characters, for display
  status text check (status in ('active','invalid','revoked')) default 'active',
  validated_at timestamptz,
  allowed_models text[],         -- discovered at validation (their org may lack some models)
  daily_token_cap int,           -- the client's own cap
  updated_by uuid, updated_at timestamptz
)
```
- RLS: select of non-secret columns for `can_access_client`; **no select grant on `encrypted_key`** (same column-privilege pattern as `social_accounts.encrypted_tokens`); writes only through server actions using the service role.
- Isolation tests: another client or agency can never read mode/hint/status; nobody can read `encrypted_key` through the API.

## Key handling (security requirements)
- **Write-only**: the key is never sent back to the browser, never logged, never put in prompts, errors or the audit log (only "key set/rotated/removed", last 4, who, when).
- **Encryption**: reuse `encryptSecret()` (`packages/security/src/crypto.ts`) with context `client:<id>:anthropic` so a blob cannot be moved to another client; master key in a KMS/Vault in production.
- **Decrypt only in the resolver**, server-side, per request, held in memory only. No caching across requests.
- **Who can set it**: the client's users (portal) and agency admins, both with MFA verified in this session and rate-limited (validation attempts: 5/hour). A pasted key is validated with a cheap call (list models) **before** it is stored; invalid keys are rejected and never stored.
- **Runtime failures**: 401/403 from Anthropic with a client key -> mark `status = invalid`, tell the user clearly, notify the agency; 429 / overloaded -> normal retry behavior; spend limit reached -> tell the user their own limit was hit. No fallback unless `own_key_with_fallback`.
- **Leak response**: if a key is exposed, the client revokes it in the Anthropic Console (instructions in the UI); Orbita marks it invalid on the next 401.
- Audit log entries for set, rotate, remove, invalid, mode change.

## Runtime (the seam)
`resolveModelAccess(actor)` becomes:
1. Load the client's `client_ai_settings`.
2. `agency` -> agency key as today.
3. `own_key*` -> decrypt (service role), build `new Anthropic({ apiKey })`, choose models from `allowed_models` (fallback chain, e.g. Opus 5.5 -> Sonnet 5.5), return `billing: "client"`.
4. Return `null` (with a reason) when nothing usable exists; the routes already turn that into a clear "AI is not set up" message.
Features that differ by organization (web search, refusal fallbacks, Haiku for the learning pass) are checked at validation and degrade gracefully (research off, learning pass on the chat model).

## Usage and cost visibility
- Keep recording tokens per client in `usage_events`, adding the billing mode, so both the client and the agency see consumption.
- Show an **estimated** cost from a price table (clearly labelled estimate; Anthropic's invoice is the truth).
- The client's `daily_token_cap` still applies in addition to Anthropic's own workspace limit.

## Legal and privacy changes needed
- Privacy Policy and DPA: with BYOK, the client's content is processed under **the client's own Anthropic account** (their retention and data-use settings apply), with Orbita transmitting it on their instruction. Update the Subprocessors page accordingly.
- Terms of Service: the client is responsible for their key, its spend and Anthropic's usage policy, and confirms they are authorized to use it.
- Lawyer review before launching this mode.

## Alternatives considered
- **Agency resells usage with a markup** (metered billing, e.g. Stripe): simpler for clients, but Orbita carries cost risk and needs billing infrastructure. Can coexist with BYOK as another mode.
- **Anthropic OAuth for API access**: not available for API keys, so pasting a key is the way.
- **Client's own cloud account** (Amazon Bedrock or Google Vertex via the SDK's provider clients): suitable for enterprise clients with cloud commitments; the resolver can return a provider client the same way. Later option.

## Build plan (about one phase)
1. Migration `0009` + isolation tests (including "API roles cannot read `encrypted_key`").
2. Server actions: validate + store, rotate, remove, set cap, set mode (agency admin); all with MFA, rate limits and audit.
3. Settings -> AI screen (client portal and agency per client), with the Anthropic setup steps in en/fr/es.
4. `resolveModelAccess` implementation + tests with a fake Anthropic client (decrypts only server-side, never falls back silently, marks invalid on 401, never logs the key).
5. Usage/cost display; legal text updates; launch checklist items.

## Decisions needed from you
- Who may paste the key: client users, agency admins, or both (recommended: both, with MFA)?
- Default mode for new clients: `agency` (you pay) or `own_key` (they pay)?
- Do you want an agency-level switch that requires `own_key` for clients on lower plans?
