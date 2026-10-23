// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createDemoPayload } from "../src/demo";
import { useUsageData } from "../src/hooks/useUsageData";

afterEach(() => { vi.unstubAllGlobals(); });

describe("同源用量加载", () => {
  it("首次请求失败后重试同源接口并进入 ready，无需配置 API 地址", async () => {
    const fetchMock = vi.fn().mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValueOnce(Response.json(createDemoPayload()));
    vi.stubGlobal("fetch", fetchMock);
    const { result, unmount } = renderHook(() => useUsageData());
    await waitFor(() => expect(result.current.phase).toBe("ready"));
    expect(result.current.error).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenLastCalledWith("/v1/usage", expect.objectContaining({
      credentials: "same-origin", redirect: "manual",
    }));
    unmount();
  });

  it.each([
    () => new Response(null, { status: 401 }),
    () => new Response(null, { status: 403 }),
    () => new Response("<html>Access login</html>", { headers: { "Content-Type": "text/html" } }),
    () => Object.defineProperty(new Response(null), "type", { value: "opaqueredirect" }),
  ])("Access 拒绝或登录重定向提示手动重新登录，不自动循环", async (response) => {
    const fetchMock = vi.fn().mockResolvedValue(response());
    vi.stubGlobal("fetch", fetchMock);
    const pageUrl = window.location.href;
    const { result, unmount } = renderHook(() => useUsageData());
    await waitFor(() => expect(result.current.error?.kind).toBe("access"));
    expect(result.current.error?.message).toContain("刷新页面重新登录");
    expect(result.current.phase).toBe("idle");
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(window.location.href).toBe(pageUrl);
    unmount();
  });

  it("API 服务故障允许手动重试恢复", async () => {
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(Response.json({ error: "upstream unavailable" }, { status: 502 }))
      .mockResolvedValueOnce(Response.json(createDemoPayload())));
    const { result, unmount } = renderHook(() => useUsageData());
    await waitFor(() => expect(result.current.error?.kind).toBe("api"));
    act(() => result.current.refresh());
    await waitFor(() => expect(result.current.phase).toBe("ready"));
    expect(result.current.error).toBeNull();
    unmount();
  });

  it("会话过期仍保留上一次成功快照", async () => {
    const snapshot = createDemoPayload();
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(Response.json(snapshot))
      .mockResolvedValueOnce(new Response(null, { status: 401 })));
    const { result, unmount } = renderHook(() => useUsageData());
    await waitFor(() => expect(result.current.phase).toBe("ready"));
    act(() => result.current.refresh());
    await waitFor(() => expect(result.current.error?.kind).toBe("access"));
    expect(result.current.data).toEqual(snapshot);
    expect(result.current.phase).toBe("ready");
    unmount();
  });
});
