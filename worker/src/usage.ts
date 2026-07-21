import type {
  BillingUsage,
  CoverageGap,
  ProductUsage,
  SourceHealth,
  UsageMetric,
  UsagePayload,
  UsageStatus,
  UsageSummary,
} from "../../shared/usage";
import {
  CloudflareClient,
  type D1UsageRaw,
  type KvUsageRaw,
  type PagesUsageRaw,
  type PaygoUsageRawRow,
  type QueueUsageRaw,
  type R2UsageRaw,
  type WorkersUsageRaw,
} from "./cloudflare";
import {
  createMetric,
  DECIMAL_GB,
  getTimeWindows,
  QUOTA_CATALOG_AS_OF,
  safeSum,
  type TimeWindows,
} from "./lib/metrics";

interface ProductLoadResult {
  product: ProductUsage;
  source: SourceHealth;
}

interface ProductDefinition {
  id: string;
  name: string;
  eyebrow: string;
  description: string;
  behavior: ProductUsage["behavior"];
  behaviorLabel: string;
  documentationUrl: string;
  sourceLabel: string;
  unavailableMetrics: () => UsageMetric[];
}

export interface UsageClient {
  getWorkersUsage(windows: TimeWindows): Promise<WorkersUsageRaw>;
  getKvUsage(windows: TimeWindows): Promise<KvUsageRaw>;
  getD1Usage(windows: TimeWindows): Promise<D1UsageRaw>;
  getR2Usage(windows: TimeWindows): Promise<R2UsageRaw>;
  getQueueUsage(windows: TimeWindows): Promise<QueueUsageRaw>;
  getPagesUsage(windows: TimeWindows): Promise<PagesUsageRaw>;
  getPaygoUsage(): Promise<PaygoUsageRawRow[]>;
}

export async function collectUsage(
  env: Pick<Env, "CF_ACCOUNT_ID" | "CF_API_TOKEN">,
  now = new Date(),
  providedClient?: UsageClient,
): Promise<UsagePayload> {
  const windows = getTimeWindows(now);
  const client =
    providedClient ??
    new CloudflareClient({
      accountId: env.CF_ACCOUNT_ID,
      apiToken: env.CF_API_TOKEN,
    });

  const productResults = await Promise.all([
    loadProduct(
      WORKERS_DEFINITION,
      () => client.getWorkersUsage(windows),
      (usage) => buildWorkersProduct(usage, windows),
    ),
    loadProduct(
      KV_DEFINITION,
      () => client.getKvUsage(windows),
      (usage) => buildKvProduct(usage, windows),
    ),
    loadProduct(
      D1_DEFINITION,
      () => client.getD1Usage(windows),
      (usage) => buildD1Product(usage, windows),
    ),
    loadProduct(
      R2_DEFINITION,
      () => client.getR2Usage(windows),
      (usage) => buildR2Product(usage, windows),
    ),
    loadProduct(
      QUEUES_DEFINITION,
      () => client.getQueueUsage(windows),
      (usage) => buildQueuesProduct(usage, windows),
    ),
    loadProduct(
      PAGES_DEFINITION,
      () => client.getPagesUsage(windows),
      (usage) => buildPagesProduct(usage, windows),
    ),
  ]);

  const billingResult = await loadBilling(() => client.getPaygoUsage());
  const products = productResults.map((result) => result.product);
  const sources = [
    ...productResults.map((result) => result.source),
    billingResult.source,
  ];

  return {
    generatedAt: now.toISOString(),
    quotaCatalogAsOf: QUOTA_CATALOG_AS_OF,
    timezone: "UTC",
    summary: summarize(products, sources),
    products,
    billing: billingResult.billing,
    sources,
    coverageGaps: COVERAGE_GAPS,
    disclaimer:
      "额度卡使用 Cloudflare Analytics/REST API 的运行数据估算，不等同于账单；PayGo 表（若账户和权限支持）才是可计费用量来源。所有日/月边界均按 UTC。",
  };
}

