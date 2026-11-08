import { ApifyError } from "./apify";

/**
 * Reads a public LinkedIn profile for the profile score through Apify (harvestapi/linkedin-profile-scraper, no login,
 * about $0.004 a profile; harvestapi/linkedin-profile-posts for the date of the latest post, about $0.002 a post).
 * Everything that comes back is untrusted: cleaned and clamped here. Parts LinkedIn does not show to a reader (how old the
 * photo is, whether recommendations name outcomes) come back as guesses, listed in `guessed`, for the person to check.
 */
export type LinkedInProfileFields = {
  headline: string; about: string; currentRole: string; pastRoles: string; featured: string; topSkills: string;
  photo?: "recent_face" | "none"; activity?: "7d" | "30d" | "older" | "never";
  recommendations: number; recommendationsNameOutcomes: boolean; customUrl: boolean; contactLink: boolean;
};
export type LinkedInProfileRead = { fields: LinkedInProfileFields; guessed: (keyof LinkedInProfileFields)[]; name: string; publicId: string; followers: number | null };

const PROFILE_ACTOR = "harvestapi~linkedin-profile-scraper";
const POSTS_ACTOR = "harvestapi~linkedin-profile-posts";
const PUBLIC_ID = /^[A-Za-z0-9\-_%.]{3,100}$/;

