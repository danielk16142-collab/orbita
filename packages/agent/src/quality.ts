/** Numbers that look like claims. Years (1900-2100) and tiny bare integers are ignored. */
const NUM = /\d[\d.,]*\s?%?/g;

const norm = (s: string) => s.replace(/[\s,]/g, "").replace(/\.$/, "");

/**
 * Returns statistics in `text` that do not appear in any approved claim. Content must only use
 * statistics from the client's approved list (see client-content-engine, step 8).
 */
export function findUnapprovedStats(text: string, approvedClaims: string[]): string[] {
  const approved = approvedClaims.map((c) => (c.match(NUM) ?? []).map(norm)).flat();
  const found = new Set<string>();
  for (const m of text.match(NUM) ?? []) {
    const n = norm(m);
    const digits = n.replace(/\D/g, "");
    const isYear = /^(19|20|21)\d{2}$/.test(digits) && !n.includes("%");
    const trivial = digits.length < 2 && !n.includes("%");
    if (isYear || trivial) continue;
    if (!approved.includes(n)) found.add(m.trim());
  }
  return [...found];
}
