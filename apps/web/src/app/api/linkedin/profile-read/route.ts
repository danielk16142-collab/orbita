import { z } from "zod";
import { ApifyError, apifyConfigured, fakeEnabled, fetchLinkedInProfile, linkedinIdFromLink, mapLinkedInProfile, type LinkedInProfileRead } from "@orbita/connectors";
import { resolveAgentActor } from "@/lib/agent/access";
import { json, sameOrigin } from "@/lib/agent/http";
import { limiter } from "@/lib/rate-limit";
import { audit } from "@/lib/audit";

export const runtime = "nodejs";
export const maxDuration = 120;
export const dynamic = "force-dynamic";

const Body = z.object({ clientId: z.string().uuid().optional(), url: z.string().trim().min(3).max(300) });
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

/** A sample profile for development (CONNECTORS_FAKE=1), so the score card can be tried without Apify. */
const FAKE = { publicIdentifier: "sample-person", firstName: "Sample", lastName: "Person", headline: "Helping clinics get booked from their website", about: "I design websites for clinics.\n\nBook a call: calendly.com/sample", photo: "https://media.licdn.com/sample.jpg", topSkills: "Web Design • SEO", experience: [{ position: "Founder", companyName: "Sample Studio", startDate: { text: "Jan 2021" }, endDate: { text: "Present" }, description: "Websites for clinics." }], receivedRecommendations: [] };

/**
 * Read a public LinkedIn profile for the profile score (Apify, no login): the written parts, the facts LinkedIn shows, and
 * how recently the person posted. Nothing is saved; the score card fills its form with it and scores right away.
 */
export async function POST(req: Request) {
  if (!sameOrigin(req)) return json({ error: "forbidden" }, 403);
  const body = Body.safeParse(await req.json().catch(() => null));
  if (!body.success) return json({ error: "bad_request" }, 400);
  const publicId = linkedinIdFromLink(body.data.url);
  if (!publicId) return json({ error: "not_a_profile" }, 400);
  const access = await resolveAgentActor(body.data.clientId);
  if (!access.ok) return json({ error: "not_found" }, access.status);
  const actor = access.actor;
  const fake = fakeEnabled();
  if (!fake && !apifyConfigured()) return json({ error: "read_not_configured" }, 503);
  if (!(await limiter("li-profile-read", 10, 60 * 60_000).hit(actor.userId)).allowed) return json({ error: "rate_limited" }, 429);
  let read: LinkedInProfileRead;
  try {
    read = fake ? { ...mapLinkedInProfile(FAKE)!, publicId } : await fetchLinkedInProfile(publicId);
  } catch (e) {
    const code = e instanceof ApifyError ? e.code : "provider_error";
    console.error(`linkedin profile read failed: ${code}`);
    return json({ error: code === "no_credit" ? "read_no_credit" : code === "timeout" ? "read_timeout" : "read_failed" }, 502);
  }
  // Same handle as the other platforms: compare with the Instagram / TikTok handles saved for this client.
  const { data: sources } = await actor.sb.from("client_sources").select("kind, url, handle").eq("client_id", actor.clientId);
  const handles = (sources ?? []).filter((s) => s.kind === "instagram" || s.kind === "tiktok").map((s) => norm(s.handle ?? (s.url ?? "").split("/").filter(Boolean).pop() ?? "")).filter(Boolean);
  const sameHandle = handles.length > 0 && handles.some((h) => h === norm(publicId));
  await audit({ agencyId: actor.profile.agency_id, actor: actor.userId, action: "linkedin.profile_read", entity: "client", entityId: actor.clientId });
  return json({ ...read, fields: { ...read.fields, ...(handles.length ? { sameHandle } : {}) } });
}
