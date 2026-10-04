import { lookup } from "node:dns";
import { isIP } from "node:net";
import * as cheerio from "cheerio";
import { Agent, fetch as undiciFetch } from "undici";
import { assertSafeUrl, isPrivateAddress, UnsafeUrlError } from "@orbita/security/ssrf";

export type SiteSnapshot = {
  url: string; title: string; description: string; lang: string | null; headings: string[]; ctas: string[];
  socialLinks: { kind: string; url: string }[]; hasViewport: boolean; jsonLdTypes: string[]; text: string; internalLinks: string[];
};

export const USER_AGENT = "OrbitaBot/1.0 (+marketing audit requested by the site owner)";
const MAX_BYTES = 2 * 1024 * 1024;
const MAX_REDIRECTS = 3;
const MAX_TEXT = 6000;

/**
 * fetch whose DNS lookup refuses private/internal addresses at CONNECT time. Validating a URL
 * and then connecting leaves a gap where DNS can change (rebinding); validating inside the
 * lookup the connection actually uses closes it.
 */
export function createPinnedFetch(): typeof fetch {
  const agent = new Agent({
    connect: {
      lookup: ((hostname: string, options: { all?: boolean; family?: number }, cb: (...a: unknown[]) => void) => {
        lookup(hostname, { ...options, all: true }, (err, addrs) => {
          if (err) return cb(err);
          const list = addrs as { address: string; family: number }[];
          if (!list.length || list.some((a) => isPrivateAddress(a.address))) return cb(new UnsafeUrlError("Address not allowed"));
          return options.all ? cb(null, list) : cb(null, list[0].address, list[0].family);
        });
      }) as never,
    },
  });
  return (async (url: string | URL, init?: RequestInit) => {
    // IP-literal hosts never trigger a DNS lookup, so the guard above would not see them.
    const host = new URL(url.toString()).hostname.replace(/^\[|\]$/g, "");
    if (isIP(host) && isPrivateAddress(host)) throw new UnsafeUrlError("Address not allowed");
    return undiciFetch(url as never, { ...(init as object), dispatcher: agent } as never);
  }) as unknown as typeof fetch;
}

type Opts = { fetchImpl?: typeof fetch; resolver?: (host: string) => Promise<string[]>; timeoutMs?: number };

async function readCapped(res: Response, max: number): Promise<string> {
  const reader = res.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = []; let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) { await reader.cancel(); throw new Error("Page is too large"); }
    chunks.push(value);
  }
  return new TextDecoder("utf-8", { fatal: false }).decode(Buffer.concat(chunks));
}

/** Follows redirects manually so every hop is validated again. */
async function safeGet(url: string, opts: Opts, accept: string): Promise<{ res: Response; finalUrl: string }> {
  const f = opts.fetchImpl ?? createPinnedFetch();
  let current = url;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    await assertSafeUrl(current, { resolver: opts.resolver });
    const res = await f(current, { redirect: "manual", headers: { "User-Agent": USER_AGENT, Accept: accept }, signal: AbortSignal.timeout(opts.timeoutMs ?? 10_000) });
    if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
      current = new URL(res.headers.get("location")!, current).toString();
      continue;
    }
    return { res, finalUrl: current };
  }
  throw new Error("Too many redirects");
}

/** Minimal robots.txt check for our user agent (or *). Longest matching rule wins; unreachable robots.txt means allowed. */
export async function robotsAllows(url: string, opts: Opts = {}): Promise<boolean> {
  try {
    const u = new URL(url);
    const { res } = await safeGet(`${u.origin}/robots.txt`, opts, "text/plain");
    if (!res.ok) return true;
    const rules = parseRobots(await readCapped(res, 200_000));
    let best = { len: -1, allow: true };
    for (const r of rules) if (r.path && u.pathname.startsWith(r.path) && r.path.length > best.len) best = { len: r.path.length, allow: r.allow };
    return best.allow;
  } catch { return true; }
}

