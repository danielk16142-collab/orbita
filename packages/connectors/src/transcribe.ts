/**
 * Transcribe a public Instagram or TikTok video.
 * 1. Instagram reels and video posts: the Apify actor steadyfetch/instagram-reel-transcript-scraper transcribes that one link
 *    (APIFY_TOKEN only; about $0.015 a reel on the free plan, only charged when a transcript is delivered).
 * 2. Otherwise, and when OPENAI_API_KEY is set: Apify finds the post's video file, we download it and a speech-to-text
 *    model turns the speech into text (OPENAI_TRANSCRIBE_MODEL, default whisper-1).
 * Keys are server env vars. Everything that comes back is untrusted: links are checked, sizes capped, text clamped.
 */
import type { ScrapeNetwork } from "./apify";

export class TranscribeError extends Error {
  /** What the provider said, when it said why (shown to staff). */
  detail: string | null = null;
  constructor(public code: "no_token" | "no_openai_key" | "bad_link" | "no_video" | "too_large" | "timeout" | "provider_error" | "unauthorized" | "no_credit" | "no_speech" | "no_transcript") { super(code); }
}
export const transcribeConfigured = (env: Record<string, string | undefined> = process.env) => !!env.APIFY_TOKEN;

/** Up to 25 MB: the speech-to-text API limit. */
export const MAX_VIDEO_BYTES = 25 * 1024 * 1024;
export const MAX_TRANSCRIPT = 8000;

/** A post link we can look up: https, on instagram.com or tiktok.com, pointing at one post. Tracking parameters dropped. */
export function postLink(raw: string): { network: ScrapeNetwork; url: string } | null {
  try {
    const u = new URL(raw.trim());
    if (u.protocol !== "https:" || u.username || u.password) return null;
    const host = u.hostname.toLowerCase().replace(/^www\.|^m\./, "");
    const parts = u.pathname.split("/").filter(Boolean);
    if (host === "instagram.com" && ["p", "reel", "reels", "tv"].includes(parts[0] ?? "") && /^[\w-]{5,40}$/.test(parts[1] ?? "")) return { network: "instagram", url: `https://www.instagram.com/${parts[0] === "reels" ? "reel" : parts[0]}/${parts[1]}/` };
    if (host === "tiktok.com" && parts[1] === "video" && /^\d{8,25}$/.test(parts[2] ?? "") && /^@[\w.]{1,60}$/.test(parts[0] ?? "")) return { network: "tiktok", url: `https://www.tiktok.com/${parts[0]}/video/${parts[2]}` };
    return null;
  } catch { return null; }
}

/** Where we may download a video from: the networks' CDNs and Apify's own storage. */
const VIDEO_HOSTS = [/\.cdninstagram\.com$/, /\.fbcdn\.net$/, /(^|\.)tiktokcdn(-[a-z]+)?\.com$/, /(^|\.)tiktokv\.com$/, /(^|\.)tiktok\.com$/, /^api\.apify\.com$/];
export function safeVideoUrl(v: unknown): string | null {
  try { const u = new URL(String(v)); return u.protocol === "https:" && !u.username && !u.password && VIDEO_HOSTS.some((h) => h.test(u.hostname.toLowerCase())) ? u.toString() : null; } catch { return null; }
}

/** The video file inside one scraped item. */
export function videoUrlOf(network: ScrapeNetwork, raw: unknown): string | null {
  if (typeof raw !== "object" || raw === null) return null;
  const d = raw as Record<string, unknown>;
  if (network === "instagram") return safeVideoUrl(d.videoUrl);
  const media = Array.isArray(d.mediaUrls) ? d.mediaUrls[0] : null;
  const meta = (d.videoMeta ?? {}) as Record<string, unknown>;
  return safeVideoUrl(media) ?? safeVideoUrl(meta.downloadAddr);
}

const ACTOR: Record<ScrapeNetwork, string> = { instagram: "apify~instagram-scraper", tiktok: "clockworks~tiktok-scraper" };

