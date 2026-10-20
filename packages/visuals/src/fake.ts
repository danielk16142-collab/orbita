import { StartRequest, TaskView, VisualError, type VisualProvider } from "./types";

/** Deterministic stand-in for development and tests. Never enabled in production. */
export const fakeVisualsEnabled = () => process.env.VISUALS_FAKE === "1" && process.env.NODE_ENV !== "production";

export function createFakeProvider(opts: { polls?: number } = {}): VisualProvider & { started: StartRequest[] } {
  const started: StartRequest[] = []; const polls = new Map<string, { n: number; pages: number }>();
  const need = opts.polls ?? 2;
  if (process.env.NODE_ENV === "production") throw new VisualError("not_configured", "fake provider is not available in production");
  return {
    started,
    async startTask(req) {
      started.push(req); const id = `task_FAKE${String(started.length).padStart(10, "0")}`; polls.set(id, { n: 0, pages: req.pages });
      return { id, status: "queued", percent: 0, retryAfterMs: 50, credits: null, exportUrl: null, exportFormat: null, pageCount: null, errorCode: null };
    },
    async getTask(id): Promise<TaskView> {
      const p = polls.get(id); if (!p) throw new VisualError("invalid_request", "unknown task");
      p.n++;
      if (p.n < need) return { id, status: "running", percent: Math.round((p.n / need) * 100), retryAfterMs: 50, credits: null, exportUrl: null, exportFormat: null, pageCount: null, errorCode: null };
      return { id, status: "succeeded", percent: 100, retryAfterMs: null, credits: 12, exportUrl: `https://fake.invalid/${id}.${p.pages > 1 ? "zip" : "png"}`, exportFormat: p.pages > 1 ? "zip" : "png", pageCount: p.pages, errorCode: null };
    },
  };
}
