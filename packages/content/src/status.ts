import { startOfWeek } from "./calendar";
export const STATUSES = ["idea", "draft", "approved", "scheduled", "publishing", "published", "failed"] as const;
export type Status = (typeof STATUSES)[number];
export type Role = "admin" | "team" | "client";

/**
 * Which status changes a person may make. Mirrors the database trigger (the database is the real enforcement; this drives the UI).
 * Clients approve a draft or send an approved post back for changes. Staff move posts through the workflow; "publishing"
 * and "failed" belong to the publisher, never to a person.
 */
export function allowedStatusChanges(role: Role, from: Status): Status[] {
  if (role === "client") return from === "draft" ? ["approved"] : from === "approved" ? ["draft"] : [];
  const manual: Status[] = ["idea", "draft", "approved", "scheduled", "published"];
  return manual.filter((s) => s !== from);
}
/** Editing the substance of an approved post sends it back to draft (the database does this too). */
export const editingResetsApproval = (status: Status) => status === "approved";

/**
 * Whether a post may still be deleted: never once it is published (or being published), and never in a past week, which
 * stays as the record. This week, future weeks and posts without a date can go. `today` is the client's local date.
 */
export function canDeletePost(p: { status: string; planned_date: string | null }, today: string): boolean {
  if (p.status === "published" || p.status === "publishing") return false;
  return !p.planned_date || p.planned_date >= startOfWeek(today);
}
