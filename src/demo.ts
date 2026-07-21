import type {
  ProductUsage,
  UsageMetric,
  UsagePayload,
} from "../shared/usage";

const GB = 1_000_000_000;

export function createDemoPayload(): UsagePayload {
  const now = new Date();
  const dayEnd = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1),
  ).toISOString();
  const monthEnd = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1),
  ).toISOString();

  const products: ProductUsage[] = [
    product({
      id: "workers",
      name: "Workers",
      eyebrow: "边缘计算",
      description: "HTTP 请求的每日免费额度。Cron 触发与部分内部调用可能采用不同计量规则。",
      behavior: "plan-dependent",
      behaviorLabel: "Free 停止 · Paid 超额计费",
      documentationUrl: "https://developers.cloudflare.com/workers/platform/pricing/",
      sourceLabel: "GraphQL · Workers Analytics",
      metrics: [
        metric("workers-requests", "请求", 72_480, 100_000, "requests", "day", dayEnd),
      ],
      details: [
        { label: "活跃脚本", value: "12" },
        { label: "错误请求", value: "38" },
      ],
    }),
    product({
      id: "kv",
      name: "Workers KV",
      eyebrow: "键值存储",
      description: "读取、写入、删除和列表操作按 UTC 日独立计额；存储是账户总量。",
      behavior: "plan-dependent",
      behaviorLabel: "Free 操作失败 · Paid 超额计费",
      documentationUrl: "https://developers.cloudflare.com/kv/platform/pricing/",
      sourceLabel: "GraphQL · KV Analytics",
      metrics: [
        metric("kv-reads", "读取", 41_238, 100_000, "operations", "day", dayEnd),
        metric("kv-writes", "写入", 921, 1_000, "operations", "day", dayEnd),
        metric("kv-deletes", "删除", 42, 1_000, "operations", "day", dayEnd),
        metric("kv-lists", "列表", 126, 1_000, "operations", "day", dayEnd),
        metric("kv-storage", "存储", 318_400_000, GB, "bytes", "current", null),
      ],
    }),
    product({
      id: "d1",
      name: "D1",
      eyebrow: "SQL 数据库",
      description: "行读取、行写入按 UTC 日计额；账户存储上限按所有数据库合计。",
      behavior: "plan-dependent",
      behaviorLabel: "Free 查询失败 · Paid 超额计费",
      documentationUrl: "https://developers.cloudflare.com/d1/platform/pricing/",
      sourceLabel: "GraphQL · D1 Analytics",
      metrics: [
        metric("d1-rows-read", "读取行数", 1_640_820, 5_000_000, "rows", "day", dayEnd),
        metric("d1-rows-written", "写入行数", 21_402, 100_000, "rows", "day", dayEnd),
        metric("d1-storage", "账户存储", 1.82 * GB, 5 * GB, "bytes", "current", null),
      ],
    }),
    product({
      id: "r2",
      name: "R2",
      eyebrow: "对象存储",
      description: "免费层包含月度 Class A、Class B 与 GB-month 存储额度；网络出口免费。",
      behavior: "paid-overage",
      behaviorLabel: "超过免费层后计费",
      documentationUrl: "https://developers.cloudflare.com/r2/pricing/",
      sourceLabel: "GraphQL · R2 Analytics",
      metrics: [
        metric("r2-class-a", "Class A", 234_180, 1_000_000, "operations", "month", monthEnd),
        metric("r2-class-b", "Class B", 2_820_512, 10_000_000, "operations", "month", monthEnd),
        metric("r2-storage", "当前存储快照", 6.42 * GB, 10 * GB, "bytes", "current", monthEnd, "当前快照不是精确 GB-month"),
      ],
      details: [{ label: "免费操作", value: "18,942" }],
    }),
    product({
      id: "queues",
      name: "Queues",
      eyebrow: "消息队列",
      description: "发送、投递与确认/重试均可能形成计费操作，免费计划按 UTC 日计额。",
      behavior: "plan-dependent",
      behaviorLabel: "Free 停止 · Paid 超额计费",
      documentationUrl: "https://developers.cloudflare.com/queues/platform/pricing/",
      sourceLabel: "GraphQL · Queues Analytics",
      metrics: [
        metric("queues-operations", "计费操作", 6_310, 10_000, "operations", "day", dayEnd),
      ],
    }),
    product({
      id: "pages",
      name: "Pages",
      eyebrow: "前端部署",
      description: "免费计划每月最多 500 次构建；静态资源请求不计入 Workers 请求额度。",
      behavior: "hard-stop",
      behaviorLabel: "达到上限后构建停止",
      documentationUrl: "https://developers.cloudflare.com/pages/platform/limits/",
      sourceLabel: "REST · Pages Deployments",
      metrics: [
        metric("pages-builds", "构建次数", 84, 500, "builds", "month", monthEnd),
      ],
      details: [
        { label: "已检查项目", value: "8" },
        { label: "读取失败项目", value: "0" },
      ],
    }),
  ];

  return {
    generatedAt: now.toISOString(),
    quotaCatalogAsOf: "2026-07-21",
    timezone: "UTC",
    summary: {
      overall: "critical",
      trackedMetrics: 14,
      attentionMetrics: 2,
      unavailableProducts: 0,
      healthySources: 7,
      totalSources: 7,
    },
    products,
    billing: {
      available: true,
      error: null,
      periodStart: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString(),
      periodEnd: monthEnd,
      totalCost: 0.42,
      currency: "USD",
      rows: [
        {
          id: "r2-demo",
          service: "R2",
          family: "R2 Storage",
          consumed: 6.42,
          consumedUnit: "GB-month",
          pricingQuantity: 0,
          cost: 0,
          currency: "USD",
        },
        {
          id: "workers-demo",
          service: "Workers",
          family: "Workers Paid",
          consumed: 2_100_000,
          consumedUnit: "requests",
          pricingQuantity: 2.1,
          cost: 0.42,
          currency: "USD",
        },
      ],
    },
    sources: [
      "Workers Analytics",
      "KV Analytics",
      "D1 Analytics",
      "R2 Analytics",
      "Queues Analytics",
      "Pages Deployments",
      "Billing PayGo API",
    ].map((label, index) => ({
      id: `demo-${index}`,
      label,
      status: "ok" as const,
      message: "数据读取成功",
    })),
    coverageGaps: [
      gap("Workers AI", "10,000 neurons / UTC 日", "https://developers.cloudflare.com/workers-ai/platform/pricing/"),
      gap("Images", "5,000 unique transformations / 月", "https://developers.cloudflare.com/images/pricing/"),
      gap("Vectorize", "30M queried + 5M stored dimensions / 月", "https://developers.cloudflare.com/vectorize/platform/pricing/"),
      gap("Browser Rendering", "10 browser minutes / UTC 日", "https://developers.cloudflare.com/browser-rendering/platform/pricing/"),
      gap("Workflows", "3,000 steps / UTC 日", "https://developers.cloudflare.com/workflows/platform/pricing/"),
    ],
    disclaimer: "这是演示数据。实际额度卡使用 Cloudflare Analytics/REST API 的运行数据估算，不等同于账单；所有日/月边界均按 UTC。",
  };
}

function product(
  input: Omit<
    ProductUsage,
    "available" | "partial" | "error" | "details"
  > & { details?: ProductUsage["details"] },
): ProductUsage {
  return {
    ...input,
    details: input.details ?? [],
    available: true,
    partial: false,
    error: null,
  };
}

function metric(
  id: string,
  label: string,
  used: number,
  limit: number,
  unit: UsageMetric["unit"],
  period: UsageMetric["period"],
  resetAt: string | null,
  note: string | null = null,
): UsageMetric {
  const utilization = (used / limit) * 100;
  const status =
    utilization >= 100
      ? "exceeded"
      : utilization >= 90
        ? "critical"
        : utilization >= 70
          ? "watch"
          : "ok";
  return {
    id,
    label,
    used,
    limit,
    unit,
    period,
    utilization,
    status,
    resetAt,
    precision: "analytics-estimate",
    note,
  };
}

function gap(name: string, allowance: string, documentationUrl: string) {
  return {
    name,
    allowance,
    reason: "尚未接入统一自动采集；保留在覆盖清单中，避免产生已监控的错觉。",
    documentationUrl,
  };
}
