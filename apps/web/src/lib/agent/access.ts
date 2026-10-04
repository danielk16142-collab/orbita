import "server-only";
import { z } from "zod";
import { getSession, sessionProblem, type Profile } from "@/lib/session";

const Uuid = z.string().uuid();

export type AgentActor = {
  sb: NonNullable<Awaited<ReturnType<typeof getSession>>>["sb"];
  userId: string; profile: Profile; clientId: string;
  client: { id: string; name: string; languages: ("en" | "fr" | "es")[]; markets: string[] };
};
export type AccessResult = { ok: true; actor: AgentActor } | { ok: false; status: 401 | 403 | 404 };

/**
 * Who is talking to which client's agent. The client id for a client user ALWAYS comes from their profile;
 * for agency staff it comes from the request but must be a client they can see (RLS) and they must have passed MFA.
 */
export async function resolveAgentActor(requestedClientId?: string | null): Promise<AccessResult> {
  const s = await getSession();
  if (!s) return { ok: false, status: 401 };
  if (await sessionProblem(s)) return { ok: false, status: 403 };
  let clientId: string | null;
  if (s.profile.role === "client") clientId = s.profile.client_id;
  else clientId = Uuid.safeParse(requestedClientId).success ? (requestedClientId as string) : null;
  if (!clientId) return { ok: false, status: 404 };
  const { data: client } = await s.sb.from("clients").select("id, name, languages, markets").eq("id", clientId).maybeSingle();
  if (!client) return { ok: false, status: 404 }; // also what other agencies' clients look like: RLS hides them
  return { ok: true, actor: { sb: s.sb, userId: s.user.id, profile: s.profile, clientId, client: client as AgentActor["client"] } };
}
