// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchUsageResponse } from "../src/lib/usage-client";

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe("同源用量请求", () => {
  it("首次网络失败后自动重试，仅向同源接口发送凭据", async () => {
    vi.useFakeTimers();
    const response = Response.json({ ok: true });
    const fetchMock = vi.fn().mockRejectedValueOnce(new TypeError("Failed to fetch")).mockResolvedValue(response);
    vi.stubGlobal("fetch", fetchMock);
    const signal = new AbortController().signal;
    const pending = fetchUsageResponse(signal);
    await vi.advanceTimersByTimeAsync(500);
    await expect(pending).resolves.toBe(response);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenLastCalledWith("/v1/usage", {
      credentials: "same-origin", redirect: "manual", headers: { Accept: "application/json" }, signal,
    });
  });

  it("持续失败只重试一次，HTTP 拒绝不作为网络失败重试", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));
    vi.stubGlobal("fetch", fetchMock);
    const pending = fetchUsageResponse(new AbortController().signal);
    await Promise.all([expect(pending).rejects.toThrow("Failed to fetch"), vi.advanceTimersByTimeAsync(500)]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    fetchMock.mockResolvedValue(new Response(null, { status: 403 }));
    await expect(fetchUsageResponse(new AbortController().signal)).resolves.toHaveProperty("status", 403);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("取消等待后不会继续重试", async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    const fetchMock = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));
    vi.stubGlobal("fetch", fetchMock);
    const pending = fetchUsageResponse(controller.signal);
    await vi.advanceTimersByTimeAsync(0);
    await Promise.all([
      expect(pending).rejects.toHaveProperty("name", "AbortError"),
      Promise.resolve().then(() => controller.abort()),
    ]);
    await vi.advanceTimersByTimeAsync(500);
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});
