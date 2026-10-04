export const LOCALES = ["en", "fr", "es"] as const;
export type Locale = (typeof LOCALES)[number];

export const NETWORKS = ["instagram", "tiktok", "linkedin", "youtube", "facebook"] as const;
export type Network = (typeof NETWORKS)[number];

export const SOURCE_KINDS = ["website", ...NETWORKS, "other"] as const;
export type SourceKind = (typeof SOURCE_KINDS)[number];

export const MEMORY_KINDS = ["preference", "rule", "fact", "example", "avoid"] as const;
export type MemoryKind = (typeof MEMORY_KINDS)[number];

export const CONTENT_FORMATS = ["reel", "carousel", "static"] as const;
export type ContentFormat = (typeof CONTENT_FORMATS)[number];
export const RESEARCH_KINDS = ["trend", "competitor", "audience", "idea"] as const;
export type ResearchKind = (typeof RESEARCH_KINDS)[number];

export const DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
export type Day = (typeof DAYS)[number];

/** Brief sections the interview fills in. Text sections hold prose; list sections hold short items. */
export const TEXT_SECTIONS = ["business", "goals", "offers", "voice", "restrictions", "competitors", "channels"] as const;
export const LIST_SECTIONS = ["personas", "objections", "pillars"] as const;
export const BRIEF_SECTIONS = [...TEXT_SECTIONS, ...LIST_SECTIONS] as const;
export type BriefSection = (typeof BRIEF_SECTIONS)[number];

/** Flattened brief as the agent sees it. */
export type BriefData = Partial<Record<(typeof TEXT_SECTIONS)[number], string>> & Partial<Record<(typeof LIST_SECTIONS)[number], string[]>>;

export type Memory = { id?: string; kind: MemoryKind; content: string; weight: number; createdAt: string };
export type Source = { id?: string; kind: SourceKind; url?: string | null; handle?: string | null };

export type AuditReport = {
  summary: string; strengths: string[]; weaknesses: string[]; opportunities: string[]; social_notes: string; missing_info: string[];
};

export type PlanItem = {
  day: Day; network: Network; format: string; pillar: string; idea: string; caption: string; language: Locale; time: string; why: string;
};
