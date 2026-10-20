import { unzipSync } from "fflate";

export const MAX_PAGES = 12;
export const MAX_FILE_BYTES = 15 * 1024 * 1024;
const PNG = [0x89, 0x50, 0x4e, 0x47];

export type Page = { page: number; bytes: Uint8Array };
const isPng = (b: Uint8Array) => PNG.every((v, i) => b[i] === v);

/**
 * Pulls the page images out of an export. A one-page export is a PNG; several pages arrive as a zip of page-N.png.
 * Hard limits on count and size, only PNG signatures accepted, and entry names are never used as paths.
 */
export function extractPages(bytes: Uint8Array, format: string | null): Page[] {
  if (bytes.byteLength > MAX_PAGES * MAX_FILE_BYTES) throw new Error("export too large");
  if (isPng(bytes)) return [{ page: 1, bytes }];
  if (format !== "zip" && !(bytes[0] === 0x50 && bytes[1] === 0x4b)) throw new Error("unexpected export format");
  const files = unzipSync(bytes, { filter: (f) => /^(?:[^/\\]*\/)?page-\d{1,3}\.png$/i.test(f.name) && f.originalSize <= MAX_FILE_BYTES });
  const pages: Page[] = [];
  for (const [name, data] of Object.entries(files)) {
    const n = Number(/page-(\d{1,3})\.png$/i.exec(name)?.[1]);
    if (!n || !isPng(data) || data.byteLength > MAX_FILE_BYTES) continue;
    pages.push({ page: n, bytes: data });
  }
  pages.sort((a, b) => a.page - b.page);
  if (!pages.length) throw new Error("no pages in export");
  if (pages.length > MAX_PAGES) throw new Error("too many pages");
  return pages;
}
