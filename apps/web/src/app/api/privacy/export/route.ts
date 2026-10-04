import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { limiter } from "@/lib/rate-limit";
import { audit } from "@/lib/audit";

export const dynamic = "force-dynamic";

/**
 * Downloads the signed-in user's own data. Fail closed: no session means 401, and every
 * query goes through the user's own RLS-bound client, so it can only return what they may see
 * about themselves. Rate-limited because it is a heavier read.
 */
export async function GET() {
  const s = await getSession();
  if (!s) return new NextResponse("Unauthorized", { status: 401 });
  if (!(await limiter("privacy-export", 5, 60 * 60_000).hit(s.user.id)).allowed) return new NextResponse("Too many requests", { status: 429 });
  const [acceptances, requests, convos] = await Promise.all([
    s.sb.from("legal_acceptances").select("document, version, accepted_at").eq("user_id", s.user.id),
    s.sb.from("data_requests").select("kind, status, details, created_at, due_at, resolved_at, resolution_note").eq("requester_id", s.user.id),
    s.sb.from("conversations").select("id, kind, created_at, summary").eq("created_by", s.user.id),
  ]);
  // Messages of the conversations this person started (the agent chat), plus the suggestions they decided.
  const convIds = (convos.data ?? []).map((c) => c.id);
  const [chat, decided] = await Promise.all([
    convIds.length ? s.sb.from("messages").select("conversation_id, role, content, created_at").in("conversation_id", convIds).order("created_at") : Promise.resolve({ data: [] }),
    s.sb.from("proposals").select("target, payload, status, decided_at").eq("decided_by", s.user.id),
  ]);
  const body = {
    exported_at: new Date().toISOString(),
    account: { id: s.user.id, email: s.user.email, created_at: s.user.created_at },
    profile: { full_name: s.profile.full_name, role: s.profile.role, locale: s.profile.locale },
    legal_acceptances: acceptances.data ?? [],
    privacy_requests: requests.data ?? [],
    agent_conversations: (convos.data ?? []).map((c) => ({ ...c, messages: (chat.data ?? []).filter((m) => m.conversation_id === c.id) })),
    agent_suggestions_you_decided: decided.data ?? [],
  };
  await audit({ agencyId: s.profile.agency_id, actor: s.user.id, action: "privacy.export" });
  return new NextResponse(JSON.stringify(body, null, 2), {
    headers: { "Content-Type": "application/json", "Content-Disposition": 'attachment; filename="orbita-my-data.json"', "Cache-Control": "no-store" },
  });
}
