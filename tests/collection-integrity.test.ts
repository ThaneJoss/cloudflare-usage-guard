import { afterEach, describe, expect, it, vi } from "vitest";
import { CloudflareClient } from "../worker/src/cloudflare";
import { getTimeWindows } from "../worker/src/lib/metrics";
import { withSourceDeadline } from "../worker/src/lib/deadline";

const windows = getTimeWindows(new Date("2026-11-06T12:00:00Z"));
const storageCases = [
  {
    dataset: "kvStorageAdaptiveGroups",
    method: "getKvUsage",
    point: { max: { byteCount: 1 }, dimensions: { namespaceId: "kv", date: "2026-11-06" } },
  },
  {
    dataset: "d1StorageAdaptiveGroups",
    method: "getD1Usage",
    point: { max: { databaseSizeBytes: 1 }, dimensions: { databaseId: "d1", date: "2026-11-06" } },
  },
  {
    dataset: "r2StorageAdaptiveGroups",
    method: "getR2Usage",
    point: { max: { payloadSize: 1 }, dimensions: { bucketName: "r2", datetime: "2026-11-06T12:00:00Z" } },
  },
] as const;

afterEach(() => vi.useRealTimers());

describe("采集完整性和取消边界", () => {
  it.each(storageCases)("拒绝达到上限的 $dataset", async ({ dataset, method, point }) => {
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async () => Response.json({
      data: { viewer: { accounts: [{
        kvOperationsAdaptiveGroups: [], d1AnalyticsAdaptiveGroups: [], r2OperationsAdaptiveGroups: [],
        [dataset]: Array.from({ length: 10_000 }, () => point),
      }] } },
    }));
    const client = new CloudflareClient({ accountId: "account", apiToken: "token", fetcher });
    await expect(client[method](windows)).rejects.toThrow("无法确认数据完整性");
  });

  it.each(storageCases)("接受未达到上限的 $dataset", async ({ dataset, method, point }) => {
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async () => Response.json({
      data: { viewer: { accounts: [{
        kvOperationsAdaptiveGroups: [], d1AnalyticsAdaptiveGroups: [], r2OperationsAdaptiveGroups: [],
        [dataset]: Array.from({ length: 9_999 }, () => point),
      }] } },
    }));
    const client = new CloudflareClient({ accountId: "account", apiToken: "token", fetcher });
    await expect(client[method](windows)).resolves.toMatchObject({ storageBytes: 1 });
  });

  it("Pages 取消后不会请求后续分页或项目批次", async () => {
    const controller = new AbortController();
    const observed: AbortSignal[] = [];
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async (input, init) => {
      if (init?.signal) observed.push(init.signal);
      const path = new URL(String(input)).pathname;
      if (path.endsWith("/pages/projects")) {
        return rest(Array.from({ length: 6 }, (_,index) => ({ name: `project-${index}` })));
      }
      controller.abort(new DOMException("测试超时", "TimeoutError"));
      return rest([{ created_on: "2026-11-05T00:00:00Z", deployment_trigger: { type: "github" } }], 2);
    });
    const client = new CloudflareClient({ accountId: "account", apiToken: "token", fetcher });
    await expect(client.getPagesUsage(windows, controller.signal)).rejects.toMatchObject({ name: "TimeoutError" });
    expect(observed.every((signal) => signal.aborted)).toBe(true);
    expect(fetcher.mock.calls.some(([input]) => String(input).includes("page=2"))).toBe(false);
    expect(fetcher.mock.calls.some(([input]) => String(input).includes("project-5/deployments"))).toBe(false);
  });

  it("账单 info 取消后不会继续请求 usage", async () => {
    const controller = new AbortController();
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async () => {
      controller.abort(new DOMException("测试超时", "TimeoutError"));
      return rest({ covered: true, subscriptions: [] });
    });
    const client = new CloudflareClient({ accountId: "account", apiToken: "token", fetcher });
    await expect(client.getBillableUsage(controller.signal)).rejects.toBeDefined();
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it("来源提前失败会取消兄弟请求并清除定时器", async () => {
    vi.useFakeTimers();
    let captured: AbortSignal | undefined;
    await expect(withSourceDeadline((signal) => {
      captured = signal;
      return Promise.reject(new Error("source failed"));
    })).rejects.toThrow("source failed");
    expect(captured?.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("忽略取消的来源迟到拒绝不改变超时结果", async () => {
    vi.useFakeTimers();
    let rejectLate: ((reason: unknown) => void) | undefined;
    const pending = withSourceDeadline(() => new Promise<never>((_resolve, reject) => {
      rejectLate = reject;
    }));
    const assertion = expect(pending).rejects.toMatchObject({ name: "TimeoutError" });
    await vi.advanceTimersByTimeAsync(20_000);
    await assertion;
    rejectLate?.(new Error("late failure"));
    await Promise.resolve();
    expect(vi.getTimerCount()).toBe(0);
  });
});

function rest(result: unknown, totalPages = 1): Response {
  return Response.json({ success: true, result, result_info: { total_pages: totalPages } });
}
