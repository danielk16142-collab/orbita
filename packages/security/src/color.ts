/** WCAG color helpers shared by the client branding UI and server-side validation. */
export const HEX = /^#[0-9a-fA-F]{6}$/;

export function luminance(hex: string): number {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}

export function contrastRatio(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

/** Ink or white, whichever reads better on `bg`. */
export function readableOn(bg: string): "#0a0a0a" | "#ffffff" {
  return contrastRatio(bg, "#0a0a0a") >= contrastRatio(bg, "#ffffff") ? "#0a0a0a" : "#ffffff";
}

/** A brand color is usable if text on it reaches WCAG AA (4.5:1). Returns an error code or null. */
export function checkBrandColor(hex: string): "invalid" | "low-contrast" | null {
  if (!HEX.test(hex)) return "invalid";
  return contrastRatio(hex, readableOn(hex)) >= 4.5 ? null : "low-contrast";
}
