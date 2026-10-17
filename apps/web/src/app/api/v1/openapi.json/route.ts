import { openApiSpec } from "@/lib/api/openapi";

export const dynamic = "force-dynamic";

/** The API description (public: it contains no data). */
export function GET() {
  return new Response(JSON.stringify(openApiSpec((process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/$/, "")), null, 2), { headers: { "Content-Type": "application/json", "Cache-Control": "public, max-age=300" } });
}
