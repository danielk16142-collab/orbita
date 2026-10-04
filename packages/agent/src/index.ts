export * from "./types";
export * from "./brief";
export * from "./completeness";
export * from "./memory";
export * from "./untrusted";
export * from "./prompt";
export * from "./proposals";
export * from "./tools";
export * from "./loop";
export * from "./quality";
export { fetchPage } from "./site";
export type { SiteSnapshot } from "./site";

/** Week that plans are for: this Monday Mon-Thu, next Monday Fri-Sun (people plan ahead at the end of the week). */
export function planningWeekStart(today: Date = new Date()): string {
  const d = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  const dow = (d.getUTCDay() + 6) % 7; // Mon=0
  d.setUTCDate(d.getUTCDate() - dow + (dow >= 4 ? 7 : 0));
  return d.toISOString().slice(0, 10);
}
export * from "./decide";
export * from "./analytics";
