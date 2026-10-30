import { usernameFromLink, type ScrapeNetwork } from "@orbita/connectors";

/** Where a competitor's profile can be read from: its saved Instagram / TikTok links and the account name in each. */
export function scrapeTargets(links: { network: string; url: string }[], legacyUrl: string | null): Partial<Record<ScrapeNetwork, string>> {
  const out: Partial<Record<ScrapeNetwork, string>> = {};
  for (const l of [...links, ...(legacyUrl ? [{ network: "", url: legacyUrl }] : [])]) {
    for (const n of ["instagram", "tiktok"] as const) { const u = usernameFromLink(n, l.url); if (u && !out[n]) out[n] = u; }
  }
  return out;
}
