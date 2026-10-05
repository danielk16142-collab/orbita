// Builds the web logo assets from the original SVG in brand/source (run from the repo root: node scripts/make-brand-assets.mjs).
// - drops the full-canvas white background and the C2PA metadata block (the original file stays untouched)
// - turns the letter "holes" (drawn as white shapes) into real transparent holes, so the logo works on any background
// - writes: full logo (dark wordmark), full logo (light wordmark for the dark sidebar), icon-only mark, PNGs for emails and the home screen
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";

const SRC = "brand/source/orbita-logo-original.svg";
const OUT = "apps/web/public/brand";
const sharp = createRequire(new URL("../apps/web/package.json", import.meta.url))("sharp");

const raw = readFileSync(SRC, "utf8").replace(/<metadata>[\s\S]*?<\/metadata>/g, "");
const paths = [...raw.matchAll(/<path fill="([^"]+)" d="([^"]+)"\/>/g)].map((m) => {
  const n = m[2].match(/-?\d+\.?\d*/g).map(Number);
  const xs = n.filter((_, i) => i % 2 === 0), ys = n.filter((_, i) => i % 2 === 1);
  return { fill: m[1], d: m[2], x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
});
const body = paths.slice(1); // path 0 is the white canvas
const ICON_MAX_X = 485;      // the icon ends at x=478, the lettering starts at x=499
const icon = body.filter((p) => p.x1 <= ICON_MAX_X);
const word = body.filter((p) => p.x0 > ICON_MAX_X);

// In the lettering, light-colored shapes are counters (the inside of o, b, a ...): merge each into the dark shape that contains it.
const isDark = (p) => p.fill === "#111";
const letters = word.filter(isDark).map((p) => ({ ...p, holes: [] }));
for (const c of word.filter((p) => !isDark(p))) {
  const host = letters.filter((l) => c.x0 >= l.x0 && c.x1 <= l.x1 && c.y0 >= l.y0 && c.y1 <= l.y1).sort((a, b) => (a.x1 - a.x0) * (a.y1 - a.y0) - (b.x1 - b.x0) * (b.y1 - b.y0))[0];
  if (host) host.holes.push(c.d);
}
const wordPath = (l, fill) => `<path fill="${fill}" fill-rule="evenodd" d="${[l.d, ...l.holes].join(" ")}"/>`;
const iconPath = (p, shadow) => `<path fill="${p.fill === "#111" ? shadow : p.fill}" d="${p.d}"/>`;

const box = (items, pad) => {
  const x0 = Math.min(...items.map((p) => p.x0)) - pad, x1 = Math.max(...items.map((p) => p.x1)) + pad;
  const y0 = Math.min(...items.map((p) => p.y0)) - pad, y1 = Math.max(...items.map((p) => p.y1)) + pad;
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
};
const svg = (b, inner, title) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${b.x.toFixed(1)} ${b.y.toFixed(1)} ${b.w.toFixed(1)} ${b.h.toFixed(1)}" role="img" aria-label="${title}"><title>${title}</title>${inner}</svg>\n`;

const DARK = "#111111", CREAM = "#F4F1EC";
const full = box([...icon, ...word], 8);
const mark = (() => { const b = box(icon, 0), s = Math.max(b.w, b.h) + 16; return { x: b.x + b.w / 2 - s / 2, y: b.y + b.h / 2 - s / 2, w: s, h: s }; })();
const logoDark = svg(full, icon.map((p) => iconPath(p, DARK)).join("") + letters.map((l) => wordPath(l, DARK)).join(""), "Orbita");
const logoLight = svg(full, icon.map((p) => iconPath(p, CREAM)).join("") + letters.map((l) => wordPath(l, CREAM)).join(""), "Orbita");
const markSvg = svg(mark, icon.map((p) => iconPath(p, DARK)).join(""), "Orbita");

mkdirSync(OUT, { recursive: true });
writeFileSync(`${OUT}/orbita-logo.svg`, logoDark);
writeFileSync(`${OUT}/orbita-logo-light.svg`, logoLight);
writeFileSync(`${OUT}/orbita-mark.svg`, markSvg);
writeFileSync("apps/web/src/app/icon.svg", markSvg);

// PNGs: the full logo for emails (transparent), the home-screen icon (the mark on cream, padded, since iOS does not allow transparency)
await sharp(Buffer.from(logoDark), { density: 300 }).resize({ width: 560 }).png().toFile(`${OUT}/orbita-logo.png`);
const ico = await sharp(Buffer.from(markSvg), { density: 400 }).resize(124, 124).png().toBuffer();
await sharp({ create: { width: 180, height: 180, channels: 4, background: CREAM } }).composite([{ input: ico, gravity: "center" }]).png().toFile("apps/web/src/app/apple-icon.png");
console.log("done: icon paths", icon.length, "letter paths", letters.length, "holes", letters.reduce((n, l) => n + l.holes.length, 0));
