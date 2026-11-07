/**
 * The 21 LinkedIn hook formulas from linkedin-agent-skill (Jake Schincariol, MIT, data in data/hooks.json, unchanged).
 * They have no matching patterns upstream: the agent picks three that fit an idea, it does not classify.
 */
import hooksData from "./data/hooks.json";

export type LinkedInFormula = { id: number; name: string; template: string; example: string; best_for: string; trap: string };
export const LI_HOOK_FORMULAS = (hooksData as unknown as { hooks: LinkedInFormula[] }).hooks;
export const LI_HOOK_RULES = (hooksData as unknown as { rules: string[] }).rules;
