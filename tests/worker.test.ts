import { beforeEach, describe, expect, it, vi } from "vitest";

import { createDemoPayload } from "../src/demo";
import { verifyAccessJwt } from "../worker/src/auth";
import worker from "../worker/src/index";
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
  ALLOWED_ORIGINS: "https://dashboard.example,http://localhost:5173",
  CF_ACCOUNT_ID: "account-id",
  CF_API_TOKEN: "api-token",
  POLICY_AUD: "usage-guard-audience",
  TEAM_DOMAIN: "https://example.cloudflareaccess.com",
} as unknown as Env;

describe("usage Worker HTTP API", () => {
  beforeEach(() => {
    mockedVerifyAccessJwt.mockReset();
    mockedVerifyAccessJwt.mockResolvedValue(true);
    mockedCollectUsage.mockReset();
    mockedCollectUsage.mockResolvedValue(createDemoPayload());
  });

  it("serves an Access-authenticated snapshot with restrictive response headers", async () => {
    const response = await worker.fetch(
      new Request("https://usage.example/v1/usage", {
        headers: {
          "Cf-Access-Jwt-Assertion": "signed-access-jwt",
          Origin: "https://dashboard.example",
        },
      }),
      env,
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe(
      "https://dashboard.example",
    );
    expect(response.headers.get("Access-Control-Allow-Credentials")).toBe("true");
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
    await expect(response.json()).resolves.toMatchObject({
      timezone: "UTC",
      products: expect.any(Array),
    });
    expect(mockedCollectUsage).toHaveBeenCalledOnce();
  });

  it("rejects unauthorized and cross-origin requests before collection", async () => {
    mockedVerifyAccessJwt.mockResolvedValue(false);
    const unauthorized = await worker.fetch(
      new Request("https://usage.example/v1/usage", {
        headers: { Origin: "https://dashboard.example" },
      }),
      env,
    );
    const forbidden = await worker.fetch(
      new Request("https://usage.example/v1/usage", {
        headers: {
          "Cf-Access-Jwt-Assertion": "signed-access-jwt",
          Origin: "https://attacker.example",
        },
      }),
      env,
    );

    expect(unauthorized.status).toBe(403);
    expect(forbidden.status).toBe(403);
    expect(forbidden.headers.get("Access-Control-Allow-Origin")).toBeNull();
    expect(mockedCollectUsage).not.toHaveBeenCalled();
  });

  it("only permits preflight requests from configured origins", async () => {
    const allowed = await worker.fetch(
      new Request("https://usage.example/v1/usage", {
        method: "OPTIONS",
        headers: { Origin: "http://localhost:5173" },
      }),
      env,
    );
    const denied = await worker.fetch(
      new Request("https://usage.example/v1/usage", {
        method: "OPTIONS",
        headers: { Origin: "https://attacker.example" },
      }),
      env,
    );

    expect(allowed.status).toBe(204);
    expect(allowed.headers.get("Access-Control-Allow-Methods")).toBe(
      "GET, OPTIONS",
    );
    expect(denied.status).toBe(403);
  });

  it("exposes a public health check without collecting account data", async () => {
    const response = await worker.fetch(
      new Request("https://usage.example/health"),
      env,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      service: "cloudflare-usage-api",
    });
    expect(mockedCollectUsage).not.toHaveBeenCalled();
  });
});
