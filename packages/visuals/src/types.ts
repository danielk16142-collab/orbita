/** Provider-neutral types for visual creation. Moda is the first provider; others can implement VisualProvider. */
export type VisualFormat = "static" | "carousel";
export type TaskStatus = "queued" | "running" | "succeeded" | "failed" | "canceled" | "expired";

export type StartRequest = {
  prompt: string;
  format: VisualFormat;
  pages: number;              // 1 for a static post, the number of slides for a carousel
  brandKitId?: string | null;
  idempotencyKey: string;
};
export type TaskView = {
  id: string;
  status: TaskStatus;
  percent: number | null;
  retryAfterMs: number | null;
  credits: number | null;
  exportUrl: string | null;   // signed, short-lived download URL (png for one page, zip for several)
  exportFormat: string | null;
  pageCount: number | null;
  errorCode: string | null;   // our own code, never provider text
};
export interface VisualProvider {
  startTask(req: StartRequest): Promise<TaskView>;
  getTask(id: string): Promise<TaskView>;
}

/** Stable, secret-free error codes. The browser only ever sees these. */
export type VisualErrorCode = "not_configured" | "insufficient_credits" | "rate_limited" | "invalid_request" | "auth" | "failed";
export class VisualError extends Error {
  constructor(public code: VisualErrorCode, message: string, public retryAfterSec?: number, public status?: number, public providerType?: string, public requestId?: string) { super(message); this.name = "VisualError"; }
}
