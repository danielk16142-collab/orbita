# Connecting Instagram and TikTok

Orbita connects each client's accounts through the platforms' **official APIs, read-only**. It never posts, messages or changes anything on a connected account (publishing is a later phase, with its own app review). If it is not configured, the Connect button says so.

## What is built
- OAuth connect flow with a signed, expiring state bound to the user, the client and the network, plus a cookie nonce (`/api/connect/[network]/start|callback`). Tokens are envelope-encrypted per account (`ORBITA_MASTER_KEY`) and never reach the browser.
- A sync engine (after connecting, on **Refresh**, and every 6 hours by cron): daily snapshots of followers (Instagram's API has no daily follower series, so the history builds one day at a time), reach, and the last 30 posts with their numbers.
- Dashboard, per-client and in the portal; the strategist agent reads the same numbers (`get_account_analytics`, and an analytics block in its prompt) and recommends posting windows from real post history.
- Disconnect revokes (where the platform supports it) and deletes the stored tokens, metrics and posts. Meta's data-deletion and deauthorize callbacks are implemented.

## Create the developer apps

### Instagram (Meta)
1. developers.facebook.com -> create an app (type Business) -> add **Instagram** -> **API setup with Instagram login**.
2. Copy the **Instagram app ID and secret** into `META_APP_ID` / `META_APP_SECRET`.
3. **Valid OAuth redirect URIs**: `https://YOUR-DOMAIN/api/connect/instagram/callback`.
4. **Deauthorize callback URL** and **Data deletion request URL**: `https://YOUR-DOMAIN/api/connect/instagram/deauthorize` and `.../data-deletion`.
5. Permissions requested: `instagram_business_basic` and `instagram_business_manage_insights`.
6. While the app is in development mode only people with a role on the app can connect (use this for testing). To connect **clients' accounts** you need **Advanced Access** through **App Review** and Business Verification. Prepare: a public privacy policy URL (`/en/legal/privacy-policy`), data-deletion instructions URL (`/en/legal/data-deletion`), and a screencast of the flow showing where each permission is used.
7. Accounts must be Instagram **Business or Creator** accounts.

### TikTok
1. developers.tiktok.com -> create an app -> add **Login Kit** and the **Display API**.
2. Copy the **client key and secret** into `TIKTOK_CLIENT_KEY` / `TIKTOK_CLIENT_SECRET`.
3. **Redirect URI**: `https://YOUR-DOMAIN/api/connect/tiktok/callback`.
4. Scopes: `user.info.basic`, `user.info.stats`, `video.list`. These need app review for public use; in sandbox only listed test users can connect.

## Environment
`NEXT_PUBLIC_APP_URL` (https), `ORBITA_MASTER_KEY`, `META_APP_ID`, `META_APP_SECRET`, `TIKTOK_CLIENT_KEY`, `TIKTOK_CLIENT_SECRET`, `CRON_SECRET` (16+ random characters; Vercel Cron sends it as a bearer token), `SUPABASE_SERVICE_ROLE_KEY`. Optional: `INSTAGRAM_GRAPH_VERSION` (default `v25.0`).
`vercel.json` schedules `/api/cron/sync` every 6 hours (Vercel's Hobby plan only allows daily crons; change the schedule if needed).

## Try the screens without developer apps
In development only, `CONNECTORS_FAKE=1` makes both networks "connectable" with generated data, and `/{locale}/dev/preview` shows the dashboard from generated data (run with `next dev`). Both are ignored in production.

## What to verify with real accounts (not testable without developer apps)
- Connect an Instagram Business account and a TikTok account; confirm the first sync fills followers, posts and (Instagram) reach.
- Per-post insight metrics differ by media type; the adapter falls back to the like and comment counts when a type rejects a metric. Check Reels, carousels and photos.
- Day boundaries for Instagram insights follow the platform's own windows, so a day's reach can differ slightly from the app's figure.
- Token refresh: Instagram tokens last 60 days (refreshed when under 10 days remain); TikTok access tokens last 24 hours (refreshed when under 2 hours remain).
- Disconnect, and the Meta data-deletion callback (use Meta's callback tester).

## Known limits
- Instagram's API has no historical follower counts; TikTok's Display API has no daily series. Growth is measured from the day the account is connected.
- Times of day for best posting windows are UTC; the client's timezone is not stored yet.
- LinkedIn and YouTube are not connected yet (same interface, later phase).
