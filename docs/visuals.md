# Visual creation (Moda)

Creates post images from carousel and static post drafts with [Moda](https://moda.app). It is an optional module: **off by default, switched on per client by an agency admin**.

## How it works
1. The agent (or a person) writes a carousel or static post. The structured content (slide titles and text, or headline + visual brief + call to action) is the design brief.
2. On the post page, staff press **Create visual**. The server checks: signed in with MFA, the module is on for the client, `MODA_API_KEY` is set, the post is a carousel or static post with valid content, no other generation is running for the post, and the client's monthly cap is not reached.
3. `packages/visuals` builds a prompt (brand name, colors, fonts, language, the content quoted as content to lay out, never as instructions) and starts a Moda design task (`POST /v1/tasks`, pinned `Moda-Version`, portrait 4:5 / 1080x1350, PNG export at 2x).
4. The page polls `/api/visuals/<job>` every few seconds. Staff polls ask Moda; when the task succeeds the server downloads the signed export (https only, public addresses only, size-capped), unzips multi-page exports safely, stores each page in the private `post-media` bucket and records `post_media`. Clients see the images (read-only) in their portal.
5. **Create again** makes a new job (counts towards the cap); the newest set is shown.

## Setup
1. In Moda: Settings -> Developer -> REST API -> create a key. (A paid plan may be needed for API access and for more than 3 simultaneous tasks; check Moda's pricing page.)
2. In Vercel: add `MODA_API_KEY` (Sensitive) and redeploy. It is only read on the server and never sent to the browser or logged.
3. Apply migration `0019_visuals.sql` to Supabase.
4. In the app: Clients -> the client -> **Connections** -> **Visual creation** -> switch on, set the monthly cap, optionally paste a Moda brand kit id (`bk_...`).

## Safety and cost
- Per-client switch (admins only), per-client monthly cap, one active job per post, rate limits on start and poll.
- Provider errors are logged with type, status and request id only (no prompt, no key); the browser only receives stable codes (`module_off`, `cap_reached`, `not_configured`, `insufficient_credits`, `rate_limited`, `busy`, `unsupported`, `no_content`, `failed`).
- The generated files are private; access follows `can_access_client`. Only the server writes jobs and media. Images are removed when the post or the client is deleted.
- Moda is a subprocessor for the clients that use it (see `apps/web/content/legal/en/subprocessors.md` and `docs/compliance/data-map.md`). Verify its terms before enabling it for clients other than the agency's own businesses.

## Development
`VISUALS_FAKE=1` (outside production) uses a deterministic fake provider; `/en/dev/preview-visuals` shows the screens in each state.
