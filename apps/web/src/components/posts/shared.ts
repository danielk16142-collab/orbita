export const NETWORK_COLOR: Record<string, string> = { instagram: "var(--series-1)", tiktok: "var(--series-2)", linkedin: "var(--series-3)", youtube: "var(--series-4)", facebook: "var(--series-5)" };
export const NETWORK_LABEL: Record<string, string> = { instagram: "Instagram", tiktok: "TikTok", linkedin: "LinkedIn", youtube: "YouTube", facebook: "Facebook" };

export type CalPost = {
  id: string; client_id: string; network: string; type: string; status: string; planned_date: string | null; suggested_time: string | null;
  idea: string | null; caption: string | null; clients?: { name: string } | null;
};
export const postTitle = (p: Pick<CalPost, "idea" | "caption">, max = 60) => ((p.idea || p.caption || "").replace(/\s+/g, " ").trim() || "—").slice(0, max);

type T = { (key: string): string; has: (key: string) => boolean };
/** A failed post action as the person reads it: the message for its code, then what actually went wrong. */
export const postError = (t: T, r: { error?: string; detail?: string }) => {
  const code = r.error ?? "generic";
  const msg = t.has(`errors.${code}`) ? t(`errors.${code}`) : t("errors.generic");
  return r.detail ? `${msg} (${r.detail})` : msg;
};
