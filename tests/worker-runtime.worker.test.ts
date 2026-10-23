import { exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

const origin = "https://cloudflare.thanejoss.com";

describe("Worker 运行时边界", () => {
  it("健康检查返回无缓存的结构化响应", async () => {
    const response = await exports.default.fetch(`${origin}/health`);
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual({
      ok: true,
      service: "cloudflare-usage-api",
    });
  });

  it("不再开放跨域预检请求", async () => {
    const response = await exports.default.fetch(new Request(`${origin}/v1/usage`, {
      method: "OPTIONS",
      headers: { Origin: "https://attacker.example" },
    }));
    expect(response.status).toBe(403);
    expect(response.headers.has("Access-Control-Allow-Origin")).toBe(false);
  });

  it.each([undefined, origin])("未携带 Access JWT 时拒绝用量读取（Origin: %s）", async (requestOrigin) => {
    const headers = new Headers();
    if (requestOrigin) headers.set("Origin", requestOrigin);
    const response = await exports.default.fetch(new Request(`${origin}/v1/usage`, { headers }));
    expect(response.status).toBe(403);
    expect(response.headers.has("Access-Control-Allow-Origin")).toBe(false);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual({ error: "Cloudflare Access 身份无效" });
  });

  it("同源 API 仅接受 GET", async () => {
    const response = await exports.default.fetch(new Request(`${origin}/v1/usage`, { method: "POST" }));
    expect(response.status).toBe(405);
    expect(response.headers.get("Allow")).toBe("GET");
  });

  it.each(["/v1", "/v1/missing"])("未知 API 路径 %s 返回 JSON 404", async (path) => {
    const response = await exports.default.fetch(new Request(`${origin}${path}`, {
      headers: { "Sec-Fetch-Mode": "navigate" },
    }));
    expect(response.status).toBe(404);
    expect(response.headers.get("Content-Type")).toContain("application/json");
    await expect(response.json()).resolves.toEqual({ error: "Not found" });
  });
});
