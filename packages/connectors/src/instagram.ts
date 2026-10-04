import { day, form, readJson, unix } from "./http";
import { ConnectorApiError, type AccountInfo, type Connector, type ConnectorConfig, type DailyMetric, type PostRecord, type TokenSet } from "./types";

/**
 * Instagram API with Instagram Login (Business/Creator accounts). Read-only:
 * instagram_business_basic (profile, media) + instagram_business_manage_insights (insights).
 * Endpoints verified against Meta's current documentation. Reading accounts you do not own requires Advanced Access (app review).
 */
const SCOPES = ["instagram_business_basic", "instagram_business_manage_insights"] as const;
const DAILY_TOTALS = ["views", "accounts_engaged", "total_interactions", "likes", "comments", "shares", "saves"];
const POST_METRICS = ["reach", "views", "likes", "comments", "shares", "saved", "total_interactions"];
const RENAME: Record<string, string> = { saved: "saves", total_interactions: "interactions" };

export function instagramConnector(cfg: ConnectorConfig): Connector {
  const f = cfg.fetchImpl ?? fetch;
  const v = cfg.graphVersion ?? "v25.0";
  const graph = `https://graph.instagram.com/${v}`;
  const get = async (url: string, what: string) => readJson(await f(url, { signal: AbortSignal.timeout(15_000) }), what);

  return {
    network: "instagram", scopes: SCOPES,
    authUrl: ({ state, redirectUri }) => `https://www.instagram.com/oauth/authorize?${new URLSearchParams({ client_id: cfg.clientId, redirect_uri: redirectUri, response_type: "code", scope: SCOPES.join(","), state })}`,

    async exchangeCode({ code, redirectUri }) {
      // Instagram appends "#_" to the code in the redirect.
      const short = await readJson(await f("https://api.instagram.com/oauth/access_token", {
        method: "POST", body: form({ client_id: cfg.clientId, client_secret: cfg.clientSecret, grant_type: "authorization_code", redirect_uri: redirectUri, code: code.replace(/#_$/, "") }), signal: AbortSignal.timeout(15_000),
      }), "instagram code exchange");
      const long = await get(`https://graph.instagram.com/access_token?${new URLSearchParams({ grant_type: "ig_exchange_token", client_secret: cfg.clientSecret, access_token: short.access_token })}`, "instagram long-lived token");
      return { accessToken: long.access_token, expiresAt: new Date(Date.now() + Number(long.expires_in) * 1000).toISOString(), scopes: [...SCOPES] };
    },

    // Long-lived tokens last 60 days and can be refreshed once they are at least 24h old.
    needsRefresh: (t, now = new Date()) => !!t.expiresAt && Date.parse(t.expiresAt) - now.getTime() < 10 * 86_400_000,
    async refresh(t) {
      const r = await get(`https://graph.instagram.com/refresh_access_token?${new URLSearchParams({ grant_type: "ig_refresh_token", access_token: t.accessToken })}`, "instagram token refresh");
      return { ...t, accessToken: r.access_token, expiresAt: new Date(Date.now() + Number(r.expires_in) * 1000).toISOString() };
    },

    async fetchAccount(t): Promise<AccountInfo> {
      const r = await get(`${graph}/me?${new URLSearchParams({ fields: "user_id,username,name,followers_count,follows_count,media_count", access_token: t.accessToken })}`, "instagram profile");
      return { externalId: String(r.user_id ?? r.id), handle: r.username ?? null, displayName: r.name ?? r.username ?? null, followers: r.followers_count ?? null, following: r.follows_count ?? null, mediaCount: r.media_count ?? null };
    },

    async fetchDailyMetrics(t, { since, until }): Promise<DailyMetric[]> {
      const out: DailyMetric[] = [];
      // Reach is the one metric with a native daily series.
      try {
        const r = await get(`${graph}/me/insights?${new URLSearchParams({ metric: "reach", period: "day", metric_type: "time_series", since: String(unix(since)), until: String(unix(until)), access_token: t.accessToken })}`, "instagram reach");
        for (const val of r.data?.[0]?.values ?? []) out.push({ day: String(val.end_time).slice(0, 10), metric: "reach", value: Number(val.value) });
      } catch (e) { if (!(e instanceof ConnectorApiError)) throw e; }
      // Everything else is a total per requested window, so ask one day at a time.
      for (let d = new Date(since); d < until; d = new Date(d.getTime() + 86_400_000)) {
        const next = new Date(d.getTime() + 86_400_000);
        for (const metrics of [DAILY_TOTALS, ["views", "total_interactions"]]) {
          try {
            const r = await get(`${graph}/me/insights?${new URLSearchParams({ metric: metrics.join(","), period: "day", metric_type: "total_value", since: String(unix(d)), until: String(unix(next)), access_token: t.accessToken })}`, "instagram insights");
            for (const m of r.data ?? []) out.push({ day: day(d), metric: RENAME[m.name] ?? m.name, value: Number(m.total_value?.value ?? 0) });
            break; // got this day
          } catch (e) { if (!(e instanceof ConnectorApiError)) throw e; /* try the smaller metric set */ }
        }
      }
      return out;
    },

    async fetchPosts(t, { limit }): Promise<PostRecord[]> {
      const list = await get(`${graph}/me/media?${new URLSearchParams({ fields: "id,caption,media_type,media_product_type,timestamp,permalink,like_count,comments_count", limit: String(Math.min(limit, 50)), access_token: t.accessToken })}`, "instagram media");
      const posts: PostRecord[] = [];
      for (const m of (list.data ?? []).slice(0, limit)) {
        const metrics: Record<string, number> = {};
        if (typeof m.like_count === "number") metrics.likes = m.like_count;
        if (typeof m.comments_count === "number") metrics.comments = m.comments_count;
        try {
          const ins = await get(`${graph}/${m.id}/insights?${new URLSearchParams({ metric: POST_METRICS.join(","), access_token: t.accessToken })}`, "instagram media insights");
          for (const d of ins.data ?? []) metrics[RENAME[d.name] ?? d.name] = Number(d.values?.[0]?.value ?? 0);
        } catch (e) { if (!(e instanceof ConnectorApiError)) throw e; /* some media types reject some metrics: keep the counts from the media node */ }
        posts.push({ externalId: String(m.id), publishedAt: m.timestamp ? new Date(m.timestamp).toISOString() : null, permalink: m.permalink ?? null, caption: m.caption ?? null, mediaType: m.media_product_type === "REELS" ? "reel" : String(m.media_type ?? "").toLowerCase() || null, metrics });
      }
      return posts;
    },

    // Instagram has no token-revocation endpoint: we delete our copy, and the user can remove the app in Instagram's settings.
    async revoke() {},
  };
}
