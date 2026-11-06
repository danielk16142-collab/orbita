import { NETWORKS, POST_TYPES } from "@orbita/content";
import { NETWORK_LABEL } from "@/components/posts/shared";

/** Requests other screens can prepare for the chat. Only known keys are accepted; the text comes from our translations. */
export const ASKS = ["strategy", "research", "competitors", "audit", "recommend", "draft", "competitor", "winner"] as const;
export type AskQuery = { ask?: string; format?: string; network?: string; idea?: string; /** "new", or a past thread id to read */ thread?: string; /** Strategy Map month, YYYY-MM */ month?: string; /** Strategy view: mind (default) or calendar */ layout?: string };
type T = (key: string, values?: Record<string, string>) => string;

/** A competitor's recorded post, loaded by the page when "Make our version" sends its id. */
export type WinnerPost = { hook: string; caption: string | null; transcript: string | null; network: string; views: number | null; competitor: string | null; formula: string | null };

const flat = (s: string | null | undefined, max: number) => (s ?? "").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim().slice(0, max);

/** "Make our version": the competitor's actual post goes into the request, so the agent adapts THAT post (not just its hook pattern). */
export function winnerPostText(w: WinnerPost, t: T): string {
  const lines = [
    t("asks.winnerPost", { network: NETWORK_LABEL[w.network] ?? w.network, competitor: w.competitor || "?" }),
    "",
    `${t("asks.theirHook")}: "${flat(w.hook, 300)}"${w.formula ? ` (${w.formula})` : ""}`,
  ];
  if (w.caption?.trim()) lines.push("", `${t("asks.theirCaption")}:`, flat(w.caption, 1800));
  if (w.transcript?.trim()) lines.push("", `${t("asks.theirTranscript")}:`, flat(w.transcript, 4500));
  else lines.push("", t("asks.noTranscript"));
  return lines.join("\n").slice(0, 7900);
}

export function askText(q: AskQuery, t: T, tPosts: T, winner?: WinnerPost | null): string {
  if (!(ASKS as readonly string[]).includes(q.ask ?? "")) return "";
  if (q.ask === "competitor") return t("asks.competitor", { name: (q.idea ?? "").replace(/\s+/g, " ").trim().slice(0, 120) || "?" });
  if (q.ask === "winner" && winner) return winnerPostText(winner, t);
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