/** The public id in a personal profile link (linkedin.com/in/<id>), or null: company pages and other links are not profiles. */
export function linkedinIdFromLink(link: string): string | null {
  try {
    const u = new URL(link.trim().match(/^https?:\/\//i) ? link.trim() : `https://${link.trim()}`);
    const host = u.hostname.toLowerCase();
    if (host !== "linkedin.com" && !host.endsWith(".linkedin.com")) return null;
    const [first, id] = u.pathname.split("/").filter(Boolean);
    if (first !== "in" || !id) return null;
    const clean = decodeURIComponent(id);
    return PUBLIC_ID.test(clean) ? clean : null;
  } catch { return null; }
}

const obj = (v: unknown): Record<string, unknown> => (typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const line = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/[\u0000-\u001F\u007F]+/g, " ").replace(/\s+/g, " ").trim().slice(0, max) : "");
/** Multi-line text: keeps paragraph breaks, drops other control characters. */
const block = (v: unknown, max: number) => (typeof v === "string"
  ? v.replace(/\r\n?/g, "\n").replace(/[\u0000-\u0009\u000B-\u001F\u007F]+/g, " ").replace(/[ \t]+/g, " ").replace(/ *\n */g, "\n").replace(/\n{3,}/g, "\n\n").trim().slice(0, max) : "");

/** "Position at Company (Jan 2024 to Present)" and its description. */
function role(e: Record<string, unknown>, max: number): string {
  const start = line(obj(e.startDate).text, 30), end = line(obj(e.endDate).text, 30);
  const head = [line(e.position, 200), line(e.companyName, 120)].filter(Boolean).join(" at ");
  const dates = start ? ` (${start}${end ? ` to ${end}` : ""})` : "";
  const body = block(e.description, max);
  return head ? `${head}${dates}${body ? `\n${body}` : ""}`.slice(0, max) : "";
}
const isCurrent = (e: Record<string, unknown>) => /present|actual|aujourd|presente/i.test(line(obj(e.endDate).text, 30)) || !Object.keys(obj(e.endDate)).length;

/** LinkedIn's default ids end in a random block with digits (jane-doe-4a7b9c12); a custom one does not. */
export const isCustomLinkedInId = (id: string) => { const last = id.split("-").pop() ?? ""; return !(id.includes("-") && last.length >= 6 && /\d/.test(last)); };
const CONTACT = /[\w.+-]+@[\w-]+\.[\w.]+|calendly\.com|cal\.com|https?:\/\/|www\./i;

/** One profile item from the actor to the score's fields. Null for an error item or one without a profile. */
export function mapLinkedInProfile(raw: unknown): LinkedInProfileRead | null {
  const d = obj(raw);
  if (d.error || (!d.headline && !d.firstName && !d.publicIdentifier)) return null;
  const exp = arr(d.experience).map(obj).filter((e) => e.position || e.companyName);
  const current = exp.find(isCurrent) ?? exp[0];
  const past = exp.filter((e) => e !== current).slice(0, 5);
  const featured = arr(d.featured).slice(0, 5).map((f) => { const o = obj(f); return [o.title, o.name, o.headline, o.subtitle, o.description, o.link ?? o.url].map((x) => line(x, 200)).filter(Boolean).join(" · "); }).filter(Boolean);
  const top = line(d.topSkills, 300).replace(/\s*[•·|]\s*/g, ", ");
  const skills = top || arr(d.skills).slice(0, 5).map((s) => line(obj(s).name ?? s, 60)).filter(Boolean).join(", ");
  const recs = arr(d.receivedRecommendations);
  const publicId = line(d.publicIdentifier, 100);
  const about = block(d.about, 3000), headline = line(d.headline, 400);
  const photo = typeof d.photo === "string" && d.photo.startsWith("https://") ? "recent_face" as const : "none" as const;
  return {
    name: [line(d.firstName, 60), line(d.lastName, 60)].filter(Boolean).join(" "),
    publicId,
    followers: typeof d.followerCount === "number" && d.followerCount >= 0 ? Math.round(d.followerCount) : null,
    fields: {
      headline, about,
      currentRole: current ? role(current, 3000) : "",
      pastRoles: past.map((e) => role(e, 700)).filter(Boolean).join("\n\n").slice(0, 4000),
      featured: featured.join("\n").slice(0, 1000),
      topSkills: skills.slice(0, 300),
      photo,
      recommendations: Math.min(100, recs.length),
      recommendationsNameOutcomes: recs.some((r) => /\d|%/.test(JSON.stringify(r))),
      customUrl: publicId ? isCustomLinkedInId(publicId) : false,
      contactLink: CONTACT.test(`${headline}\n${about}`) || arr(d.websites).length > 0,
    },
    guessed: photo === "recent_face" ? ["photo", "recommendationsNameOutcomes", "contactLink"] : ["recommendationsNameOutcomes", "contactLink"] as (keyof LinkedInProfileFields)[],
  };
}

/** How recently the person posted, from the newest post date (ISO) the posts actor returned. No post at all is "never". */
export function activityFrom(dates: (string | null)[], now = Date.now()): "7d" | "30d" | "older" | "never" {
  const t = dates.map((x) => (x ? Date.parse(x) : NaN)).filter((n) => Number.isFinite(n) && n <= now + 864e5);
  if (!t.length) return "never";
  const days = (now - Math.max(...t)) / 864e5;
  return days <= 7 ? "7d" : days <= 30 ? "30d" : "older";
}

async function runActor(actor: string, input: unknown, token: string, fetchImpl: typeof fetch, maxItems: number): Promise<unknown[]> {
  const url = `https://api.apify.com/v2/acts/${actor}/run-sync-get-dataset-items?maxItems=${maxItems}&timeout=90&memory=1024`;
  let res: Response;
  try {
    res = await fetchImpl(url, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify(input), signal: AbortSignal.timeout(100_000) });
  } catch (e) {
    throw new ApifyError(e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError") ? "timeout" : "provider_error");
  }
  if (res.status === 401 || res.status === 403) throw new ApifyError("unauthorized");
  if (res.status === 402) throw new ApifyError("no_credit");
  if (res.status === 408) throw new ApifyError("timeout");
  if (!res.ok) { console.error(`apify ${actor} failed: status=${res.status}`); throw new ApifyError("provider_error"); }
  const items = await res.json().catch(() => null);
  if (!Array.isArray(items)) throw new ApifyError("bad_response");
  return items.slice(0, maxItems);
}

/**
 * Read one public profile and, alongside, its latest posts for the activity answer. The posts read is best effort: when it
 * fails, activity is left out (the person's own answer stays). Throws ApifyError when the profile itself cannot be read.
 */
export async function fetchLinkedInProfile(publicId: string, opts: { token?: string; fetchImpl?: typeof fetch } = {}): Promise<LinkedInProfileRead> {
  const token = opts.token ?? process.env.APIFY_TOKEN;
  if (!token) throw new ApifyError("no_token");
  if (!PUBLIC_ID.test(publicId)) throw new ApifyError("bad_response");
  const f = opts.fetchImpl ?? fetch;
  const link = `https://www.linkedin.com/in/${encodeURIComponent(publicId)}/`;
  const [profile, posts] = await Promise.allSettled([
    runActor(PROFILE_ACTOR, { profileScraperMode: "Profile details no email ($4 per 1k)", queries: [link] }, token, f, 1),
    runActor(POSTS_ACTOR, { targetUrls: [link], maxPosts: 3, includeReposts: true, includeQuotePosts: true, scrapeReactions: false, scrapeComments: false }, token, f, 3),
  ]);
  if (profile.status === "rejected") throw profile.reason;
  const read = profile.value.map(mapLinkedInProfile).find(Boolean);
  if (!read) throw new ApifyError("bad_response");
  if (posts.status === "fulfilled") {
    const dates = posts.value.map((p) => line(obj(obj(p).postedAt).date, 40) || null);
    if (!posts.value.length || dates.some(Boolean)) { // items without dates are error items: leave the answer alone
      read.fields.activity = activityFrom(dates);
      if (read.fields.activity === "never") read.guessed.push("activity"); // no post found could also be a private feed
    }
  }
  return read;
}
