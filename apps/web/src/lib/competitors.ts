/** Competitor profile links: which networks, and how a handle or URL becomes a checked https profile link. */
export const COMPETITOR_NETWORKS = ["instagram", "tiktok", "linkedin", "youtube", "facebook"] as const;
export type CompetitorNetwork = (typeof COMPETITOR_NETWORKS)[number];

const HOSTS: Record<CompetitorNetwork, string[]> = {
  instagram: ["instagram.com"], tiktok: ["tiktok.com"], linkedin: ["linkedin.com"], youtube: ["youtube.com", "youtu.be"], facebook: ["facebook.com", "fb.com"],
};
const FROM_HANDLE: Partial<Record<CompetitorNetwork, (h: string) => string>> = {
  instagram: (h) => `https://www.instagram.com/${h}`, tiktok: (h) => `https://www.tiktok.com/@${h}`,
  youtube: (h) => `https://www.youtube.com/@${h}`, facebook: (h) => `https://www.facebook.com/${h}`,
};
const HANDLE = /^@?([A-Za-z0-9._-]{1,60})$/;

/** A https profile URL on the network's own domain, or null. Handles are accepted where the profile URL is predictable. */
export function competitorLink(network: CompetitorNetwork, value: string): string | null {
  const v = value.trim();
  const h = HANDLE.exec(v);
  if (h && FROM_HANDLE[network]) return FROM_HANDLE[network]!(h[1]);
  try {
    const u = new URL(v.startsWith("http") ? v : `https://${v}`);
    if (u.protocol !== "https:") return null;
    const host = u.hostname.toLowerCase().replace(/^www\.|^m\./, "");
    if (!HOSTS[network].some((d) => host === d || host.endsWith(`.${d}`))) return null;
    u.search = ""; u.hash = "";
    return u.toString();
  } catch { return null; }
}

export type CompetitorRow = { id: string; name: string | null; url: string | null; website: string | null; links: { network: string; url: string }[]; notes: string | null; last_researched_at: string | null };
export const competitorName = (c: Pick<CompetitorRow, "name" | "url">) => c.name ?? c.url ?? "—";