export function parseRobots(txt: string): { allow: boolean; path: string }[] {
  const out: { allow: boolean; path: string }[] = [];
  const groups: { agents: string[]; rules: { allow: boolean; path: string }[] }[] = [];
  let cur: (typeof groups)[number] | null = null;
  for (const raw of txt.split(/\r?\n/)) {
    const line = raw.replace(/#.*/, "").trim();
    const m = line.match(/^([A-Za-z-]+)\s*:\s*(.*)$/);
    if (!m) continue;
    const k = m[1].toLowerCase(), v = m[2].trim();
    if (k === "user-agent") { if (!cur || cur.rules.length) { cur = { agents: [], rules: [] }; groups.push(cur); } cur.agents.push(v.toLowerCase()); }
    else if ((k === "allow" || k === "disallow") && cur) cur.rules.push({ allow: k === "allow", path: v });
  }
  const mine = groups.find((g) => g.agents.some((a) => a.includes("orbitabot"))) ?? groups.find((g) => g.agents.includes("*"));
  if (mine) out.push(...mine.rules.filter((r) => r.path));
  return out;
}

const SOCIALS: [string, RegExp][] = [
  ["instagram", /(^|\.)instagram\.com$/], ["tiktok", /(^|\.)tiktok\.com$/], ["linkedin", /(^|\.)linkedin\.com$/],
  ["youtube", /(^|\.)(youtube\.com|youtu\.be)$/], ["facebook", /(^|\.)(facebook\.com|fb\.com)$/],
];
const CTA_WORDS = /\b(book|buy|order|reserve|contact|call|get|start|sign up|subscribe|request|quote|shop|learn more|réserv|commander|contact|appel|reserva|compra|pedir|solicit|llamar)/i;

/** Pure HTML -> structured snapshot. Scripts, styles and hidden chrome are dropped. */
export function analyzeHtml(html: string, pageUrl: string): SiteSnapshot {
  const $ = cheerio.load(html);
  const origin = new URL(pageUrl).origin;
  const jsonLdTypes: string[] = [];
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const walk = (n: unknown) => { if (Array.isArray(n)) n.forEach(walk); else if (n && typeof n === "object") { const t = (n as Record<string, unknown>)["@type"]; if (typeof t === "string") jsonLdTypes.push(t); else if (Array.isArray(t)) jsonLdTypes.push(...t.map(String)); for (const v of Object.values(n)) walk(v); } };
      walk(JSON.parse($(el).text()));
    } catch { /* ignore malformed JSON-LD */ }
  });
  const socialLinks: SiteSnapshot["socialLinks"] = []; const internal = new Set<string>(); const ctas = new Set<string>();
  $("a[href]").each((_, el) => {
    const href = $(el).attr("href") ?? "";
    let u: URL; try { u = new URL(href, pageUrl); } catch { return; }
    if (!/^https?:$/.test(u.protocol)) return;
    const social = SOCIALS.find(([, re]) => re.test(u.hostname.toLowerCase()));
    if (social && !socialLinks.some((l) => l.url === u.toString())) socialLinks.push({ kind: social[0], url: u.toString() });
    if (u.origin === origin && !u.hash && !/\.(png|jpe?g|gif|svg|webp|pdf|zip|css|js)$/i.test(u.pathname)) internal.add(u.origin + u.pathname);
    const label = $(el).text().replace(/\s+/g, " ").trim();
    if (label && label.length <= 60 && CTA_WORDS.test(label)) ctas.add(label);
  });
  $("button").each((_, el) => { const l = $(el).text().replace(/\s+/g, " ").trim(); if (l && l.length <= 60 && CTA_WORDS.test(l)) ctas.add(l); });
  const headings: string[] = [];
  $("h1, h2, h3").each((_, el) => { const t = $(el).text().replace(/\s+/g, " ").trim(); if (t && headings.length < 40) headings.push(`${el.tagName.toUpperCase()}: ${t.slice(0, 160)}`); });
  $("script, style, noscript, svg, iframe, template, [hidden], [aria-hidden='true']").remove();
  const text = $("body").text().replace(/\s+/g, " ").trim().slice(0, MAX_TEXT);
  return {
    url: pageUrl, title: ($("title").first().text() || "").trim().slice(0, 200),
    description: ($('meta[name="description"]').attr("content") || $('meta[property="og:description"]').attr("content") || "").trim().slice(0, 400),
    lang: $("html").attr("lang") || null, headings, ctas: [...ctas].slice(0, 15), socialLinks: socialLinks.slice(0, 10),
    hasViewport: $('meta[name="viewport"]').length > 0, jsonLdTypes: [...new Set(jsonLdTypes)].slice(0, 10), text, internalLinks: [...internal].slice(0, 60),
  };
}

export async function fetchPage(url: string, opts: Opts = {}): Promise<SiteSnapshot> {
  if (!(await robotsAllows(url, opts))) throw new Error("The site's robots.txt asks crawlers not to read this page");
  const { res, finalUrl } = await safeGet(url, opts, "text/html,application/xhtml+xml");
  if (!res.ok) throw new Error(`The page returned HTTP ${res.status}`);
  const type = res.headers.get("content-type") ?? "";
  if (!/text\/html|application\/xhtml\+xml/i.test(type)) throw new Error("The URL is not an HTML page");
  const len = Number(res.headers.get("content-length") ?? 0);
  if (len > MAX_BYTES) throw new Error("Page is too large");
  return analyzeHtml(await readCapped(res, MAX_BYTES), finalUrl);
}