async function loadProduct<T>(
  definition: ProductDefinition,
  load: () => Promise<T>,
  build: (value: T) => ProductUsage,
): Promise<ProductLoadResult> {
  try {
    const product = build(await load());
    return {
      product,
      source: {
        id: definition.id,
        label: definition.sourceLabel,
        status: product.partial ? "partial" : "ok",
        message: product.partial ? "返回了可用的下限数据" : "数据读取成功",
      },
    };
  } catch (error) {
    const message = publicErrorMessage(error);
    return {
      product: {
        ...definition,
        available: false,
        partial: false,
        error: message,
        metrics: definition.unavailableMetrics(),
        details: [],
      },
      source: {
        id: definition.id,
        label: definition.sourceLabel,
        status: "error",
        message,
      },
    };
  }
}

function buildWorkersProduct(
  usage: WorkersUsageRaw,
  windows: TimeWindows,
): ProductUsage {
  return availableProduct(WORKERS_DEFINITION, [
    createMetric({
      id: "workers-requests",
      label: "请求",
      used: usage.requests,
      limit: 100_000,
      unit: "requests",
      period: "day",
      resetAt: windows.dayEnd,
      precision: "analytics-estimate",
    }),
  ], [
    { label: "活跃脚本", value: String(usage.scripts) },
    { label: "错误请求", value: formatInteger(usage.errors) },
  ]);
}

function buildKvProduct(usage: KvUsageRaw, windows: TimeWindows): ProductUsage {
  return availableProduct(KV_DEFINITION, [
    dailyMetric("kv-reads", "读取", usage.reads, 100_000, windows),
    dailyMetric("kv-writes", "写入", usage.writes, 1_000, windows),
    dailyMetric("kv-deletes", "删除", usage.deletes, 1_000, windows),
    dailyMetric("kv-lists", "列表", usage.lists, 1_000, windows),
    createMetric({
      id: "kv-storage",
      label: "存储",
      used: usage.storageBytes,
      limit: DECIMAL_GB,
      unit: "bytes",
      period: "current",
      resetAt: null,
      precision: "analytics-estimate",
      note: "按每个 namespace 的最新可见存储点求和",
    }),
  ], usage.otherOperations > 0
    ? [{ label: "未分类操作", value: formatInteger(usage.otherOperations) }]
    : []);
}

function buildD1Product(usage: D1UsageRaw, windows: TimeWindows): ProductUsage {
  return availableProduct(D1_DEFINITION, [
    dailyRowsMetric("d1-rows-read", "读取行数", usage.rowsRead, 5_000_000, windows),
    dailyRowsMetric(
      "d1-rows-written",
      "写入行数",
      usage.rowsWritten,
      100_000,
      windows,
    ),
    createMetric({
      id: "d1-storage",
      label: "账户存储",
      used: usage.storageBytes,
      limit: 5 * DECIMAL_GB,
      unit: "bytes",
      period: "current",
      resetAt: null,
      precision: "analytics-estimate",
      note: "按每个数据库的最新可见存储点求和",
    }),
  ]);
}

function buildR2Product(usage: R2UsageRaw, windows: TimeWindows): ProductUsage {
  const details = [
    { label: "免费操作", value: formatInteger(usage.freeOperations) },
  ];
  if (usage.unknownOperations > 0) {
    details.push({
      label: "未分类操作",
      value: formatInteger(usage.unknownOperations),
    });
  }

  return availableProduct(R2_DEFINITION, [
    monthlyMetric("r2-class-a", "Class A", usage.classA, 1_000_000, windows),
    monthlyMetric("r2-class-b", "Class B", usage.classB, 10_000_000, windows),
    createMetric({
      id: "r2-storage",
      label: "当前存储快照",
      used: usage.storageBytes,
      limit: 10 * DECIMAL_GB,
      unit: "bytes",
      period: "current",
      resetAt: windows.monthEnd,
      precision: "analytics-estimate",
      note: "免费额度按 GB-month 计费；当前快照仅用于预警，不是精确月均值",
    }),
  ], details);
}