/** Ask Apify for one post and return the link to its video file. */
export async function findVideoUrl(link: { network: ScrapeNetwork; url: string }, opts: { token?: string; fetchImpl?: typeof fetch } = {}): Promise<string> {
  const token = opts.token ?? process.env.APIFY_TOKEN;
  if (!token) throw new TranscribeError("no_token");
  const input = link.network === "instagram"
    ? { directUrls: [link.url], resultsType: "posts", resultsLimit: 1, addParentData: false }
    : { postURLs: [link.url], resultsPerPage: 1, shouldDownloadVideos: true, shouldDownloadCovers: false, shouldDownloadSlideshowImages: false, shouldDownloadAvatars: false, shouldDownloadMusicCovers: false };
  let res: Response;
  try {
    res = await (opts.fetchImpl ?? fetch)(`https://api.apify.com/v2/acts/${ACTOR[link.network]}/run-sync-get-dataset-items?maxItems=1&timeout=90&memory=1024`, {
      method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify(input), signal: AbortSignal.timeout(100_000),
    });
  } catch (e) { throw new TranscribeError(e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError") ? "timeout" : "provider_error"); }
  if (res.status === 401 || res.status === 403) throw new TranscribeError("unauthorized");
  if (res.status === 402) throw new TranscribeError("no_credit");
  if (!res.ok) { console.error(`apify video lookup failed: status=${res.status}`); throw new TranscribeError("provider_error"); }
  const items = await res.json().catch(() => null);
  const url = Array.isArray(items) ? items.map((i) => videoUrlOf(link.network, i)).find(Boolean) : null;
  if (!url) throw new TranscribeError("no_video");
  return url;
}

/** Download the video, refusing anything over the size limit. */
export async function downloadVideo(url: string, opts: { fetchImpl?: typeof fetch; token?: string } = {}): Promise<Uint8Array> {
  if (!safeVideoUrl(url)) throw new TranscribeError("no_video");
  const apify = new URL(url).hostname === "api.apify.com";
  let res: Response;
  try {
    res = await (opts.fetchImpl ?? fetch)(url, { redirect: "follow", headers: apify && (opts.token ?? process.env.APIFY_TOKEN) ? { Authorization: `Bearer ${opts.token ?? process.env.APIFY_TOKEN}` } : {}, signal: AbortSignal.timeout(60_000) });
  } catch (e) { throw new TranscribeError(e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError") ? "timeout" : "provider_error"); }
  if (!res.ok || !res.body) throw new TranscribeError("no_video");
  if (Number(res.headers.get("content-length") ?? 0) > MAX_VIDEO_BYTES) throw new TranscribeError("too_large");
  const reader = res.body.getReader(); const chunks: Uint8Array[] = []; let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_VIDEO_BYTES) { await reader.cancel().catch(() => {}); throw new TranscribeError("too_large"); }
    chunks.push(value);
  }
  const out = new Uint8Array(size); let at = 0;
  for (const c of chunks) { out.set(c, at); at += c.byteLength; }
  return out;
}

/** Speech to text (OpenAI audio transcriptions). Returns the text, clamped. */
export async function speechToText(video: Uint8Array, opts: { apiKey?: string; model?: string; fetchImpl?: typeof fetch } = {}): Promise<string> {
  const apiKey = opts.apiKey ?? process.env.OPENAI_API_KEY;
  if (!apiKey) throw new TranscribeError("no_openai_key");
  const form = new FormData();
  form.append("file", new Blob([video as Uint8Array<ArrayBuffer>], { type: "video/mp4" }), "video.mp4");
  form.append("model", opts.model ?? process.env.OPENAI_TRANSCRIBE_MODEL ?? "whisper-1");
  form.append("response_format", "json");
  let res: Response;
  try {
    res = await (opts.fetchImpl ?? fetch)("https://api.openai.com/v1/audio/transcriptions", { method: "POST", headers: { Authorization: `Bearer ${apiKey}` }, body: form, signal: AbortSignal.timeout(120_000) });
  } catch (e) { throw new TranscribeError(e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError") ? "timeout" : "provider_error"); }
  if (res.status === 401 || res.status === 403) throw new TranscribeError("unauthorized");
  if (res.status === 429) throw new TranscribeError("no_credit");
  if (!res.ok) { console.error(`transcription failed: status=${res.status}`); throw new TranscribeError("provider_error"); }
  const data = (await res.json().catch(() => null)) as { text?: unknown } | null;
  const text = typeof data?.text === "string" ? data.text.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]+/g, "").replace(/[ \t]+/g, " ").trim().slice(0, MAX_TRANSCRIPT) : "";
  if (!text) throw new TranscribeError("no_speech");
  return text;
}

const clampText = (v: string) => v.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]+/g, "").replace(/[ \t]+/g, " ").trim().slice(0, MAX_TRANSCRIPT);

/** The transcript inside one reel-scraper item: a string, or segments with text. */
export function transcriptOf(raw: unknown): string {
  if (typeof raw !== "object" || raw === null) return "";
  const d = raw as Record<string, unknown>;
  for (const k of ["transcript", "transcription", "transcriptText"]) {
    const v = d[k];
    if (typeof v === "string" && v.trim()) return clampText(v);
    if (Array.isArray(v)) { const t = v.map((x) => (typeof x === "string" ? x : typeof (x as { text?: unknown })?.text === "string" ? (x as { text: string }).text : "")).join(" "); if (t.trim()) return clampText(t); }
  }
  return "";
}

