import type { BrandFocus } from "./focus";
/**
 * The strategy chat: a box on the Strategy section where the person types what to change ("more reels, drop LinkedIn",
 * or a pasted strategy). The agent answers with the FULL updated strategy (propose_strategy) and the server applies it
 * right away: the previous strategy is kept (inactive) and can be restored.
 */
export const STRATEGY_CHAT_TOOLS = ["get_brief", "get_account_analytics", "propose_strategy"];

export function strategyChatFocus(hasStrategy: boolean) {
  return `\n\n## This conversation: the strategy
You are editing this client's content strategy in the Strategy section. ${hasStrategy ? "The active strategy is above." : "There is no active strategy yet: build one from the brand profile, goals and research."}
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
export function focusBuildRequest(f: BrandFocus, hasStrategy: boolean): string {
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
  return L.join("\n");
}

/** The strategy keeps exactly the chosen pillars and shares, whatever the model wrote (its angle is kept when none was chosen). */
export function alignStrategyToFocus(payload: unknown, f: BrandFocus): unknown {
  const p = payload as { content?: { pillars?: { name: string; angle: string; share_percent: number }[] } } | null;
  if (!p?.content || !f.pillars.length) return payload;
  const theirs = p.content.pillars ?? [];
  const pillars = f.pillars.filter((x) => x.name.trim()).map((x) => ({
    name: x.name, share_percent: x.share,
    angle: x.angle || theirs.find((t) => t.name.trim().toLowerCase() === x.name.trim().toLowerCase())?.angle || "",
  }));
  return { ...p, content: { ...p.content, pillars } };
}
