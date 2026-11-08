"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { summarizeTikTok } from "@orbita/agent";
import { ApifyError, fetchLatestPosts, MAX_EXPORT_BYTES, parseLinkedInExport, readXlsx } from "@orbita/connectors";
import { resolveAgentActor } from "@/lib/agent/access";
import { tiktokHandle } from "@/lib/channel-stats";
import { limiter } from "@/lib/rate-limit";
import { audit } from "@/lib/audit";

type Result = { ok: true } | { ok: false; error: string; detail?: string };
const MISSING = ["42P01", "PGRST205", "PGRST204", "42703"];
const Uuid = z.string().uuid();

/** TikTok: fetch the account's latest public videos (Apify) and save a summary. Staff only (it costs a few cents). */
export async function fetchTikTokStatsAction(input: unknown): Promise<Result> {
  const p = z.object({ clientId: Uuid.optional() }).safeParse(input);
  if (!p.success) return { ok: false, error: "bad_request" };
  const a = await resolveAgentActor(p.data.clientId);
  if (!a.ok) return { ok: false, error: "forbidden" };
  const { sb, clientId, profile, userId } = a.actor;
  if (profile.role === "client") return { ok: false, error: "forbidden" };
  if (!process.env.APIFY_TOKEN) return { ok: false, error: "no_token" };
  if (!(await limiter("tiktok-stats", 6, 60 * 60_000).hit(userId)).allowed) return { ok: false, error: "rate_limited" };
  const handle = await tiktokHandle(sb, clientId);
  if (!handle) return { ok: false, error: "no_handle" };
  let videos;
  try { videos = await fetchLatestPosts("tiktok", handle, { limit: 30 }); }
  catch (e) { return { ok: false, error: e instanceof ApifyError ? e.code : "provider_error" }; }
  if (!videos.length) return { ok: false, error: "no_videos" };
  const { data: prev } = await sb.from("channel_stats").select("summary").eq("client_id", clientId).eq("network", "tiktok").order("created_at", { ascending: false }).limit(1).maybeSingle();
  const prevFollowers = (prev?.summary as { followers?: unknown } | null)?.followers;
  const summary = summarizeTikTok(videos, new Date(), typeof prevFollowers === "number" ? prevFollowers : null);
  const { error } = await sb.from("channel_stats").insert({ client_id: clientId, network: "tiktok", source: "apify", handle, summary, created_by: userId });
  if (error) { console.error(`tiktok stats save failed: code=${error.code ?? "?"}`); return { ok: false, error: MISSING.includes(error.code ?? "") ? "not_set_up" : "save_failed", detail: error.code }; }
  await audit({ agencyId: profile.agency_id, actor: userId, action: "channel.tiktok_fetched", entity: "client", entityId: clientId, meta: { videos: videos.length } });
  revalidatePath("/", "layout");
  return { ok: true };
}

/** LinkedIn: read the analytics file exported from LinkedIn (.xlsx) and save a summary. */
export async function uploadLinkedInExportAction(form: FormData): Promise<Result> {
  const clientId = form.get("clientId") ? String(form.get("clientId")) : undefined;
  if (clientId && !Uuid.safeParse(clientId).success) return { ok: false, error: "bad_request" };
  const a = await resolveAgentActor(clientId);
  if (!a.ok) return { ok: false, error: "forbidden" };
  const { sb, clientId: cid, profile, userId } = a.actor;
  if (!(await limiter("linkedin-upload", 20, 60 * 60_000).hit(userId)).allowed) return { ok: false, error: "rate_limited" };
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "no_file" };
  if (file.size > MAX_EXPORT_BYTES) return { ok: false, error: "too_large" };
  let summary;
  try { summary = parseLinkedInExport(readXlsx(new Uint8Array(await file.arrayBuffer()))); }
  catch (e) { return { ok: false, error: e instanceof Error && e.message === "too_large" ? "too_large" : "not_xlsx" }; }
  if (!summary.found.includes("engagement") && !summary.found.includes("discovery")) return { ok: false, error: "not_linkedin", detail: summary.found.join(", ") || "no LinkedIn sheets found" };
  const { error } = await sb.from("channel_stats").insert({ client_id: cid, network: "linkedin", source: "linkedin_export", summary, created_by: userId });
  if (error) { console.error(`linkedin stats save failed: code=${error.code ?? "?"}`); return { ok: false, error: MISSING.includes(error.code ?? "") ? "not_set_up" : "save_failed", detail: error.code }; }
  await audit({ agencyId: profile.agency_id, actor: userId, action: "channel.linkedin_uploaded", entity: "client", entityId: cid, meta: { found: summary.found } });
  revalidatePath("/", "layout");
  return { ok: true };
}
