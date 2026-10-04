import { form, readJson } from "./http";
import { ConnectorAuthError, type AccountInfo, type Connector, type ConnectorConfig, type PostRecord, type TokenSet } from "./types";

/**
 * TikTok Login Kit v2 (web) + Display API. Read-only: user.info.basic, user.info.stats, video.list.
 * Web login does not use PKCE. Access tokens last 24h, refresh tokens 365 days. Endpoints verified against TikTok's docs.
 */
const SCOPES = ["user.info.basic", "user.info.stats", "video.list"] as const;
const TOKEN_URL = "https://open.tiktokapis.com/v2/oauth/token/";
const API = "https://open.tiktokapis.com/v2";

export function tiktokConnector(cfg: ConnectorConfig): Connector {
  const f = cfg.fetchImpl ?? fetch;
  const tokens = async (body: Record<string, string>, what: string): Promise<TokenSet> => {
    const r = await readJson(await f(TOKEN_URL, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", "Cache-Control": "no-cache" }, body: form({ client_key: cfg.clientId, client_secret: cfg.clientSecret, ...body }), signal: AbortSignal.timeout(15_000) }), what);
    if (!r.access_token) throw new ConnectorAuthError(`${what}: no token returned`);
    return { accessToken: r.access_token, refreshToken: r.refresh_token, expiresAt: new Date(Date.now() + Number(r.expires_in) * 1000).toISOString(), scopes: String(r.scope ?? "").split(",").filter(Boolean) };
  };
  const auth = (t: TokenSet) => ({ Authorization: `Bearer ${t.accessToken}` });

  return {
    network: "tiktok", scopes: SCOPES,
    authUrl: ({ state, redirectUri }) => `https://www.tiktok.com/v2/auth/authorize/?${new URLSearchParams({ client_key: cfg.clientId, scope: SCOPES.join(","), response_type: "code", redirect_uri: redirectUri, state })}`,
    exchangeCode: ({ code, redirectUri }) => tokens({ code, grant_type: "authorization_code", redirect_uri: redirectUri }, "tiktok code exchange"),
    needsRefresh: (t, now = new Date()) => !!t.expiresAt && Date.parse(t.expiresAt) - now.getTime() < 2 * 3_600_000,
    async refresh(t) {
      if (!t.refreshToken) throw new ConnectorAuthError("tiktok: no refresh token");
      const n = await tokens({ grant_type: "refresh_token", refresh_token: t.refreshToken }, "tiktok token refresh");
      return { ...n, refreshToken: n.refreshToken ?? t.refreshToken }; // refresh tokens can rotate: keep the newest
    },

    async fetchAccount(t): Promise<AccountInfo> {
      const r = await readJson(await f(`${API}/user/info/?fields=open_id,display_name,follower_count,following_count,likes_count,video_count`, { headers: auth(t), signal: AbortSignal.timeout(15_000) }), "tiktok profile");
      const u = r.data?.user ?? {};
      return { externalId: String(u.open_id), handle: u.display_name ?? null, displayName: u.display_name ?? null, followers: u.follower_count ?? null, following: u.following_count ?? null, mediaCount: u.video_count ?? null, totalLikes: u.likes_count ?? null };
    },

    // TikTok's Display API has no daily series: the sync engine snapshots account totals every day instead.
    async fetchDailyMetrics() { return []; },

    async fetchPosts(t, { limit }): Promise<PostRecord[]> {
      const out: PostRecord[] = [];
      let cursor: number | undefined;
      while (out.length < limit) {
        const r = await readJson(await f(`${API}/video/list/?fields=id,create_time,share_url,video_description,title,duration,like_count,comment_count,share_count,view_count`, {
          method: "POST", headers: { ...auth(t), "Content-Type": "application/json" }, body: JSON.stringify({ max_count: Math.min(20, limit - out.length), ...(cursor !== undefined ? { cursor } : {}) }), signal: AbortSignal.timeout(15_000),
        }), "tiktok videos");
        for (const v of r.data?.videos ?? []) out.push({ externalId: String(v.id), publishedAt: v.create_time ? new Date(Number(v.create_time) * 1000).toISOString() : null, permalink: v.share_url ?? null, caption: v.title || v.video_description || null, mediaType: "video", metrics: { views: Number(v.view_count ?? 0), likes: Number(v.like_count ?? 0), comments: Number(v.comment_count ?? 0), shares: Number(v.share_count ?? 0) } });
        if (!r.data?.has_more) break;
        cursor = r.data.cursor;
      }
      return out.slice(0, limit);
    },

    async revoke(t) {
      await f(`${API}/oauth/revoke/`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: form({ client_key: cfg.clientId, client_secret: cfg.clientSecret, token: t.accessToken }), signal: AbortSignal.timeout(15_000) }).catch(() => {});
    },
  };
}
