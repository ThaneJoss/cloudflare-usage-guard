import { describe, expect, it } from "vitest";

import { verifyDashboardToken } from "../worker/src/auth";

function request(authorization?: string): Request {
  return new Request(
    "https://usage.example/v1/usage",
    authorization ? { headers: { Authorization: authorization } } : undefined,
  );
}

describe("dashboard token authentication", () => {
  it("accepts a matching bearer token", async () => {
    await expect(
      verifyDashboardToken(request("Bearer correct horse"), "correct horse"),
    ).resolves.toBe(true);
  });

  it("treats the HTTP auth scheme case-insensitively", async () => {
    await expect(
      verifyDashboardToken(request("bearer secret"), "secret"),
    ).resolves.toBe(true);
  });

  it.each([
    [undefined, "secret"],
    ["Basic secret", "secret"],
    ["Bearer", "secret"],
    ["Bearer wrong", "secret"],
    ["Bearer secret", ""],
  ])("rejects invalid credentials", async (authorization, expected) => {
    await expect(
      verifyDashboardToken(request(authorization), expected),
    ).resolves.toBe(false);
  });
});
