/** Files that can be uploaded onto a post, and the check that decides whether a stored file really is one. */
export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;
export const MAX_MEDIA_PER_POST = 12;
export type MediaExt = "png" | "jpg" | "webp" | "mp4" | "mov";
export const MEDIA_TYPES: Record<string, { ext: MediaExt; kind: "image" | "video" }> = {
  "image/png": { ext: "png", kind: "image" }, "image/jpeg": { ext: "jpg", kind: "image" }, "image/webp": { ext: "webp", kind: "image" },
  "video/mp4": { ext: "mp4", kind: "video" }, "video/quicktime": { ext: "mov", kind: "video" },
};
export const kindOfExt = (ext: MediaExt): "image" | "video" => (ext === "mp4" || ext === "mov" ? "video" : "image");

const at = (b: Uint8Array, i: number, s: string) => [...s].every((c, k) => b[i + k] === c.charCodeAt(0));

/** What a file really is, from its first bytes (a client-declared type is never trusted). null = not an allowed type. */
export function sniffMedia(b: Uint8Array): MediaExt | null {
  if (b.length >= 4 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "png";
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "jpg";
  if (b.length >= 12 && at(b, 0, "RIFF") && at(b, 8, "WEBP")) return "webp";
  if (b.length >= 12 && at(b, 4, "ftyp")) return at(b, 8, "qt  ") ? "mov" : "mp4";
  return null;
}

/** Storage path of an upload for a post: {client}/{post}/upload-{uuid}.{ext}. */
export const uploadPathPattern = (clientId: string, postId: string) =>
  new RegExp(`^${clientId}/${postId}/upload-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\\.(png|jpg|webp|mp4|mov)$`);
