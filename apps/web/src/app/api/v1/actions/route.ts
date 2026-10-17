import { apiJson, withApi } from "@/lib/api/auth";
import { actionCatalog } from "@/lib/api/actions";

export const dynamic = "force-dynamic";

/** Everything the key can do in the app, with the input each action takes. Run one with POST /actions/{name}. */
export const GET = withApi(async () => apiJson({ actions: actionCatalog() }));
