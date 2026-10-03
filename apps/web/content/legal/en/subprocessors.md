# Subprocessors

**Last updated:** [[EFFECTIVE_DATE]] · **Version:** 0.1 (draft)

We use these providers to run Orbita. We give agencies and clients notice of changes (see the Data Processing Agreement).

| Provider | Purpose | Data | Location |
|---|---|---|---|
| Supabase | Database, authentication, file storage | Account, business, content, metrics data; encrypted tokens | [[DATA_REGION]] |
| Vercel | Application hosting and delivery | Request data, IP addresses, application traffic | [[VERCEL_REGION]] |
| Cloudflare | Bot verification (Turnstile) and, if enabled, DNS, proxy and web application firewall | IP address, device and browser signals, request metadata | Global network |
| Anthropic | AI agent (language model processing) | Prompts containing brand information, content and messages | United States [[VERIFY]] |
| [[COMPETITOR_DATA_PROVIDER]] (planned) | Public competitor account research | Public account links and public posts data | [[VERIFY]] |
| [[EMAIL_PROVIDER]] (planned) | Invitation and notification emails | Name, email address | [[VERIFY]] |
| [[ERROR_MONITORING_PROVIDER]] (planned) | Error and uptime monitoring | Technical error data, scrubbed of personal data | [[VERIFY]] |

**Connected platforms** (Meta, TikTok, LinkedIn, Google/YouTube, others) are not our subprocessors: they act under your own relationship with them when you connect an account.
