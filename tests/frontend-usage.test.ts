import { describe, expect, it } from "vitest";

import { QUOTA_CATALOG_AS_OF } from "../shared/quota-catalog";
import { createDemoPayload } from "../src/demo";
import {
  formatDate,
  matchesProductFilter,
  parseUsagePayload,
  rankMetricSignals,
  worstMetricStatus,
} from "../src/lib/usage";

describe("前端用量契约", () => {
  it("接受完整演示数据并拒绝不完整响应", () => {
    const payload = createDemoPayload();

    expect(parseUsagePayload(payload)).toEqual(payload);
    expect(() =>
      parseUsagePayload({ generatedAt: payload.generatedAt }),
    ).toThrow("API 返回的数据结构不完整");
  });

  it("风险排序和筛选都基于真实用量字段", () => {
    const payload = createDemoPayload();
    const signals = rankMetricSignals(payload.products);
    const attention = payload.products.filter((product) =>
      matchesProductFilter(product, "attention"),
    );

    expect(signals[0]?.metric.id).toBe("kv-writes");
    expect(attention.map((product) => product.id)).toEqual(["workers", "kv"]);
  });

  it("日期展示固定使用 UTC，目录版本与有效日期一致", () => {
    expect(formatDate("2026-07-27T23:30:00.000Z")).toContain("2026");
    expect(QUOTA_CATALOG_AS_OF).toBe("2026-07-27");
  });
  it("不完整产品进入关注筛选，未知指标不参与压力排序", () => {
    const product = createDemoPayload().products.find((item) => item.id === "pages")!;
    const partial = {
      ...product,
      partial: true,
      metrics: product.metrics.map((metric) => ({
        ...metric, used: 1, utilization: 0.2, status: "unavailable" as const, precision: "lower-bound" as const,
      })),
    };
    expect(matchesProductFilter(partial, "attention")).toBe(true);
    expect(matchesProductFilter(partial, "unavailable")).toBe(true);
    expect(rankMetricSignals([partial])).toEqual([]);
    expect(worstMetricStatus(partial.metrics)).toBe("unavailable");
    expect(worstMetricStatus([
      ...partial.metrics, { ...product.metrics[0]!, status: "critical" },
    ])).toBe("critical");
  });

});
