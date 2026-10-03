/** Identify an upload by its magic bytes, never by the file name or the browser-supplied type. */
export type ImageKind = "png" | "jpeg" | "webp";

export const MAX_LOGO_BYTES = 1_048_576; // 1 MB

export function sniffImage(buf: Uint8Array): ImageKind | null {
  const b = buf;
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 && b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a) return "png";
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "jpeg";
  if (b.length >= 12 && String.fromCharCode(...b.slice(0, 4)) === "RIFF" && String.fromCharCode(...b.slice(8, 12)) === "WEBP") return "webp";
  return null; // SVG, GIF, HTML, and anything else are rejected
}

export function validateLogoUpload(buf: Uint8Array): "empty" | "too-large" | "unsupported" | null {
  if (buf.length === 0) return "empty";
  if (buf.length > MAX_LOGO_BYTES) return "too-large";
  return sniffImage(buf) ? null : "unsupported";
}
