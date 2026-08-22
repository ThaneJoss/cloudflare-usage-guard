import type {
  ProductUsage,
  UsageMetric,
  UsagePayload,
} from "../shared/usage";
import {
  getProductMetadata,
  PRODUCT_CATALOG,
  QUOTA_CATALOG_AS_OF,
  REALTIME_COVERAGE_GAPS,
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
  const billingPeriodStart = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
  ).toISOString();
  const dataThrough = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
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
      covered: true,
      error: null,
      billingPeriodStart,
      dataThrough,
      totalCost: 0.42,
      currency: "USD",
      rows: [
        {
          id: "r2-demo",
          service: "R2",
          family: "R2 Storage",
          description: "R2 标准存储",
          consumed: 6.42,
          consumedUnit: "GB-month",
          pricingQuantity: 0,
          pricingUnit: "GB-month",
          cost: 0,
          currency: "USD",
          chargePeriodStart: billingPeriodStart,
          chargePeriodEnd: dataThrough,
          zoneName: null,
          subscriptionId: "demo-subscription",
        },
        {
          id: "workers-demo",
          service: "Workers",
          family: "Workers Paid",
          description: "Workers 请求",
          consumed: 2_100_000,
          consumedUnit: "requests",
          pricingQuantity: 2.1,
          pricingUnit: "million requests",
          cost: 0.42,
          currency: "USD",
          chargePeriodStart: billingPeriodStart,
          chargePeriodEnd: dataThrough,
          zoneName: null,
          subscriptionId: "demo-subscription",
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
      "Billing · Billable Usage API V1",
    ].map((label, index) => ({
      id: `demo-${index}`,
      label,
      status: "ok" as const,
      cadence:
        index === 6
          ? "daily" as const
          : index === 5
            ? "snapshot" as const
            : "near-real-time" as const,
      dataAsOf: index === 6 ? dataThrough : now.toISOString(),
      message: "数据读取成功",
    })),
    realtimeCoverageGaps: [...REALTIME_COVERAGE_GAPS],
    disclaimer:
      "这是演示数据。实际额度卡用于估算近实时风险；可计费用量来自官方日级 Billable Usage API。所有日/月边界均按 UTC。",
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
