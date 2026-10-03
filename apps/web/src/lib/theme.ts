import { HEX, readableOn } from "@orbita/security/color";

export { contrastRatio, readableOn } from "@orbita/security/color";

/** Client branding -> CSS variable overrides for the portal. Picks readable text on the brand color. */
export function themeVars(branding: { primary?: string | null; accent?: string | null }) {
  const vars: Record<string, string> = {};
  if (branding.primary && HEX.test(branding.primary)) {
    vars["--brand"] = branding.primary;
    vars["--brand-ink"] = readableOn(branding.primary);
  }
  if (branding.accent && HEX.test(branding.accent)) vars["--brand-soft"] = branding.accent;
  return vars;
}
