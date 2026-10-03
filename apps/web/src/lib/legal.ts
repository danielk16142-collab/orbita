import { readFile } from "node:fs/promises";
import path from "node:path";

/** Slugs double as file names under content/legal/<locale>/. Keep in sync with the legal_document enum. */
export const LEGAL_DOCS = [
  "privacy-policy", "terms-of-service", "cookie-policy", "acceptable-use",
  "data-processing-agreement", "subprocessors", "data-deletion",
] as const;
export type LegalDoc = (typeof LEGAL_DOCS)[number];

export function isLegalDoc(s: string): s is LegalDoc { return (LEGAL_DOCS as readonly string[]).includes(s); }

/**
 * Loads the document in the user's language; falls back to English with `translated: false`
 * so the page can say the English text prevails. Slug is validated against the allowlist,
 * so it can never traverse the filesystem.
 */
export async function loadLegal(locale: string, doc: LegalDoc) {
  const root = path.join(process.cwd(), "content", "legal");
  for (const l of locale === "en" ? ["en"] : [locale, "en"]) {
    try { return { body: await readFile(path.join(root, l, `${doc}.md`), "utf8"), translated: l === locale }; } catch { /* try next */ }
  }
  return null;
}
