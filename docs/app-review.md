# App review kit: Meta (Instagram) and TikTok

What to submit so clients can connect their accounts. Connection is **read-only**: Orbita reads profile and performance data to show dashboards and to plan content. It does not post, comment or message (publishing is a later phase with its own review). Setup of the developer apps is in `docs/connectors.md`.

Replace `YOUR-DOMAIN` with the production domain of the app before submitting.

## Before you submit (both platforms)

- [ ] The app is deployed on its production domain over https, with `META_*` / `TIKTOK_*`, `ORBITA_MASTER_KEY`, `NEXT_PUBLIC_APP_URL` and `CRON_SECRET` set in Vercel.
- [ ] Legal pages are public and complete. These placeholders are still open in `apps/web/content/legal/en/`: `COMPANY_NAME`, `COMPANY_ADDRESS`, `PRIVACY_EMAIL`, `PRIVACY_OFFICER`, `DATA_REGION`, `EFFECTIVE_DATE` (and the items marked `VERIFY`). Reviewers open these pages; placeholders get apps rejected.
  - Privacy policy: `https://YOUR-DOMAIN/en/legal/privacy-policy`
  - Terms: `https://YOUR-DOMAIN/en/legal/terms-of-service`
  - Data deletion instructions: `https://YOUR-DOMAIN/en/legal/data-deletion`
- [ ] An app icon (1024×1024) and the business's legal name and address, matching the business verification documents.
- [ ] A reviewer login: a staff account on Orbita (with two-step verification you can share codes for, or a dedicated test account) and a test client already created, with its brand profile filled in.
- [ ] A test social account you control: an Instagram **Business or Creator** account, and a TikTok account, each with a few posts.

## Meta (Instagram API with Instagram login)

### Settings to check
- Product: **Instagram** → API setup with Instagram login.
- Valid OAuth redirect URI: `https://YOUR-DOMAIN/api/connect/instagram/callback`
- Deauthorize callback URL: `https://YOUR-DOMAIN/api/connect/instagram/deauthorize`
- Data deletion request URL: `https://YOUR-DOMAIN/api/connect/instagram/data-deletion`
- Business verification: completed in Meta Business Settings (needed for Advanced Access).

### Permissions and what to write for each

**instagram_business_basic**
> Orbita is a marketing management tool used by a social media agency and its clients. When a business connects its Instagram professional account, we use instagram_business_basic to read the account's username, profile picture, follower count and its list of posts (caption, type, date, link). We show this on the business's dashboard in Orbita (Client → Connections and the dashboard), and our content assistant uses it to plan posts that fit what the account already publishes. We only read data; we never post, comment or send messages. The person can disconnect at any time in Orbita, which deletes the token and all synced data.

**instagram_business_manage_insights**
> We use instagram_business_manage_insights to read the account's own performance numbers: reach and the likes, comments, saves and shares of its recent posts. Orbita shows them on the business's dashboard (followers over time, reach, engagement by format, best posts) and in its Insights page (best format and best time to post). Our content assistant reads the same numbers to recommend when and what to post. The data is only visible to the business and the agency managing it, is stored encrypted, and is deleted when the account is disconnected or when Meta sends a deletion request.

### Screencast script (about 2 minutes, with captions or voice-over)
1. Open `https://YOUR-DOMAIN/en/login`, sign in as the reviewer account (show the two-step code screen).
2. Go to **Clients**, open the test client, then the **Connections** tab. Point at the read-only note.
3. Click **Connect** on Instagram. Show Instagram's login and consent screen, including both permissions, and accept.
4. Back in Orbita, show the connected account (handle, status, last sync).
5. **instagram_business_basic in use:** open the client's dashboard (Home → the client) and show the account name and follower count, then the list of best posts with their captions.
6. **instagram_business_manage_insights in use:** on the same dashboard, show reach and engagement; then open the **Insights** tab and show best network, best format and best time to post.
7. Open **Agent → Chat** and ask "How are our posts doing?" to show the assistant using the numbers (optional but helps).
8. Back on **Connections**, click **Disconnect** and show the account and its numbers are gone.
9. Show the data deletion page URL in the browser.

### Notes for the reviewer field
> Test credentials: [reviewer email and password]. Two-step verification code: [how to get it]. Test client: [name]. The Instagram test account is [handle] (a Business account). Orbita only reads data. All data from an account is deleted when it is disconnected in Orbita, when the app is removed in Instagram settings (deauthorize callback), or on a data deletion request (callback at /api/connect/instagram/data-deletion).

## TikTok (Login Kit and Display API)

### Settings to check
- Products: **Login Kit**, **Display API**.
- Redirect URI: `https://YOUR-DOMAIN/api/connect/tiktok/callback`
- Platform: Web. Website URL: `https://YOUR-DOMAIN`. Terms and privacy URLs as above.

### Scopes and what to write for each

**user.info.basic**
> Used to identify the connected TikTok account in Orbita (display name and avatar) so the business and its agency can see which account is connected.

**user.info.stats**
> Used to read the account's follower, following, likes and video counts, which Orbita shows on the business's dashboard and uses to measure growth over time.

**video.list**
> Used to read the account's recent public videos and their view, like, comment and share counts. Orbita shows the best performing videos and engagement by format, and its content assistant uses them to recommend what to post next. We do not upload or edit videos.

### Demo video script (TikTok asks for one per scope set)
1. Sign in to Orbita, open the test client, **Connections** tab.
2. Click **Connect** on TikTok, show TikTok's authorization screen listing the three scopes, accept.
3. Show the connected account (user.info.basic), then the dashboard with follower and video counts (user.info.stats) and the best videos with their numbers (video.list).
4. Open **Insights** to show engagement by format.
5. Disconnect and show the data is removed.

## After approval
- Meta: switch the app to **Live** mode; clients can now connect Business or Creator accounts.
- TikTok: the app moves out of sandbox; any user can authorize it.
- Tick the platform items in `docs/compliance/launch-checklist.md`.
- Publishing (posting from Orbita) needs separate permissions later: `instagram_business_content_publish` on Meta and the Content Posting API on TikTok, each with its own review and demo.