function buildQueuesProduct(
  usage: QueueUsageRaw,
  windows: TimeWindows,
): ProductUsage {
  return availableProduct(QUEUES_DEFINITION, [
    createMetric({
      id: "queues-operations",
      label: "计费操作",
      used: usage.billableOperations,
      limit: 10_000,
      unit: "operations",
      period: "day",
      resetAt: windows.dayEnd,
      precision: "analytics-estimate",
    }),
  ]);
}

function buildPagesProduct(
  usage: PagesUsageRaw,
  windows: TimeWindows,
): ProductUsage {
  return {
    ...availableProduct(PAGES_DEFINITION, [
      createMetric({
        id: "pages-builds",
        label: "构建次数",
        used: usage.builds,
        limit: 500,
        unit: "builds",
        period: "month",
        resetAt: windows.monthEnd,
        precision: usage.partial ? "lower-bound" : "api-count",
        note: "仅统计 Git push 与 deploy hook；Direct Upload 不消耗构建额度",
      }),
    ], [
      { label: "已检查项目", value: String(usage.projectsChecked) },
      { label: "读取失败项目", value: String(usage.failedProjects) },
    ]),
    partial: usage.partial,
  };
}

async function loadBilling(load: () => Promise<PaygoUsageRawRow[]>): Promise<{
  billing: BillingUsage;
  source: SourceHealth;
}> {
  try {
    const rawRows = await load();
    const rows = rawRows.map((row) => ({
      id: row.id,
      service: row.service,
      family: row.family,
      consumed: row.consumed,
      consumedUnit: row.consumedUnit,
      pricingQuantity: row.pricingQuantity,
      cost: row.cost,
      currency: row.currency,
    }));
    const currencies = new Set(rows.map((row) => row.currency));
    const currency = currencies.size === 1 ? rows[0]?.currency ?? null : null;
    const billing: BillingUsage = {
      available: true,
      error: null,
      periodStart: minString(rawRows.map((row) => row.periodStart)),
      periodEnd: maxString(rawRows.map((row) => row.periodEnd)),
      totalCost: currency === null ? null : safeSum(rows.map((row) => row.cost)),
      currency,
      rows,
    };
    return {
      billing,
      source: {
        id: "billing",
        label: "Billing PayGo API",
        status: "ok",
        message: rows.length ? "本账期用量读取成功" : "本账期暂无 PayGo 明细",
      },
    };
  } catch (error) {
    const message = publicErrorMessage(error);
    return {
      billing: {
        available: false,
        error: message,
        periodStart: null,
        periodEnd: null,
        totalCost: null,
        currency: null,
        rows: [],
      },
      source: {
        id: "billing",
        label: "Billing PayGo API（可选）",
        status: "error",
        message,
      },
    };
  }
}

function availableProduct(
  definition: ProductDefinition,
  metrics: UsageMetric[],
  details: ProductUsage["details"] = [],
): ProductUsage {
  return {
    ...definition,
    available: true,
    partial: false,
    error: null,
    metrics,
    details,
  };
}

function dailyMetric(
  id: string,
  label: string,
  used: number,
  limit: number,
  windows: TimeWindows,
): UsageMetric {
  return createMetric({
    id,
    label,
    used,
    limit,
    unit: "operations",
    period: "day",
    resetAt: windows.dayEnd,
    precision: "analytics-estimate",
  });
}

function dailyRowsMetric(
  id: string,
  label: string,
  used: number,
  limit: number,
  windows: TimeWindows,
): UsageMetric {
  return createMetric({
    id,
    label,
    used,
    limit,
    unit: "rows",
    period: "day",
    resetAt: windows.dayEnd,
    precision: "analytics-estimate",
  });
}

function monthlyMetric(
  id: string,
  label: string,
  used: number,
  limit: number,
  windows: TimeWindows,
): UsageMetric {
  return createMetric({
    id,
    label,
    used,
    limit,
    unit: "operations",
    period: "month",
    resetAt: windows.monthEnd,
    precision: "analytics-estimate",
  });
}

