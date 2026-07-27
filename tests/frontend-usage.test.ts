import { describe, expect, it } from "vitest";

import { QUOTA_CATALOG_AS_OF } from "../shared/quota-catalog";
import { createDemoPayload } from "../src/demo";
import {
  formatDate,
  matchesProductFilter,
  normalizeEndpoint,
  parseUsagePayload,
  rankMetricSignals,
} from "../src/lib/usage";

describe("前端用量契约", () => {
  it("接受完整演示数据并拒绝不完整响应", () => {
    const payload = createDemoPayload();

    expect(parseUsagePayload(payload)).toEqual(payload);
    expect(() =>
      parseUsagePayload({ generatedAt: payload.generatedAt }),
    ).toThrow("API 返回的数据结构不完整");
  });

  it("只允许生产 HTTPS 与本地 HTTP 地址", () => {
    expect(normalizeEndpoint("https://api.example.com/v1/")).toBe(
      "https://api.example.com",
    );
    expect(normalizeEndpoint("http://localhost:8787/")).toBe(
      "http://localhost:8787",
    );
    expect(normalizeEndpoint("http://api.example.com")).toBe("");
    expect(normalizeEndpoint("不是地址")).toBe("");
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
});
