import { exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

describe("Worker 运行时边界", () => {
  it("健康检查返回无缓存的结构化响应", async () => {
    const response = await exports.default.fetch(
      "https://api.example.com/health",
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual({
      ok: true,
      service: "cloudflare-usage-api",
    });
  });

  it("仅为允许的前端 Origin 返回 CORS", async () => {
    const allowed = await exports.default.fetch(
      new Request("https://api.example.com/v1/usage", {
        method: "OPTIONS",
        headers: { Origin: "https://cloudflare.thanejoss.com" },
      }),
    );
    const denied = await exports.default.fetch(
      new Request("https://api.example.com/v1/usage", {
        method: "OPTIONS",
        headers: { Origin: "https://attacker.example" },
      }),
    );

    expect(allowed.status).toBe(204);
    expect(allowed.headers.get("Access-Control-Allow-Origin")).toBe(
      "https://cloudflare.thanejoss.com",
    );
    expect(denied.status).toBe(403);
    expect(denied.headers.has("Access-Control-Allow-Origin")).toBe(false);
  });

  it("未携带 Access JWT 时拒绝用量读取", async () => {
    const response = await exports.default.fetch(
      new Request("https://api.example.com/v1/usage", {
        headers: { Origin: "https://cloudflare.thanejoss.com" },
      }),
    );

    expect(response.status).toBe(403);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe(
      "https://cloudflare.thanejoss.com",
    );
    await expect(response.json()).resolves.toEqual({
      error: "Cloudflare Access 身份无效",
    });
  });
});