function unavailableMetric(
  id: string,
  label: string,
  limit: number,
  unit: UsageMetric["unit"],
  period: UsageMetric["period"],
): UsageMetric {
  return createMetric({
    id,
    label,
    used: null,
    limit,
    unit,
    period,
    resetAt: null,
    precision: "analytics-estimate",
  });
}

function summarize(
  products: ProductUsage[],
  sources: SourceHealth[],
): UsageSummary {
  const metrics = products.flatMap((product) => product.metrics);
  const available = metrics.filter((metric) => metric.status !== "unavailable");
  const attention = available.filter((metric) =>
    ["watch", "critical", "exceeded"].includes(metric.status),
  );
  const overall = worstStatus(available.map((metric) => metric.status));

  return {
    overall,
    trackedMetrics: available.length,
    attentionMetrics: attention.length,
    unavailableProducts: products.filter((product) => !product.available).length,
    healthySources: sources.filter((source) => source.status === "ok").length,
    totalSources: sources.length,
  };
}

function worstStatus(
  statuses: UsageStatus[],
): UsageSummary["overall"] {
  if (statuses.includes("exceeded")) return "exceeded";
  if (statuses.includes("critical")) return "critical";
  if (statuses.includes("watch")) return "watch";
  if (statuses.includes("ok")) return "ok";
  return "unknown";
}

function publicErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    if (error.name === "ZodError") return "Cloudflare API 响应格式与预期不一致";
    if (error.name === "TimeoutError") return "Cloudflare API 请求超时";
    return error.message.replace(/[\r\n]+/g, " ").slice(0, 220);
  }
  return "数据源发生未知错误";
}

function minString(values: Array<string | null>): string | null {
  const present = values.filter((value): value is string => value !== null);
  return present.length ? present.sort()[0] ?? null : null;
}

function maxString(values: Array<string | null>): string | null {
  const present = values.filter((value): value is string => value !== null);
  return present.length ? present.sort().at(-1) ?? null : null;
}

function formatInteger(value: number): string {
  return new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 0 }).format(value);
}

const WORKERS_DEFINITION: ProductDefinition = {
  id: "workers",
  name: "Workers",
  eyebrow: "边缘计算",
  description: "HTTP 请求的每日免费额度。Cron 触发与部分内部调用可能采用不同计量规则。",
  behavior: "plan-dependent",
  behaviorLabel: "Free 停止 · Paid 超额计费",
  documentationUrl: "https://developers.cloudflare.com/workers/platform/pricing/",
  sourceLabel: "GraphQL · Workers Analytics",
  unavailableMetrics: () => [
    unavailableMetric("workers-requests", "请求", 100_000, "requests", "day"),
  ],
};

const KV_DEFINITION: ProductDefinition = {
  id: "kv",
  name: "Workers KV",
  eyebrow: "键值存储",
  description: "读取、写入、删除和列表操作按 UTC 日独立计额；存储是账户总量。",
  behavior: "plan-dependent",
  behaviorLabel: "Free 操作失败 · Paid 超额计费",
  documentationUrl: "https://developers.cloudflare.com/kv/platform/pricing/",
  sourceLabel: "GraphQL · KV Analytics",
  unavailableMetrics: () => [
    unavailableMetric("kv-reads", "读取", 100_000, "operations", "day"),
    unavailableMetric("kv-writes", "写入", 1_000, "operations", "day"),
    unavailableMetric("kv-deletes", "删除", 1_000, "operations", "day"),
    unavailableMetric("kv-lists", "列表", 1_000, "operations", "day"),
    unavailableMetric("kv-storage", "存储", DECIMAL_GB, "bytes", "current"),
  ],
};

