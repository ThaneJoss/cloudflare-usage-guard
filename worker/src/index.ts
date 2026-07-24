import { verifyAccessJwt } from "./auth";
import { collectUsage } from "./usage";

const SECURITY_HEADERS = {
  "Cache-Control": "no-store",
  "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
} as const;

export default {
  async fetch(request, env): Promise<Response> {
    const url = new URL(request.url);
    const origin = request.headers.get("Origin");
    const allowedOrigin = resolveAllowedOrigin(origin, env.ALLOWED_ORIGINS);

    if (request.method === "OPTIONS") {
      if (!origin || !allowedOrigin) {
        return jsonResponse({ error: "Origin 不在允许列表" }, 403);
      }
      return new Response(null, {
        status: 204,
        headers: corsHeaders(allowedOrigin),
      });
    }

    if (url.pathname === "/health" && request.method === "GET") {
      return jsonResponse(
        { ok: true, service: "cloudflare-usage-api" },
        200,
        allowedOrigin,
      );
    }

    if (url.pathname !== "/v1/usage" || request.method !== "GET") {
      return jsonResponse({ error: "Not found" }, 404, allowedOrigin);
    }

    if (origin && !allowedOrigin) {
      return jsonResponse({ error: "Origin 不在允许列表" }, 403);
    }

    if (!(await verifyAccessJwt(request, env.TEAM_DOMAIN, env.POLICY_AUD))) {
      return jsonResponse(
        { error: "Cloudflare Access 身份无效" },
        403,
        allowedOrigin,
      );
    }

    try {
      const payload = await collectUsage(env);
      return jsonResponse(payload, 200, allowedOrigin);
    } catch (error) {
      console.error("usage_collection_failed", {
        name: error instanceof Error ? error.name : "UnknownError",
        message: error instanceof Error ? error.message.slice(0, 240) : "unknown",
      });
      return jsonResponse(
        { error: "暂时无法生成用量快照" },
        502,
        allowedOrigin,
      );
    }
  },
} satisfies ExportedHandler<Env>;

function resolveAllowedOrigin(
  requestOrigin: string | null,
  configuredOrigins: string,
): string | null {
  if (!requestOrigin) return null;
  const allowed = configuredOrigins
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
  return allowed.includes(requestOrigin) ? requestOrigin : null;
}

function corsHeaders(origin: string): Headers {
  const headers = new Headers(SECURITY_HEADERS);
  headers.set("Access-Control-Allow-Origin", origin);
  headers.set("Access-Control-Allow-Credentials", "true");
  headers.set("Access-Control-Allow-Headers", "Content-Type");
  headers.set("Access-Control-Allow-Methods", "GET, OPTIONS");
  headers.set("Access-Control-Max-Age", "86400");
  headers.set("Vary", "Origin");
  return headers;
}

function jsonResponse(
  value: unknown,
  status: number,
  allowedOrigin: string | null = null,
): Response {
  const headers = allowedOrigin
    ? corsHeaders(allowedOrigin)
    : new Headers(SECURITY_HEADERS);
  headers.set("Content-Type", "application/json; charset=utf-8");
  return Response.json(value, { status, headers });
}
