/**
 * Transcribe a public Instagram or TikTok video: Apify finds the post's video file (APIFY_TOKEN), we download it and a
 * speech-to-text model turns the speech into text (OPENAI_API_KEY; model OPENAI_TRANSCRIBE_MODEL, default whisper-1).
 * Keys are server env vars. Everything that comes back is untrusted: links are checked, sizes capped, text clamped.
 */
import type { ScrapeNetwork } from "./apify";

export class TranscribeError extends Error {
  constructor(public code: "no_token" | "no_openai_key" | "bad_link" | "no_video" | "too_large" | "timeout" | "provider_error" | "unauthorized" | "no_credit" | "no_speech") { super(code); }
}
export const transcribeConfigured = (env: Record<string, string | undefined> = process.env) => !!(env.APIFY_TOKEN && env.OPENAI_API_KEY);

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

/** The whole chain for one post link. */
export async function transcribePost(rawLink: string, opts: { fetchImpl?: typeof fetch } = {}): Promise<string> {
  const link = postLink(rawLink);
  if (!link) throw new TranscribeError("bad_link");
  const videoUrl = await findVideoUrl(link, opts);
  return speechToText(await downloadVideo(videoUrl, opts), opts);
}
