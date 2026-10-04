import type { AccountInfo, Connector, ConnectorNetwork, DailyMetric, PostRecord } from "./types";

/** Small deterministic PRNG so the fake data is stable per account. */
function rng(seed: string) { let h = 2166136261; for (const c of seed) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return () => ((h = Math.imul(h ^ (h >>> 15), 2246822507) >>> 0) % 10_000) / 10_000; }

/** Generated data for development and tests. createConnector refuses to build it in production. */
export function fakeConnector(network: ConnectorNetwork): Connector {
  const id = `fake-${network}-1`;
  return {
    network, scopes: ["read-only (fake)"],
    authUrl: ({ state, redirectUri }) => `${redirectUri}?code=fake&state=${encodeURIComponent(state)}`,
    exchangeCode: async () => ({ accessToken: "fake-token", refreshToken: "fake-refresh", expiresAt: new Date(Date.now() + 30 * 86_400_000).toISOString() }),
    needsRefresh: () => false,
    refresh: async (t) => t,
    async fetchAccount(): Promise<AccountInfo> { const r = rng(id); return { externalId: id, handle: `demo_${network}`, displayName: `Demo ${network}`, followers: 1200 + Math.floor(r() * 300), following: 150, mediaCount: 48, totalLikes: 9000 }; },
    async fetchDailyMetrics(_t, { since, until }): Promise<DailyMetric[]> {
      if (network === "tiktok") return [];
      const r = rng(id + "daily"); const out: DailyMetric[] = [];
      for (let d = new Date(since); d < until; d = new Date(d.getTime() + 86_400_000)) {
        const day = d.toISOString().slice(0, 10);
        out.push({ day, metric: "reach", value: 800 + Math.floor(r() * 900) }, { day, metric: "views", value: 1500 + Math.floor(r() * 1500) }, { day, metric: "interactions", value: 60 + Math.floor(r() * 120) });
      }
      return out;
    },
    async fetchPosts(_t, { limit }): Promise<PostRecord[]> {
      const r = rng(id + "posts"); const types = network === "tiktok" ? ["video"] : ["reel", "image", "carousel_album"];
      return Array.from({ length: Math.min(limit, 30) }, (_, i) => {
        const when = new Date(Date.now() - (i * 1.3 + r()) * 86_400_000); when.setUTCHours(8 + Math.floor(r() * 13), 0, 0, 0);
        const views = Math.floor(500 + r() * 6000);
        return { externalId: `${id}-p${i}`, publishedAt: when.toISOString(), permalink: `https://example.com/${network}/p${i}`, caption: `Demo post ${i + 1}`, mediaType: types[i % types.length], metrics: { views, reach: Math.floor(views * 0.8), likes: Math.floor(views * (0.03 + r() * 0.06)), comments: Math.floor(r() * 25), shares: Math.floor(r() * 20), saves: Math.floor(r() * 30) } };
      });
    },
    async revoke() {},
  };
}
