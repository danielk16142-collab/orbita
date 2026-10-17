import { apiAudit, apiError, apiJson, body, withApi } from "@/lib/api/auth";
import { API_ACTIONS, runApiAction } from "@/lib/api/actions";

export const runtime = "nodejs";
export const maxDuration = 300;
export const dynamic = "force-dynamic";

/** Run one app action (see GET /actions) as this key's team member. The body is the action's input as JSON. */
export const POST = withApi<{ name: string }>(async (req, ctx, { name }) => {
  const action = Object.hasOwn(API_ACTIONS, name) ? API_ACTIONS[name] : undefined;
  if (!action) return apiError("unknown_action", 404, "See GET /api/v1/actions for the list.");
  const input = await body(req);
  if (!input || typeof input !== "object" || Array.isArray(input)) return apiError("bad_request", 400, "Send the input as a JSON object.");
  const out = await runApiAction(name, action, input as Record<string, unknown>, ctx, new URL(req.url).origin);
  await apiAudit(ctx, "api.action", { entity: "client", entityId: /^[0-9a-f-]{36}$/i.test(String((input as { clientId?: unknown }).clientId)) ? String((input as { clientId?: unknown }).clientId) : undefined, meta: { name, status: out.status } });
  return apiJson(out.body, out.status);
});
