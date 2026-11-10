/** Content languages. Each language has its own strategy and its own calendar view. */
export const CONTENT_LANGUAGES = ["en", "fr", "es"] as const;
export type ContentLanguage = (typeof CONTENT_LANGUAGES)[number];
export const isContentLanguage = (x: unknown): x is ContentLanguage => x === "en" || x === "fr" || x === "es";

/** The language a strategy or calendar view is in: the one asked for if valid, else the client's first language, else English. */
export function strategyLanguage(asked: string | null | undefined, clientLanguages: readonly string[] | null | undefined): ContentLanguage {
  return isContentLanguage(asked) ? asked : isContentLanguage(clientLanguages?.[0]) ? clientLanguages[0] as ContentLanguage : "en";
}

/** The languages to offer as tabs: the client's own first (in their order), then the others. */
export function languageTabs(clientLanguages: readonly string[] | null | undefined): ContentLanguage[] {
  const own = (clientLanguages ?? []).filter(isContentLanguage);
  return [...own, ...CONTENT_LANGUAGES.filter((l) => !own.includes(l))];
}
