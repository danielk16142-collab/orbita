// Lists unresolved [[PLACEHOLDER]] markers in legal documents.
// `node scripts/legal-check.mjs --strict` exits 1 if any remain: run it before a production release.
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
const root = path.join(process.cwd(), "content", "legal");
const found = new Map();
(function walk(dir) {
  for (const f of readdirSync(dir)) {
    const p = path.join(dir, f);
    if (statSync(p).isDirectory()) { walk(p); continue; }
    for (const m of readFileSync(p, "utf8").matchAll(/\[\[([A-Z_]+)[^\]]*\]\]/g)) found.set(m[1], (found.get(m[1]) ?? 0) + 1);
  }
})(root);
if (found.size === 0) { console.log("No placeholders left."); process.exit(0); }
console.log("Unresolved placeholders:"); for (const [k, n] of found) console.log(`  ${k} x${n}`);
process.exit(process.argv.includes("--strict") ? 1 : 0);
