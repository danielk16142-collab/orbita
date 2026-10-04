# Data map (records of processing)

| Data | Table / location | Purpose | Basis | Access | Retention | Notes |
|---|---|---|---|---|---|---|
| Name, email, role, locale | `profiles`, Supabase Auth | Accounts, access control | Contract | Admin/team of agency; user | Active + 30 days | Password stored hashed by Supabase Auth |
| MFA factors | Supabase Auth | Security | Legitimate interest | User | Active | |
| Business/brand data | `clients`, `brand_briefs`, `proof_items`, `client_rules` | Provide service, train the agent | Contract | Staff of agency; that client's users | Active + 30 days after offboarding | |
| Logos | Storage bucket (private) | Branding | Contract | As above (signed URLs) | As above | Re-encoded on upload |
| Connected-account stats and posts | `metrics_daily`, `account_posts`, `sync_runs` | Dashboard and agent analytics | Contract + the user's authorization | Staff; that client's users | While connected; deleted on disconnect, offboarding or platform deletion request | Followers, reach, per-post counts and captions of the client's OWN public posts. No private messages, no audience personal data |
| Social/ad tokens | `social_accounts.encrypted_tokens` | Sync and publish | Contract + user authorization | Server only (service role); never exposed to API roles | Until disconnect/revocation | Envelope-encrypted, AAD-bound to record |
| Metrics | `metrics_daily` | Dashboards | Contract | Staff; that client | Active + 30 days | Mostly aggregated; no private messages |
| Posts, comments | `posts`, `post_comments` | Planning and approvals | Contract | Staff; that client | Active + 30 days | May contain names in content |
| Agent conversations | `conversations`, `messages` | Agent | Contract | Staff; that client's users | 12 months | Sent to the AI provider to generate answers. Plain text only is stored (no model reasoning) |
| Agent learning data | `brand_memories`, `proposals`, `generation_feedback`, `audits`, `client_sources` | Train the agent per brand; audit of the client's public presence | Contract | Staff; that client's users | Active + 30 days after offboarding | Everything the agent learns is a suggestion a person accepts. Feedback records accept/edit/reject of suggestions |
| Content strategy and research | `strategies`, `research_notes` | Plan content; trends and competitor/audience findings from the public web | Contract | Staff; that client's users | Active + 30 days after offboarding | Research notes are public-web findings (no personal data intended); shown to the model as untrusted; users can delete them |
| Website content read by the agent | Not stored raw; summarized in `audits` | Audit of the client's own site | Contract | Staff; that client | With the audit | Only sites registered for that client; robots.txt respected; private/internal addresses blocked |
| Competitor links | `competitors` | Research | Contract | Staff; that client | Active | Public information only |
| Usage events | `usage_events` | Limits, billing | Legitimate interest | Staff; that client | 12 months | |
| Audit log | `audit_log` | Security, accountability | Legitimate interest / legal | Agency admins | 12 months | Append-only |
| Consent records | `legal_acceptances` | Prove acceptance of document versions | Legal obligation | Own user; agency admins | 3 years | Append-only |
| Rights requests | `data_requests` | Handle and prove handling of requests | Legal obligation | Requester; agency admins | 3 years after closure | 30-day `due_at` |
| IP, device data | Vercel/Cloudflare logs | Delivery, security | Legitimate interest | Providers; ops | Per provider (target ≤ 30 days) | Confirm provider log retention |

## Data not collected
Private messages, passwords for social networks, payment card data (use a payment processor if billing is added), health or other sensitive categories, children's data.

## Cross-border
Hosting region [[DATA_REGION]]; AI provider and Cloudflare process outside Quebec/EU. Complete a **transfer assessment** (Law 25 s.17) and keep SCCs on file (GDPR).
