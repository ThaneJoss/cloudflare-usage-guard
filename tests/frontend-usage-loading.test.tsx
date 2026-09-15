// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { createDemoPayload } from "../src/demo";
import { recoverAccessSession } from "../src/lib/access-session";

vi.mock("../src/lib/access-session", async (importOriginal) => ({
  ...await importOriginal<typeof import("../src/lib/access-session")>(),
  recoverAccessSession: vi.fn(() => true),
}));
let useUsageData: typeof import("../src/hooks/useUsageData").useUsageData;
beforeAll(async () => {
  vi.stubEnv("VITE_API_BASE_URL", "https://api.example");
  ({ useUsageData } = await import("../src/hooks/useUsageData"));
});
afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); sessionStorage.clear(); });

describe("用量加载与会话恢复集成", () => {
  it("首次 fetch 失败后无需刷新即可进入 ready", async () => {
    const fetchMock = vi.fn().mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValueOnce(Response.json(createDemoPayload()));
    vi.stubGlobal("fetch", fetchMock);
    const { result, unmount } = renderHook(() => useUsageData());
    await waitFor(() => expect(result.current.phase).toBe("ready"));
    expect(result.current.error).toBeNull();
    expect(recoverAccessSession).not.toHaveBeenCalled();
    unmount();
  });

  it.each([
    () => new Response(null, { status: 403 }),
    () => new Response("<html>Access login</html>", { headers: { "Content-Type": "text/html" } }),
  ])("Access 拒绝或登录 HTML 触发会话恢复而非契约错误", async (response) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response()));
    const { result, unmount } = renderHook(() => useUsageData());
    await waitFor(() => expect(recoverAccessSession).toHaveBeenCalledOnce());
    expect(result.current.error).toBeNull();
    expect(result.current.phase).toBe("loading");
    unmount();
  });

  it("API 服务故障不触发身份跳转，手动重试仍能恢复", async () => {
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(Response.json({ error: "upstream unavailable" }, { status: 502 }))
      .mockResolvedValueOnce(Response.json(createDemoPayload())));
    const { result, unmount } = renderHook(() => useUsageData());
    await waitFor(() => expect(result.current.error?.kind).toBe("api"));
    expect(recoverAccessSession).not.toHaveBeenCalled();
    act(() => result.current.refresh());
    await waitFor(() => expect(result.current.phase).toBe("ready"));
    expect(result.current.error).toBeNull();
    unmount();
  });
});