const D1_DEFINITION: ProductDefinition = {
  id: "d1",
  name: "D1",
  eyebrow: "SQL 数据库",
  description: "行读取、行写入按 UTC 日计额；账户存储上限按所有数据库合计。",
  behavior: "plan-dependent",
  behaviorLabel: "Free 查询失败 · Paid 超额计费",
  documentationUrl: "https://developers.cloudflare.com/d1/platform/pricing/",
  sourceLabel: "GraphQL · D1 Analytics",
  unavailableMetrics: () => [
    unavailableMetric("d1-rows-read", "读取行数", 5_000_000, "rows", "day"),
    unavailableMetric("d1-rows-written", "写入行数", 100_000, "rows", "day"),
    unavailableMetric("d1-storage", "账户存储", 5 * DECIMAL_GB, "bytes", "current"),
  ],
};

const R2_DEFINITION: ProductDefinition = {
  id: "r2",
  name: "R2",
  eyebrow: "对象存储",
  description: "免费层包含月度 Class A、Class B 与 GB-month 存储额度；网络出口免费。",
  behavior: "paid-overage",
  behaviorLabel: "超过免费层后计费",
  documentationUrl: "https://developers.cloudflare.com/r2/pricing/",
  sourceLabel: "GraphQL · R2 Analytics",
  unavailableMetrics: () => [
    unavailableMetric("r2-class-a", "Class A", 1_000_000, "operations", "month"),
    unavailableMetric("r2-class-b", "Class B", 10_000_000, "operations", "month"),
    unavailableMetric("r2-storage", "当前存储快照", 10 * DECIMAL_GB, "bytes", "current"),
  ],
};

const QUEUES_DEFINITION: ProductDefinition = {
  id: "queues",
  name: "Queues",
  eyebrow: "消息队列",
  description: "发送、投递与确认/重试均可能形成计费操作，免费计划按 UTC 日计额。",
  behavior: "plan-dependent",
  behaviorLabel: "Free 停止 · Paid 超额计费",
  documentationUrl: "https://developers.cloudflare.com/queues/platform/pricing/",
  sourceLabel: "GraphQL · Queues Analytics",
  unavailableMetrics: () => [
    unavailableMetric("queues-operations", "计费操作", 10_000, "operations", "day"),
  ],
};

const PAGES_DEFINITION: ProductDefinition = {
  id: "pages",
  name: "Pages",
  eyebrow: "前端部署",
  description: "免费计划每月最多 500 次构建；静态资源请求不计入 Workers 请求额度。",
  behavior: "hard-stop",
  behaviorLabel: "达到上限后构建停止",
  documentationUrl: "https://developers.cloudflare.com/pages/platform/limits/",
  sourceLabel: "REST · Pages Deployments",
  unavailableMetrics: () => [
    unavailableMetric("pages-builds", "构建次数", 500, "builds", "month"),
  ],
};

const COVERAGE_GAPS: CoverageGap[] = [
  {
    name: "Workers AI",
    allowance: "10,000 neurons / UTC 日",
    reason: "当前版本未接入按账户汇总的稳定公开用量接口。",
    documentationUrl: "https://developers.cloudflare.com/workers-ai/platform/pricing/",
  },
  {
    name: "Images",
    allowance: "5,000 unique transformations / 月",
    reason: "转换计量口径需要结合 Images 专用分析数据，暂不混入统一估算。",
    documentationUrl: "https://developers.cloudflare.com/images/pricing/",
  },
  {
    name: "Vectorize",
    allowance: "30M queried + 5M stored dimensions / 月",
    reason: "当前版本未接入 Vectorize 的账户级用量聚合。",
    documentationUrl: "https://developers.cloudflare.com/vectorize/platform/pricing/",
  },
  {
    name: "Browser Rendering",
    allowance: "10 browser minutes / UTC 日",
    reason: "当前版本未接入 Browser Rendering 用量接口。",
    documentationUrl: "https://developers.cloudflare.com/browser-rendering/platform/pricing/",
  },
  {
    name: "Workflows",
    allowance: "3,000 steps / UTC 日",
    reason: "产品计费仍在演进，当前版本只展示覆盖缺口以避免误报。",
    documentationUrl: "https://developers.cloudflare.com/workflows/platform/pricing/",
  },
];
