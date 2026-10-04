export const NETWORK_COLOR: Record<string, string> = { instagram: "var(--series-1)", tiktok: "var(--series-2)", linkedin: "var(--series-3)", youtube: "var(--series-4)", facebook: "var(--series-5)" };
export const NETWORK_LABEL: Record<string, string> = { instagram: "Instagram", tiktok: "TikTok", linkedin: "LinkedIn", youtube: "YouTube", facebook: "Facebook" };

export type CalPost = {
  id: string; client_id: string; network: string; type: string; status: string; planned_date: string | null; suggested_time: string | null;
  idea: string | null; caption: string | null; clients?: { name: string } | null;
};
export const postTitle = (p: Pick<CalPost, "idea" | "caption">, max = 60) => ((p.idea || p.caption || "").replace(/\s+/g, " ").trim() || "—").slice(0, max);
