import { NETWORKS, POST_TYPES } from "@orbita/content";
import { NETWORK_LABEL } from "@/components/posts/shared";

/** Requests other screens can prepare for the chat. Only known keys are accepted; the text comes from our translations. */
export const ASKS = ["strategy", "research", "competitors", "audit", "recommend", "draft", "competitor", "winner"] as const;
export type AskQuery = { ask?: string; format?: string; network?: string; idea?: string; /** "new", or a past thread id to read */ thread?: string; /** Strategy Map month, YYYY-MM */ month?: string; /** Strategy view: mind (default) or calendar */ layout?: string };
type T = (key: string, values?: Record<string, string>) => string;

export function askText(q: AskQuery, t: T, tPosts: T): string {
  if (!(ASKS as readonly string[]).includes(q.ask ?? "")) return "";
  if (q.ask === "competitor") return t("asks.competitor", { name: (q.idea ?? "").replace(/\s+/g, " ").trim().slice(0, 120) || "?" });
  if (q.ask === "winner") {
    const [hook, formula] = (q.idea ?? "").split("‖").map((x) => x.replace(/\s+/g, " ").trim().slice(0, 300));
    return t(formula ? "asks.winnerFormula" : "asks.winner", { hook: hook || "?", formula: formula ?? "" });
  }
  if (q.ask !== "draft") return t(`asks.${q.ask}`);
  const format = (POST_TYPES as readonly string[]).includes(q.format ?? "") ? tPosts(`formats.${q.format}`) : tPosts("formats.post");
  const networks = (q.network ?? "").split(",").filter((n) => (NETWORKS as readonly string[]).includes(n));
  const where = networks.length ? networks.map((n) => NETWORK_LABEL[n] ?? n).join(", ") : "Instagram";
  const idea = (q.idea ?? "").replace(/\s+/g, " ").trim().slice(0, 500);
  return t(idea ? "asks.draftAbout" : "asks.draft", { format, where, idea });
}
