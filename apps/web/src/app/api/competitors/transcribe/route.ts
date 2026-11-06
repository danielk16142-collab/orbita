import { z } from "zod";
import { transcribeConfigured, transcribePost, TranscribeError } from "@orbita/connectors";
import { resolveAgentActor } from "@/lib/agent/access";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { json, sameOrigin } from "@/lib/agent/http";
import { limiter } from "@/lib/rate-limit";
import { audit } from "@/lib/audit";

export const runtime = "nodejs";
export const maxDuration = 300;
export const dynamic = "force-dynamic";

const Body = z.object({ clientId: z.string().uuid().optional(), postId: z.string().uuid() });

/**
 * Transcribe a recorded competitor post: Apify returns the transcript of an Instagram reel (or, with an OpenAI key, the video is
 * transcribed by speech to text); the text is saved on the post so "Make our version" uses it. Staff only (it costs money).
 */
export async function POST(req: Request) {
  if (!sameOrigin(req)) return json({ error: "forbidden" }, 403);
  const body = Body.safeParse(await req.json().catch(() => null));
  if (!body.success) return json({ error: "bad_request" }, 400);
  if (!transcribeConfigured()) return json({ error: "not_configured" }, 503);
  const access = await resolveAgentActor(body.data.clientId);
  if (!access.ok) return json({ error: "not_found" }, access.status);
  const actor = access.actor;
  if (actor.profile.role === "client") return json({ error: "forbidden" }, 403);
  // The post must be visible to this person (row-level security) before anything is fetched or written.
  const { data: post } = await actor.sb.from("competitor_posts").select("id, url, competitor_id").eq("id", body.data.postId).eq("client_id", actor.clientId).maybeSingle();
  if (!post) return json({ error: "not_found" }, 404);
  if (!post.url) return json({ error: "no_link" }, 422);
  if (!(await limiter("transcribe", 20, 60 * 60_000).hit(actor.userId)).allowed) return json({ error: "rate_limited" }, 429);
  let transcript: string;
  try { transcript = await transcribePost(post.url); }
  catch (e) {
    const code = e instanceof TranscribeError ? e.code : "provider_error";
    if (!(e instanceof TranscribeError)) console.error("transcribe failed:", e instanceof Error ? e.name : "unknown");
    return json({ error: code }, code === "bad_link" || code === "no_video" || code === "no_speech" || code === "no_transcript" || code === "too_large" ? 422 : 502);
  }
  // competitor_posts has no update grant for people; the row was checked above through their own session.
  const { error } = await supabaseAdmin().from("competitor_posts").update({ transcript }).eq("id", post.id).eq("client_id", actor.clientId);
  if (error) { console.error(`transcript save failed: code=${error.code ?? "?"}`); return json({ error: "save_failed", transcript }, 500); }
  await audit({ agencyId: actor.profile.agency_id, actor: actor.userId, action: "competitor.post_transcribed", entity: "competitor_post", entityId: post.id, meta: { chars: transcript.length } });
  return json({ transcript });
}
