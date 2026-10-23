import type { UsagePayload } from "../../shared/usage";
import { usagePayloadSchema } from "../../shared/usage-schema";
import { verifyAccessJwt } from "./auth";
import {
  getDefaultCache,
  loadCachedJson,
  type ResponseCache,
} from "./cache";
import { collectUsage } from "./usage";

const USAGE_SNAPSHOT_CACHE_TTL_SECONDS = 2 * 60;

const SECURITY_HEADERS = {
  "Cache-Control": "no-store",
  "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
} as const;

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const origin = request.headers.get("Origin");

    if (url.pathname !== "/health" && url.pathname !== "/v1/usage") {
      return jsonResponse({ error: "Not found" }, 404);
    }

    if (origin && origin !== url.origin) {
      return jsonResponse({ error: "仅允许同源请求" }, 403);
    }

    if (request.method !== "GET") {
      const response = jsonResponse({ error: "Method not allowed" }, 405);
      response.headers.set("Allow", "GET");
      return response;
    }

    if (url.pathname === "/health") {
      return jsonResponse({ ok: true, service: "cloudflare-usage-api" }, 200);
    }

    if (!(await verifyAccessJwt(request, env.TEAM_DOMAIN, env.POLICY_AUD))) {
      return jsonResponse({ error: "Cloudflare Access 身份无效" }, 403);
    }

    try {
      const payload = await loadUsageSnapshot(request, env);
      return jsonResponse(payload, 200);
    } catch (error) {
      console.error(
        JSON.stringify({
          event: "usage_collection_failed",
          error_name: error instanceof Error ? error.name : "UnknownError",
        }),
      );
      return jsonResponse({ error: "暂时无法生成用量快照" }, 502);
    }
  },
} satisfies ExportedHandler<Env>;

export async function loadUsageSnapshot(
  request: Request,
  env: Pick<Env, "CF_ACCOUNT_ID" | "CF_API_TOKEN">,
  cache: ResponseCache | null = getDefaultCache(),
): Promise<UsagePayload> {
  const origin = new URL(request.url).origin;
  return loadCachedJson({
    cache,
    key: new URL(
      `/__internal/cache/v2/usage/${encodeURIComponent(env.CF_ACCOUNT_ID)}`,
      origin,
    ).toString(),
    source: "usage_snapshot",
    ttlSeconds: USAGE_SNAPSHOT_CACHE_TTL_SECONDS,
    schema: usagePayloadSchema,
    load: () =>
      collectUsage(env, new Date(), undefined, {
        ...(cache ? { cache } : {}),
        cacheOrigin: origin,
      }),
  });
}

function jsonResponse(value: unknown, status: number): Response {
  const headers = new Headers(SECURITY_HEADERS);
  headers.set("Content-Type", "application/json; charset=utf-8");
  return Response.json(value, { status, headers });
}
