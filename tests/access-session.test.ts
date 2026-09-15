// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { accessSessionUrl, clearAccessRecovery, fetchUsageResponse, recoverAccessSession } from "../src/lib/access-session";

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); sessionStorage.clear(); });

describe("首次 API 会话恢复", () => {
  it("首次网络失败后自动重试，并保留 credentials", async () => {
    vi.useFakeTimers();
    const response = Response.json({ ok: true });
    const fetchMock = vi.fn().mockRejectedValueOnce(new TypeError("Failed to fetch")).mockResolvedValue(response);
    vi.stubGlobal("fetch", fetchMock);
    const signal = new AbortController().signal;
    const pending = fetchUsageResponse("https://api.example/v1/usage", signal);
    await vi.advanceTimersByTimeAsync(500);
    await expect(pending).resolves.toBe(response);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenLastCalledWith("https://api.example/v1/usage", {
      credentials: "include", headers: { Accept: "application/json" }, signal,
    });
  });

  it("持续失败只重试一次，HTTP 拒绝不作为网络失败重试", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));
    vi.stubGlobal("fetch", fetchMock);
    const pending = fetchUsageResponse("https://api.example/v1/usage", new AbortController().signal);
    await Promise.all([expect(pending).rejects.toThrow("Failed to fetch"), vi.advanceTimersByTimeAsync(500)]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    fetchMock.mockResolvedValue(new Response(null, { status: 403 }));
    await expect(fetchUsageResponse("https://api.example/v1/usage", new AbortController().signal)).resolves.toHaveProperty("status", 403);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("取消等待后不会继续重试", async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    const fetchMock = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));
    vi.stubGlobal("fetch", fetchMock);
    const pending = fetchUsageResponse("https://api.example/v1/usage", controller.signal);
    await vi.advanceTimersByTimeAsync(0);
    await Promise.all([
      expect(pending).rejects.toHaveProperty("name", "AbortError"),
      Promise.resolve().then(() => controller.abort()),
    ]);
    await vi.advanceTimersByTimeAsync(500);
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("自动跳转只发生一次，成功后可恢复下一次过期会话", () => {
    const navigate = vi.fn();
    const endpoint = "https://api.example";
    const page = "https://dashboard.example/?view=usage#workers";
    expect(recoverAccessSession(endpoint, page, sessionStorage, navigate)).toBe(true);
    expect(navigate).toHaveBeenCalledWith(accessSessionUrl(endpoint, page));
    expect(new URL(navigate.mock.calls[0]![0] as string).searchParams.get("return_to")).toBe(page);
    expect(recoverAccessSession(endpoint, page, sessionStorage, navigate)).toBe(false);
    expect(navigate).toHaveBeenCalledOnce();
    clearAccessRecovery(sessionStorage);
    expect(recoverAccessSession(endpoint, page, sessionStorage, navigate)).toBe(true);
  });

  it("同源或存储不可用时不自动跳转，避免重定向循环", () => {
    const navigate = vi.fn();
    expect(recoverAccessSession("https://dashboard.example", "https://dashboard.example/", sessionStorage, navigate)).toBe(false);
    const unavailable = { getItem: () => { throw new Error("denied"); }, setItem: vi.fn() };
    expect(recoverAccessSession("https://api.example", "https://dashboard.example/", unavailable, navigate)).toBe(false);
    expect(navigate).not.toHaveBeenCalled();
  });
});
