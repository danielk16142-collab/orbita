/**
 * Brand colours from a website: the colours its own CSS repeats (inline styles, <style> blocks, theme-color), ignoring
 * greys, near-white and near-black. Most-used first; colours too close to one already picked are merged.
 */
const hex2 = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0");
export function normalizeColor(raw: string): string | null {
  const s = raw.trim().toLowerCase();
  let m = /^#([0-9a-f]{3})$/.exec(s);
  if (m) return `#${[...m[1]].map((c) => c + c).join("")}`;
  m = /^#([0-9a-f]{6})(?:[0-9a-f]{2})?$/.exec(s);
  if (m) return `#${m[1]}`;
  const rgb = /^rgba?\(\s*(\d{1,3})[\s,]+(\d{1,3})[\s,]+(\d{1,3})(?:[\s,/]+([\d.]+%?))?\s*\)$/.exec(s);
  if (rgb) { if (rgb[4] && parseFloat(rgb[4]) < (rgb[4].endsWith("%") ? 50 : 0.5)) return null; return `#${hex2(+rgb[1])}${hex2(+rgb[2])}${hex2(+rgb[3])}`; }
  return null;
}
const rgbOf = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
function hsl(h: string) {
  const [r, g, b] = rgbOf(h); const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2;
  const s = max === min ? 0 : l > 0.5 ? (max - min) / (2 - max - min) : (max - min) / (max + min);
  return { s, l };
}
const distance = (a: string, b: string) => { const x = rgbOf(a), y = rgbOf(b); return Math.sqrt(x.reduce((n, v, i) => n + (v - y[i]) ** 2, 0)) * 255; };

/** Candidate brand colours, best first. `css` is every bit of CSS text found on the page; themeColor weighs more. */
export function pickBrandColors(css: string, themeColor?: string | null, max = 4): string[] {
  const counts = new Map<string, number>();
  const add = (raw: string, w: number) => { const c = normalizeColor(raw); if (!c) return; const { s, l } = hsl(c); if (s < 0.25 || l < 0.12 || l > 0.9) return; counts.set(c, (counts.get(c) ?? 0) + w); };
  for (const m of css.matchAll(/#[0-9a-fA-F]{3}(?:[0-9a-fA-F]{3}(?:[0-9a-fA-F]{2})?)?\b|rgba?\([^)]{5,40}\)/g)) add(m[0], 1);
  if (themeColor) add(themeColor, 5);
  const out: string[] = [];
  for (const [c] of [...counts].sort((a, b) => b[1] - a[1])) { if (out.every((o) => distance(o, c) > 40)) out.push(c); if (out.length >= max) break; }
  return out;
}
