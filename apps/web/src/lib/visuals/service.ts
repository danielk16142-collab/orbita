import "server-only";
import { createPinnedFetch } from "@orbita/agent";
import { assertSafeUrl } from "@orbita/security";
import { createFakeProvider, createModa, extractPages, fakeVisualsEnabled, MAX_FILE_BYTES, MAX_PAGES, VisualError, type VisualProvider } from "@orbita/visuals";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const DEFAULT_MONTHLY_CAP = 20;
const BUCKET = "post-media";

let fake: ReturnType<typeof createFakeProvider> | null = null;
/** Moda in production; the deterministic fake only with VISUALS_FAKE=1 outside production (development and screenshots). */
export function provider(): VisualProvider {
  if (fakeVisualsEnabled()) return (fake ??= createFakeProvider({ polls: 3 }));
  return createModa({ apiKey: process.env.MODA_API_KEY, fetchImpl: createPinnedFetch() });
}
export const providerConfigured = () => fakeVisualsEnabled() || !!process.env.MODA_API_KEY;

export type ModuleState = { enabled: boolean; monthlyCap: number; brandKitId: string | null };
/** The module switch for a client, read with the caller's own session (row-level security decides what they may see). */
export async function readModule(sb: { from: (t: string) => any }, clientId: string): Promise<ModuleState> {
  const { data } = await sb.from("client_modules").select("enabled, config").eq("client_id", clientId).eq("module", "visuals").maybeSingle();
  const c = (data?.config ?? {}) as { monthly_cap?: unknown; brand_kit_id?: unknown };
  const cap = Number(c.monthly_cap);
  return { enabled: !!data?.enabled, monthlyCap: Number.isInteger(cap) && cap >= 0 && cap <= 1000 ? cap : DEFAULT_MONTHLY_CAP, brandKitId: typeof c.brand_kit_id === "string" && c.brand_kit_id ? c.brand_kit_id : null };
}

/** Generations this calendar month that count against the cap (failed ones do not). */
export async function usedThisMonth(clientId: string): Promise<number> {
  const start = new Date(); start.setUTCDate(1); start.setUTCHours(0, 0, 0, 0);
  const { count } = await supabaseAdmin().from("visual_jobs").select("id", { count: "exact", head: true })
    .eq("client_id", clientId).gte("created_at", start.toISOString()).in("status", ["queued", "running", "succeeded"]);
  return count ?? 0;
}

/** Downloads the signed export URL: https only, public addresses only, manual redirects (re-checked), size-capped. */
async function download(url: string): Promise<Uint8Array> {
  const f = createPinnedFetch(); let current = url;
  for (let hop = 0; hop < 3; hop++) {
    await assertSafeUrl(current);
    const res = await f(current, { redirect: "manual", signal: AbortSignal.timeout(30_000), headers: { Accept: "image/png,application/zip" } });
    if (res.status >= 300 && res.status < 400 && res.headers.get("location")) { current = new URL(res.headers.get("location")!, current).toString(); continue; }
    if (!res.ok || !res.body) throw new Error(`download failed (${res.status})`);
    const limit = MAX_PAGES * MAX_FILE_BYTES; let size = 0; const chunks: Uint8Array[] = [];
    for await (const part of res.body as unknown as AsyncIterable<Uint8Array>) { size += part.byteLength; if (size > limit) throw new Error("export too large"); chunks.push(part); }
    const out = new Uint8Array(size); let o = 0; for (const c of chunks) { out.set(c, o); o += c.byteLength; }
    return out;
  }
  throw new Error("too many redirects");
}

/**
 * Final step of a successful task: fetch the export, split it into pages, store each page in the private bucket
 * and record it. Runs once per job (the caller claims the job first).
 */
export async function storeExport(job: { id: string; client_id: string; post_id: string }, exportUrl: string, format: string | null): Promise<number> {
  const admin = supabaseAdmin();
  const pages = extractPages(await download(exportUrl), format);
  for (const p of pages) {
    const path = `${job.client_id}/${job.post_id}/${job.id}/page-${p.page}.png`;
    const up = await admin.storage.from(BUCKET).upload(path, p.bytes, { contentType: "image/png", upsert: true });
    if (up.error) throw new Error("upload failed");
    const w = (p.bytes[16] << 24) | (p.bytes[17] << 16) | (p.bytes[18] << 8) | p.bytes[19];
    const h = (p.bytes[20] << 24) | (p.bytes[21] << 16) | (p.bytes[22] << 8) | p.bytes[23];
    const { error } = await admin.from("post_media").upsert({ post_id: job.post_id, client_id: job.client_id, job_id: job.id, path, page: p.page, width: w > 0 && w <= 10000 ? w : null, height: h > 0 && h <= 10000 ? h : null }, { onConflict: "path" });
    if (error) throw new Error("media row failed");
  }
  return pages.length;
}

/** Removes stored images of one post, or of a whole client when postId is omitted (database rows go with the cascade). */
export async function removeMedia(clientId: string, postId?: string): Promise<void> {
  const st = supabaseAdmin().storage.from(BUCKET);
  const walk = async (prefix: string, depth: number): Promise<string[]> => {
    const { data } = await st.list(prefix, { limit: 1000 });
    const out: string[] = [];
    for (const e of data ?? []) {
      const p = `${prefix}/${e.name}`;
      if (e.id) out.push(p); else if (depth > 0) out.push(...(await walk(p, depth - 1)));
    }
    return out;
  };
  const files = await walk(postId ? `${clientId}/${postId}` : clientId, postId ? 1 : 2);
  for (let i = 0; i < files.length; i += 100) await st.remove(files.slice(i, i + 100));
}

export const describeVisualError = (e: unknown): string => e instanceof VisualError
  ? `${e.name} code=${e.code}${e.status ? ` status=${e.status}` : ""}${e.providerType ? ` type=${e.providerType}` : ""}${e.requestId ? ` request=${e.requestId}` : ""} ${e.message.slice(0, 160)}`
  : e instanceof Error ? `${e.name} ${e.message.slice(0, 160)}` : "unknown";
