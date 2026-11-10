import type { BrandFocus } from "./focus";
/**
 * The strategy chat: a box on the Strategy section where the person types what to change ("more reels, drop LinkedIn",
 * or a pasted strategy). The agent answers with the FULL updated strategy (propose_strategy) and the server applies it
 * right away: the previous strategy is kept (inactive) and can be restored.
 */
export const STRATEGY_CHAT_TOOLS = ["get_brief", "get_account_analytics", "propose_strategy"];

const LANGUAGE_NAME: Record<string, string> = { en: "English", fr: "French", es: "Spanish" };

export function strategyChatFocus(hasStrategy: boolean, language?: string) {
  const lang = language ? LANGUAGE_NAME[language] ?? language : null;
  return `\n\n## This conversation: the strategy
You are editing this client's content strategy in the Strategy section. ${hasStrategy ? "The active strategy is above." : "There is no active strategy yet: build one from the brand profile, goals and research."}${lang ? `
- This is the strategy for the client's ${lang} content (each language has its own strategy and calendar). Write every part of it in ${lang}: objectives, pillar angles, series, topics and rationale. Pillar names stay exactly as chosen.` : ""}
- When the person asks for a change, or pastes a strategy, call propose_strategy ONCE with the COMPLETE updated strategy: keep everything they did not mention exactly as it is, and apply only what they asked. If they paste a strategy, convert it faithfully into the structure (objectives, pillars with share, series, cadence per network, topic bank, rationale); do not "improve" it unless asked.
- The person is directing the change here, so their instructions win over the usual defaults (for example, they may add, drop or rename a pillar). Never use an Avoid topic. Do not invent numbers or results.
- The change is applied to the Strategy section as soon as you call the tool; there is no separate approval step. The previous version is kept and can be restored.
- After the tool call, reply in two or three plain sentences: what you changed and anything you left out because it was unclear. If the request is unclear, ask one short question instead of guessing.
- Do not write posts or plan the week here.`;
}

/**
 * "Build the strategy from these pillars and topics": the request the Strategy section sends for the person, written from
 * what they chose. The pillars and shares are fixed; the agent builds everything else around them.
 */
const NET_NAME: Record<string, string> = { instagram: "Instagram", tiktok: "TikTok", linkedin: "LinkedIn", youtube: "YouTube", facebook: "Facebook" };

/** The channels part of the request: only these networks, the same short videos on Instagram and TikTok, LinkedIn on its own. */
export function channelsRule(channels: string[]): string {
  const c = channels.filter((n) => NET_NAME[n]);
  if (!c.length) return "";
  const L = [`Channels: plan only for ${c.map((n) => NET_NAME[n]).join(", ")}. No cadence, series or posts for any other network.`];
  if (c.includes("instagram") && c.includes("tiktok")) L.push("Instagram and TikTok get the same short videos: plan each reel once for both (the same days and count in their cadence), with a caption written for each network.");
  if (c.includes("linkedin")) L.push("LinkedIn gets its own content for a professional audience (text posts, document carousels, the occasional video), on its own cadence, not the reels reposted.");
  return L.join(" ");
}

export function focusBuildRequest(f: BrandFocus, hasStrategy: boolean, channels: string[] = []): string {
  const by = (l: string) => f.topics.filter((t) => t.level === l).map((t) => t.name);
  const L = [
    hasStrategy
      ? "Rebuild the strategy around the pillars and topics I just chose. Keep what still fits (objectives, cadence, series), and change what no longer matches them."
      : "Build the strategy around the pillars and topics I chose.",
    "Pillars (use exactly these names and shares, no other pillar):",
    ...f.pillars.filter((p) => p.name.trim()).map((p) => `- ${p.name} (${p.share}%)${p.angle ? `: ${p.angle}` : ""}${p.topics.length ? ` | topics: ${p.topics.join(", ")}` : ""}`),
  ];
  if (by("sometimes").length) L.push(`Topics to use now and then: ${by("sometimes").join(", ")}.`);
  if (by("avoid").length) L.push(`Never use: ${by("avoid").join(", ")}.`);
  L.push("Give each pillar at least one recurring series where it fits, and make the topic bank cover every pillar's topics in proportion to its share.");
  const ch = channelsRule(channels);
  if (ch) L.push(ch);
  return L.join("\n");
}

/**
 * The strategy keeps exactly the chosen pillars and shares, whatever the model wrote (its angle is kept when none was chosen),
 * and, when channels were chosen, only those networks in its cadence and series.
 */
export function alignStrategyToFocus(payload: unknown, f: BrandFocus, channels: string[] = []): unknown {
  type Content = { pillars?: { name: string; angle: string; share_percent: number }[]; cadence?: { network: string }[]; series?: { networks: string[] }[] };
  const p = payload as { content?: Content } | null;
  if (!p?.content) return payload;
  let content: Content = p.content;
  if (f.pillars.length) {
    const theirs = content.pillars ?? [];
    content = { ...content, pillars: f.pillars.filter((x) => x.name.trim()).map((x) => ({
      name: x.name, share_percent: x.share,
      angle: x.angle || theirs.find((t) => t.name.trim().toLowerCase() === x.name.trim().toLowerCase())?.angle || "",
    })) };
  }
  if (channels.length) {
    const keep = (n: string) => channels.includes(n);
    content = { ...content,
      ...(Array.isArray(content.cadence) ? { cadence: content.cadence.filter((c) => keep(c.network)) } : {}),
      ...(Array.isArray(content.series) ? { series: content.series.map((s) => ({ ...s, networks: (s.networks ?? []).filter(keep) })).filter((s) => s.networks.length) } : {}) };
  }
  return { ...p, content };
}
