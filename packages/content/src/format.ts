import { POST_TYPES } from "./schemas";

/**
 * The format of a post as one of POST_TYPES. Posts planned by the agent keep the format as it wrote it ("text post", "Short video"),
 * so labels, the editor and the agent need one normalised key.
 */
export function formatKey(type: string | null | undefined): (typeof POST_TYPES)[number] {
  const t = (type ?? "").toLowerCase().trim();
  if ((POST_TYPES as readonly string[]).includes(t)) return t as (typeof POST_TYPES)[number];
  if (/article|blog|newsletter/.test(t)) return "article";
  if (/carousel|swipe/.test(t)) return "carousel";
  if (/reel|short/.test(t)) return "reel";
  if (/story|stories/.test(t)) return "story";
  if (/video/.test(t)) return "video";
  if (/static|image|photo|graphic|single/.test(t)) return "static";
  if (/text/.test(t)) return "text";
  return "post";
}
