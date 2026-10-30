
/**
 * Public reels / videos of a competitor account through Apify actors (apify/instagram-reel-scraper, clockworks/tiktok-scraper).
 * The token is a server env var (APIFY_TOKEN), never sent to the browser. Everything that comes back is untrusted: validated,
 * truncated and clamped here before it reaches the database. Public accounts only.
 */
export type ScrapeNetwork = "instagram" | "tiktok";
export type FetchedPost = { url: string | null; hook: string; caption: string | null; views: number | null; likes: number | null; comments: number | null; shares: number | null; followers: number | null; postedAt: string | null };

export class ApifyError extends Error {
  constructor(public code: "no_token" | "timeout" | "provider_error" | "bad_response" | "unauthorized" | "no_credit") { super(code); }
}
export const apifyConfigured = () => !!process.env.APIFY_TOKEN;
export const MAX_REELS = 30;

const ACTOR: Record<ScrapeNetwork, string> = { instagram: "apify~instagram-reel-scraper", tiktok: "clockworks~tiktok-scraper" };
const USERNAME = /^[A-Za-z0-9._]{1,60}$/;

/** The account name inside a saved profile link (instagram.com/name, tiktok.com/@name), or null. */
export function usernameFromLink(network: ScrapeNetwork, link: string): string | null {
  try {
    const u = new URL(link);
    const host = u.hostname.toLowerCase().replace(/^www\.|^m\./, "");
    if (host !== (network === "instagram" ? "instagram.com" : "tiktok.com")) return null;
    const first = u.pathname.split("/").filter(Boolean)[0]?.replace(/^@/, "") ?? "";
    if (!USERNAME.test(first) || ["p", "reel", "reels", "explore", "stories", "tv", "video", "tag", "discover"].includes(first.toLowerCase())) return null;
    return first;
  } catch { return null; }
}

const count = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? Math.min(Math.round(v), 9_999_999_999) : null); // -1 means hidden
const text = (v: unknown, max: number): string => (typeof v === "string" ? v.replace(/[\u0000-\u001F\u007F]+/g, " ").replace(/\s+/g, " ").trim().slice(0, max) : "");
const rawLine = (v: unknown) => (typeof v === "string" ? v.split(/\r?\n/).map((l) => l.trim()).find(Boolean) ?? "" : "");
const link = (v: unknown): string | null => { try { const u = new URL(String(v)); return u.protocol === "https:" && !u.username && !u.password ? `${u.origin}${u.pathname}`.slice(0, 500) : null; } catch { return null; } };
const day = (v: unknown): string | null => { const d = typeof v === "number" ? new Date(v * 1000) : typeof v === "string" ? new Date(v) : null; return d && !Number.isNaN(d.getTime()) && d.getTime() <= Date.now() + 864e5 ? d.toISOString().slice(0, 10) : null; };
/** The opening line of a caption without leading hashtags or mentions: what a reader sees first. */
const hookOf = (caption: unknown) => text(rawLine(caption).replace(/^(?:[#@][\w.]+\s*)+/, ""), 300);

const get = (o: Record<string, unknown>, k: string) => o[k];

/** One scraped item to our shape, or null when it has no usable text or is an error item. */
export function mapItem(network: ScrapeNetwork, raw: unknown): FetchedPost | null {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return null;
  const d = raw as Record<string, unknown>;
  if (get(d, "error") || get(d, "errorCode")) return null;
  if (network === "instagram") {
    const hook = hookOf(get(d, "caption"));
    if (!hook) return null;
    return { url: link(get(d, "url")), hook, caption: text(get(d, "caption"), 2200) || null, views: count(get(d, "videoPlayCount")) ?? count(get(d, "videoViewCount")), likes: count(get(d, "likesCount")),
      comments: count(get(d, "commentsCount")), shares: count(get(d, "sharesCount")), followers: null, postedAt: day(get(d, "timestamp")) };
  }
  const hook = hookOf(get(d, "text"));
  if (!hook) return null;
  const author = (get(d, "authorMeta") ?? {}) as Record<string, unknown>;
  return { url: link(get(d, "webVideoUrl")), hook, caption: text(get(d, "text"), 2200) || null, views: count(get(d, "playCount")), likes: count(get(d, "diggCount")), comments: count(get(d, "commentCount")),
    shares: count(get(d, "shareCount")), followers: count(author.fans), postedAt: day(get(d, "createTimeISO")) ?? day(get(d, "createTime")) };
}

/** Latest public posts of one account. Runs the actor synchronously (Apify cuts the request at 300 s; we stop at 130 s). */
export async function fetchLatestPosts(network: ScrapeNetwork, username: string, opts: { token?: string; fetchImpl?: typeof fetch; limit?: number } = {}): Promise<FetchedPost[]> {
  const token = opts.token ?? process.env.APIFY_TOKEN;
  if (!token) throw new ApifyError("no_token");
  if (!USERNAME.test(username)) throw new ApifyError("bad_response");
  const limit = Math.max(1, Math.min(opts.limit ?? MAX_REELS, MAX_REELS));
  const input = network === "instagram"
    ? { username: [username], resultsLimit: limit, onlyPostsNewerThan: "6 months", skipPinnedPosts: true, includeTranscript: false, includeDownloadedVideo: false }
    : { profiles: [username], resultsPerPage: limit, profileSorting: "latest", excludePinnedPosts: true, shouldDownloadVideos: false, shouldDownloadCovers: false, shouldDownloadSlideshowImages: false, shouldDownloadAvatars: false, shouldDownloadMusicCovers: false };
  const url = `https://api.apify.com/v2/acts/${ACTOR[network]}/run-sync-get-dataset-items?maxItems=${limit}&timeout=120&memory=1024`;
  let res: Response;
  try {
    res = await (opts.fetchImpl ?? fetch)(url, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify(input), signal: AbortSignal.timeout(130_000) });
  } catch (e) {
    throw new ApifyError(e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError") ? "timeout" : "provider_error");
  }
  if (res.status === 401 || res.status === 403) throw new ApifyError("unauthorized");
  if (res.status === 402) throw new ApifyError("no_credit");
  if (res.status === 408) throw new ApifyError("timeout");
  if (!res.ok) { console.error(`apify ${network} failed: status=${res.status}`); throw new ApifyError("provider_error"); }
  const items = await res.json().catch(() => null);
  if (!Array.isArray(items)) throw new ApifyError("bad_response");
  return items.slice(0, limit).map((i) => mapItem(network, i)).filter((x): x is FetchedPost => !!x);
}