/** The reel's short code (/reel/<code>/), to make sure a row is the reel we asked for. */
const shortCode = (url: string) => url.split("/").filter(Boolean).pop() ?? "";
const DELIVERED = ["transcribed", "onscreen_text_extracted"];

/** The text of one transcript-scraper row: what is said, or (music-only reels) the text shown on screen. "" when not delivered or another reel. */
export function transcriptRow(raw: unknown, code: string): { text: string; reason: string | null } {
  if (typeof raw !== "object" || raw === null) return { text: "", reason: null };
  const d = raw as Record<string, unknown>;
  if (d._summary) return { text: "", reason: null };
  if (typeof d.shortCode === "string" && d.shortCode && d.shortCode !== code) return { text: "", reason: null };
  if (!DELIVERED.includes(String(d.status))) return { text: "", reason: typeof d.statusReason === "string" ? d.statusReason.slice(0, 200) : String(d.status ?? "") };
  const text = transcriptOf(d) || (typeof d.onScreenText === "string" ? clampText(d.onScreenText) : "");
  return { text, reason: null };
}

const TRANSCRIPT_ACTOR = "steadyfetch~instagram-reel-transcript-scraper";

/** Instagram: ask the transcript actor for this one link. Null when it delivers none (private, removed, music only...). */
export async function apifyTranscript(link: { network: ScrapeNetwork; url: string }, opts: { token?: string; fetchImpl?: typeof fetch } = {}): Promise<{ text: string | null; reason: string | null }> {
  if (link.network !== "instagram") return { text: null, reason: null };
  const token = opts.token ?? process.env.APIFY_TOKEN;
  if (!token) throw new TranscribeError("no_token");
  let res: Response;
  try {
    // maxTotalChargeUsd caps what this one run can cost, whatever happens.
    res = await (opts.fetchImpl ?? fetch)(`https://api.apify.com/v2/acts/${TRANSCRIPT_ACTOR}/run-sync-get-dataset-items?timeout=180&maxTotalChargeUsd=0.25`, {
      method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ reelUrls: [link.url], maxItems: 1, includeOnScreenText: true }), signal: AbortSignal.timeout(190_000),
    });
  } catch (e) { throw new TranscribeError(e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError") ? "timeout" : "provider_error"); }
  if (res.status === 401 || res.status === 403) throw new TranscribeError("unauthorized");
  if (res.status === 402) throw new TranscribeError("no_credit");
  if (res.status === 408) throw new TranscribeError("timeout");
  if (!res.ok) {
    // Apify explains a refused or failed run in { error: { type, message } }: keep it (no secrets in it) so staff see why.
    const body = (await res.json().catch(() => null)) as { error?: { type?: unknown; message?: unknown } } | null;
    const why = [body?.error?.type, body?.error?.message].filter((x) => typeof x === "string").join(": ").slice(0, 300) || `status ${res.status}`;
    console.error(`apify transcript failed: status=${res.status} ${why}`);
    const e = new TranscribeError("provider_error"); e.detail = why; throw e;
  }
  const items = await res.json().catch(() => null);
  if (!Array.isArray(items)) throw new TranscribeError("provider_error");
  const rows = items.map((i) => transcriptRow(i, shortCode(link.url)));
  const hit = rows.find((r) => r.text);
  if (hit) return { text: hit.text, reason: null };
  const why = rows.map((r) => r.reason).filter(Boolean)[0] ?? (items.length ? "no row for this reel" : "no rows returned");
  console.error(`apify transcript not delivered: ${why}`);
  return { text: null, reason: why };
}

/** The whole chain for one post link: Apify's own transcript first, then (with an OpenAI key) speech to text on the video. */
export async function transcribePost(rawLink: string, opts: { fetchImpl?: typeof fetch; env?: Record<string, string | undefined> } = {}): Promise<string> {
  const link = postLink(rawLink);
  if (!link) throw new TranscribeError("bad_link");
  const fromApify = await apifyTranscript(link, opts);
  if (fromApify.text) return fromApify.text;
  if (!(opts.env ?? process.env).OPENAI_API_KEY) { const e = new TranscribeError("no_transcript"); e.detail = fromApify.reason; throw e; }
  const videoUrl = await findVideoUrl(link, opts);
  return speechToText(await downloadVideo(videoUrl, opts), opts);
}
