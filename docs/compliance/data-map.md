# Data map (records of processing)

| Data | Table / location | Purpose | Basis | Access | Retention | Notes |
|---|---|---|---|---|---|---|
| Name, email, role, locale | `profiles`, Supabase Auth | Accounts, access control | Contract | Admin/team of agency; user | Active + 30 days | Password stored hashed by Supabase Auth |
| MFA factors | Supabase Auth | Security | Legitimate interest | User | Active | |
| Business/brand data | `clients`, `brand_briefs`, `proof_items`, `client_rules` | Provide service, train the agent | Contract | Staff of agency; that client's users | Active + 30 days after offboarding | |
| Logos | Storage bucket (private) | Branding | Contract | As above (signed URLs) | As above | Re-encoded on upload |
| Social/ad tokens | `social_accounts.encrypted_tokens` | Sync and publish | Contract + user authorization | Server only (service role); never exposed to API roles | Until disconnect/revocation | Envelope-encrypted, AAD-bound to record |
| Metrics | `metrics_daily` | Dashboards | Contract | Staff; that client | Active + 30 days | Mostly aggregated; no private messages |
| Posts, comments | `posts`, `post_comments` | Planning and approvals | Contract | Staff; that client | Active + 30 days | May contain names in content |
| Agent conversations | `conversations`, `messages` | Agent | Contract | Staff; that client | 12 months | Sent to the AI provider to generate answers |
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
