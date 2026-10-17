import { apiJson, withApi } from "@/lib/api/auth";

export const dynamic = "force-dynamic";

/** Which key is calling and what it may do. */
export const GET = withApi(async (_req, ctx) => apiJson({
  key: { id: ctx.key.id, name: ctx.key.name }, agency_id: ctx.key.agencyId,
  permissions: { read: true, write_drafts: true, generate: true, schedule_or_publish: ctx.key.canPublish },
}));
