import type {
  ProductUsage,
  UsageMetric,
  UsagePayload,
} from "../shared/usage";
import {
  COVERAGE_GAPS,
  getProductMetadata,
  PRODUCT_CATALOG,
  QUOTA_CATALOG_AS_OF,
} from "../shared/quota-catalog";

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
      ...getProductMetadata("workers"),
      metrics: [
        metricFromCatalog(PRODUCT_CATALOG.workers.metrics.requests, 72_480, dayEnd),
      ],
      details: [
        { label: "活跃脚本", value: "12" },
        { label: "错误请求", value: "38" },
      ],
    }),
    product({
      ...getProductMetadata("kv"),
      metrics: [
        metricFromCatalog(PRODUCT_CATALOG.kv.metrics.reads, 41_238, dayEnd),
        metricFromCatalog(PRODUCT_CATALOG.kv.metrics.writes, 921, dayEnd),
        metricFromCatalog(PRODUCT_CATALOG.kv.metrics.deletes, 42, dayEnd),
        metricFromCatalog(PRODUCT_CATALOG.kv.metrics.lists, 126, dayEnd),
        metricFromCatalog(PRODUCT_CATALOG.kv.metrics.storage, 318_400_000, null),
      ],
    }),
    product({
      ...getProductMetadata("d1"),
      metrics: [
        metricFromCatalog(PRODUCT_CATALOG.d1.metrics.rowsRead, 1_640_820, dayEnd),
        metricFromCatalog(PRODUCT_CATALOG.d1.metrics.rowsWritten, 21_402, dayEnd),
        metricFromCatalog(PRODUCT_CATALOG.d1.metrics.storage, 1.82 * GB, null),
      ],
    }),
    product({
      ...getProductMetadata("r2"),
      metrics: [
        metricFromCatalog(PRODUCT_CATALOG.r2.metrics.classA, 234_180, monthEnd),
        metricFromCatalog(PRODUCT_CATALOG.r2.metrics.classB, 2_820_512, monthEnd),
        metricFromCatalog(
          PRODUCT_CATALOG.r2.metrics.storage,
          6.42 * GB,
          monthEnd,
          "当前快照不是精确 GB-month",
        ),
      ],
      details: [{ label: "免费操作", value: "18,942" }],
    }),
    product({
      ...getProductMetadata("queues"),
      metrics: [
        metricFromCatalog(PRODUCT_CATALOG.queues.metrics.operations, 6_310, dayEnd),
      ],
    }),
    product({
      ...getProductMetadata("pages"),
      metrics: [
        metricFromCatalog(PRODUCT_CATALOG.pages.metrics.builds, 84, monthEnd),
      ],
      details: [
        { label: "已检查项目", value: "8" },
        { label: "读取失败项目", value: "0" },
      ],
    }),
  ];

  return {
    generatedAt: now.toISOString(),
    quotaCatalogAsOf: QUOTA_CATALOG_AS_OF,
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
    coverageGaps: [...COVERAGE_GAPS],
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

function metricFromCatalog(
  definition: {
    id: string;
    label: string;
    limit: number;
    unit: UsageMetric["unit"];
    period: UsageMetric["period"];
  },
  used: number,
  resetAt: string | null,
  note: string | null = null,
): UsageMetric {
  return metric(
    definition.id,
    definition.label,
    used,
    definition.limit,
    definition.unit,
    definition.period,
    resetAt,
    note,
  );
}
