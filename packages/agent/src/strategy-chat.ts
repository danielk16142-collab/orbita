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
