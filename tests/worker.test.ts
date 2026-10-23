import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createDemoPayload } from "../src/demo";
import { verifyAccessJwt } from "../worker/src/auth";
import worker, { loadUsageSnapshot } from "../worker/src/index";
import type { ResponseCache } from "../worker/src/cache";
import { collectUsage } from "../worker/src/usage";

vi.mock("../worker/src/auth", () => ({
  verifyAccessJwt: vi.fn(),
}));
vi.mock("../worker/src/usage", () => ({
  collectUsage: vi.fn(),
}));

const mockedVerifyAccessJwt = vi.mocked(verifyAccessJwt);
const mockedCollectUsage = vi.mocked(collectUsage);
const env = {
  CF_ACCOUNT_ID: "account-id",
  CF_API_TOKEN: "api-token",
  POLICY_AUD: "usage-guard-audience",
  TEAM_DOMAIN: "https://thanejoss.cloudflareaccess.com",
} satisfies Env;

const origin = "https://cloudflare.thanejoss.com";

describe("同源用量 API", () => {
  beforeEach(() => {
    mockedVerifyAccessJwt.mockReset();
    mockedVerifyAccessJwt.mockResolvedValue(true);
    mockedCollectUsage.mockReset();
    mockedCollectUsage.mockResolvedValue(createDemoPayload());
  });

  afterEach(() => vi.unstubAllGlobals());

  it.each([undefined, origin])("已认证的同源 GET 返回快照，无 CORS 授权（Origin: %s）", async (requestOrigin) => {
    const headers = new Headers({ "Cf-Access-Jwt-Assertion": "signed-access-jwt" });
    if (requestOrigin) headers.set("Origin", requestOrigin);
    const request = new Request(`${origin}/v1/usage`, { headers });
    const response = await worker.fetch(request, env);

    expect(response.status).toBe(200);
    expect(response.headers.has("Access-Control-Allow-Origin")).toBe(false);
    expect(response.headers.has("Access-Control-Allow-Credentials")).toBe(false);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
    await expect(response.json()).resolves.toMatchObject({
      timezone: "UTC",
      products: expect.any(Array),
    });
    expect(mockedVerifyAccessJwt).toHaveBeenCalledWith(request, env.TEAM_DOMAIN, env.POLICY_AUD);
    expect(mockedCollectUsage).toHaveBeenCalledOnce();
  });

  it("旧的会话恢复参数不再触发重定向，仍验证身份", async () => {
    const request = new Request(`${origin}/v1/usage?access_session=1&return_to=https://attacker.example/`);
    mockedVerifyAccessJwt.mockResolvedValue(false);
    const denied = await worker.fetch(request, env);
    expect(denied.status).toBe(403);
    expect(denied.headers.has("Location")).toBe(false);
    expect(mockedCollectUsage).not.toHaveBeenCalled();

    mockedVerifyAccessJwt.mockResolvedValue(true);
    const response = await worker.fetch(request, env);
    expect(response.status).toBe(200);
    expect(response.headers.has("Location")).toBe(false);
    expect(mockedVerifyAccessJwt).toHaveBeenCalledTimes(2);
  });

  it("复用账户快照缓存", async () => {
    const cache = new MemoryResponseCache();
    const request = new Request(`${origin}/v1/usage`);

    const first = await loadUsageSnapshot(request, env, cache);
    const second = await loadUsageSnapshot(request, env, cache);

    expect(second).toEqual(first);
    expect(mockedCollectUsage).toHaveBeenCalledOnce();
    expect(cache.lastResponse?.headers.get("Cache-Control")).toBe("public, max-age=120");
  });

  it("缓存已存在时，未通过身份验证也不能读取缓存", async () => {
    const cache = new MemoryResponseCache();
    const cacheMatch = vi.spyOn(cache, "match");
    vi.stubGlobal("caches", { default: cache });
    const request = new Request(`${origin}/v1/usage`);
    const authenticated = await worker.fetch(request, env);
    expect(authenticated.status).toBe(200);
    expect(cache.lastResponse).not.toBeNull();
    expect(cacheMatch).toHaveBeenCalledOnce();

    mockedVerifyAccessJwt.mockResolvedValue(false);
    const unauthorized = await worker.fetch(request, env);
    expect(unauthorized.status).toBe(403);
    await expect(unauthorized.json()).resolves.toEqual({ error: "Cloudflare Access 身份无效" });
    expect(cacheMatch).toHaveBeenCalledOnce();
    expect(mockedCollectUsage).toHaveBeenCalledOnce();
  });

  it.each(["https://attacker.example", "https://api.cloudflare.thanejoss.com", "null"])(
    "拒绝跨域请求 %s，不访问鉴权或数据源", async (requestOrigin) => {
      const response = await worker.fetch(new Request(`${origin}/v1/usage`, {
        headers: {
          "Cf-Access-Jwt-Assertion": "signed-access-jwt",
          Origin: requestOrigin,
        },
      }), env);
      expect(response.status).toBe(403);
      expect(response.headers.has("Access-Control-Allow-Origin")).toBe(false);
      expect(mockedVerifyAccessJwt).not.toHaveBeenCalled();
      expect(mockedCollectUsage).not.toHaveBeenCalled();
    },
  );

  it.each(["POST", "OPTIONS", "HEAD"])("明确拒绝 %s 方法，不开放预检授权", async (method) => {
    const response = await worker.fetch(new Request(`${origin}/v1/usage`, {
      method,
      headers: { Origin: origin },
    }), env);
    expect(response.status).toBe(405);
    expect(response.headers.get("Allow")).toBe("GET");
    expect(response.headers.has("Access-Control-Allow-Origin")).toBe(false);
    expect(mockedCollectUsage).not.toHaveBeenCalled();
  });

  it.each(["/v1", "/v1/missing", "/v1/usage/extra"])("未知 API 路径 %s 返回 JSON 404", async (path) => {
    const response = await worker.fetch(new Request(`${origin}${path}`, {
      headers: { "Sec-Fetch-Mode": "navigate" },
    }), env);
    expect(response.status).toBe(404);
    expect(response.headers.get("Content-Type")).toContain("application/json");
    await expect(response.json()).resolves.toEqual({ error: "Not found" });
    expect(mockedCollectUsage).not.toHaveBeenCalled();
  });

  it("健康检查不采集账户数据", async () => {
    const response = await worker.fetch(new Request(`${origin}/health`), env);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      service: "cloudflare-usage-api",
    });
    expect(mockedVerifyAccessJwt).not.toHaveBeenCalled();
    expect(mockedCollectUsage).not.toHaveBeenCalled();
  });
});

class MemoryResponseCache implements ResponseCache {
  lastResponse: Response | null = null;

  async match(): Promise<Response | undefined> {
    return this.lastResponse?.clone();
  }

  async put(_request: Request, response: Response): Promise<void> {
    this.lastResponse = response.clone();
  }
}
