import "server-only";
import { BRIEF_SECTIONS, briefFromRow } from "@orbita/agent";
import type { AgentActor } from "./access";

/** The business as the research prompts see it: name, markets, languages and the known parts of the brand profile. */
export async function businessFor(actor: AgentActor) {
  const { data } = await actor.sb.from("brand_briefs").select("*").eq("client_id", actor.clientId).maybeSingle();
  const brief = briefFromRow((data as Record<string, unknown> | null) ?? null);
  const lines = BRIEF_SECTIONS.flatMap((s) => { const v = brief[s]; const t = Array.isArray(v) ? v.join("; ") : v; return t ? [`${s}: ${String(t).slice(0, 400)}`] : []; });
  return { name: actor.client.name, languages: actor.client.languages, markets: actor.client.markets, brief: lines.join("\n").slice(0, 3000) };
}

/** Which failure codes from a run the page can explain. Everything else is "generic". */
export const RUN_ERRORS = ["not_configured", "rate_limited", "daily_cap", "no_web", "no_result", "refused", "search_failed", "model_error", "forbidden", "not_found", "bad_request", "unauthorized"] as const;
