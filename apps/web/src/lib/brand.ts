/** Shared branding vocabularies (a "use server" module may only export async functions, so these live here). */
export const PALETTE_ROLES = ["primary", "secondary", "accent", "background", "text", "highlight", "other"] as const;
export const REFERENCE_KINDS = ["style", "product", "people", "place", "avoid"] as const;
export const MAX_REFERENCES = 40;
