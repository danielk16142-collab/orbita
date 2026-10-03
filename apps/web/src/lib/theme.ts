/** Client branding -> CSS variable overrides for the portal. Picks readable text on the brand color. */
const HEX = /^#[0-9a-fA-F]{6}$/;

function luminance(hex: string) {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
export function contrastRatio(a: string, b: string) {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}
/** Ink or white, whichever reads better on `bg`. */
export function readableOn(bg: string) {
  return contrastRatio(bg, "#0a0a0a") >= contrastRatio(bg, "#ffffff") ? "#0a0a0a" : "#ffffff";
}
export function themeVars(branding: { primary?: string | null; accent?: string | null }) {
  const vars: Record<string, string> = {};
  if (branding.primary && HEX.test(branding.primary)) {
    vars["--brand"] = branding.primary;
    vars["--brand-ink"] = readableOn(branding.primary);
  }
  if (branding.accent && HEX.test(branding.accent)) vars["--brand-soft"] = branding.accent;
  return vars;
}
