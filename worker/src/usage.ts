import type {
  BillingUsage,
  ProductUsage,
  SourceHealth,
  UsageMetric,
  UsagePayload,
  UsageStatus,
  UsageSummary,
} from "../../shared/usage";
import {
  getProductMetadata,
  PRODUCT_CATALOG,
  QUOTA_CATALOG_AS_OF,
  REALTIME_COVERAGE_GAPS,
  type ProductId,
} from "../../shared/quota-catalog";
import {
  CloudflareClient,
  type BillableUsageRaw,
  type D1UsageRaw,
  type KvUsageRaw,
  type PagesUsageRaw,
  type QueueUsageRaw,
  type R2UsageRaw,
  type WorkersUsageRaw,
} from "./cloudflare";
import type { ResponseCache } from "./cache";
import {
  createMetric,
  getTimeWindows,
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
  cadence: SourceHealth["cadence"];
  unavailableMetrics: () => UsageMetric[];
}

export interface UsageCollectionOptions {
  cache?: ResponseCache;
  cacheOrigin?: string;
}

export interface UsageClient {
  getWorkersUsage(windows: TimeWindows): Promise<WorkersUsageRaw>;
  getKvUsage(windows: TimeWindows): Promise<KvUsageRaw>;
  getD1Usage(windows: TimeWindows): Promise<D1UsageRaw>;
  getR2Usage(windows: TimeWindows): Promise<R2UsageRaw>;
  getQueueUsage(windows: TimeWindows): Promise<QueueUsageRaw>;
  getPagesUsage(windows: TimeWindows): Promise<PagesUsageRaw>;
  getBillableUsage(): Promise<BillableUsageRaw>;
}

export async function collectUsage(
  env: Pick<Env, "CF_ACCOUNT_ID" | "CF_API_TOKEN">,
  now = new Date(),
  providedClient?: UsageClient,
  options: UsageCollectionOptions = {},
): Promise<UsagePayload> {
  const windows = getTimeWindows(now);
  const generatedAt = now.toISOString();
  const client =
    providedClient ??
    new CloudflareClient({
      accountId: env.CF_ACCOUNT_ID,
      apiToken: env.CF_API_TOKEN,
      ...(options.cache ? { cache: options.cache } : {}),
      ...(options.cacheOrigin ? { cacheOrigin: options.cacheOrigin } : {}),
    });

  const [productResults, billingResult] = await Promise.all([
    Promise.all([
      loadProduct(
        WORKERS_DEFINITION,
        generatedAt,
        () => client.getWorkersUsage(windows),
        (usage) => buildWorkersProduct(usage, windows),
      ),
      loadProduct(
        KV_DEFINITION,
        generatedAt,
        () => client.getKvUsage(windows),
        (usage) => buildKvProduct(usage, windows),
      ),
      loadProduct(
        D1_DEFINITION,
        generatedAt,
        () => client.getD1Usage(windows),
        (usage) => buildD1Product(usage, windows),
      ),
      loadProduct(
        R2_DEFINITION,
        generatedAt,
        () => client.getR2Usage(windows),
        (usage) => buildR2Product(usage, windows),
      ),
      loadProduct(
        QUEUES_DEFINITION,
        generatedAt,
        () => client.getQueueUsage(windows),
        (usage) => buildQueuesProduct(usage, windows),
      ),
      loadProduct(
        PAGES_DEFINITION,
        generatedAt,
        () => client.getPagesUsage(windows),
        (usage) => buildPagesProduct(usage, windows),
      ),
    ]),
    loadBilling(() => client.getBillableUsage()),
  ]);

  const products = productResults.map((result) => result.product);
  const sources = [
    ...productResults.map((result) => result.source),
    billingResult.source,
  ];

  return {
    generatedAt,
    quotaCatalogAsOf: QUOTA_CATALOG_AS_OF,
    timezone: "UTC",
    summary: summarize(products, sources),
    products,
    billing: billingResult.billing,
    sources,
    realtimeCoverageGaps: [...REALTIME_COVERAGE_GAPS],
    disclaimer:
      "额度卡使用 Analytics/REST 数据估算近实时风险，不等同于账单；可计费用量来自官方 Billable Usage API，按日更新且可能晚于当前活动。所有日/月边界均按 UTC。",
  };
}

async function loadProduct<T>(
  definition: ProductDefinition,
  dataAsOf: string,
  load: () => Promise<T>,
  build: (value: T) => ProductUsage,
): Promise<ProductLoadResult> {
  const startedAt = Date.now();
  try {
    const product = build(await load());
    return {
      product,
      source: {
        id: definition.id,
        label: definition.sourceLabel,
        status: product.partial ? "partial" : "ok",
        cadence: definition.cadence,
        dataAsOf,
        message: product.partial ? "返回了可用的下限数据" : "数据读取成功",
      },
    };
  } catch (error) {
    logSourceFailure(definition.id, error, Date.now() - startedAt);
    const message = publicErrorMessage(error);
    return {
      product: {
        ...productMetadata(definition),
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
        cadence: definition.cadence,
        dataAsOf: null,
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
      limit: PRODUCT_CATALOG.workers.metrics.requests.limit,
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
    dailyMetric(
      "kv-reads",
      "读取",
      usage.reads,
      PRODUCT_CATALOG.kv.metrics.reads.limit,
      windows,
    ),
    dailyMetric(
      "kv-writes",
      "写入",
      usage.writes,
      PRODUCT_CATALOG.kv.metrics.writes.limit,
      windows,
    ),
    dailyMetric(
      "kv-deletes",
      "删除",
      usage.deletes,
      PRODUCT_CATALOG.kv.metrics.deletes.limit,
      windows,
    ),
    dailyMetric(
      "kv-lists",
      "列表",
      usage.lists,
      PRODUCT_CATALOG.kv.metrics.lists.limit,
      windows,
    ),
    createMetric({
      id: "kv-storage",
      label: "存储",
      used: usage.storageBytes,
      limit: PRODUCT_CATALOG.kv.metrics.storage.limit,
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
    dailyRowsMetric(
      "d1-rows-read",
      "读取行数",
      usage.rowsRead,
      PRODUCT_CATALOG.d1.metrics.rowsRead.limit,
      windows,
    ),
    dailyRowsMetric(
      "d1-rows-written",
      "写入行数",
      usage.rowsWritten,
      PRODUCT_CATALOG.d1.metrics.rowsWritten.limit,
      windows,
    ),
    createMetric({
      id: "d1-storage",
      label: "账户存储",
      used: usage.storageBytes,
      limit: PRODUCT_CATALOG.d1.metrics.storage.limit,
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
    monthlyMetric(
      "r2-class-a",
      "Class A",
      usage.classA,
      PRODUCT_CATALOG.r2.metrics.classA.limit,
      windows,
    ),
    monthlyMetric(
      "r2-class-b",
      "Class B",
      usage.classB,
      PRODUCT_CATALOG.r2.metrics.classB.limit,
      windows,
    ),
    createMetric({
      id: "r2-storage",
      label: "当前存储快照",
      used: usage.storageBytes,
      limit: PRODUCT_CATALOG.r2.metrics.storage.limit,
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
      limit: PRODUCT_CATALOG.queues.metrics.operations.limit,
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
        limit: PRODUCT_CATALOG.pages.metrics.builds.limit,
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

async function loadBilling(load: () => Promise<BillableUsageRaw>): Promise<{
  billing: BillingUsage;
  source: SourceHealth;
}> {
  const startedAt = Date.now();
  try {
    const raw = await load();
    const rows = raw.rows.map((row) => ({
      id: billableUsageRowId(row),
      service: row.ServiceName,
      family: row.ServiceFamilyName ?? row.ServiceName,
      description: row.ChargeDescription,
      consumed: row.ConsumedQuantity,
      consumedUnit: row.ConsumedUnit,
      pricingQuantity: row.PricingQuantity,
      pricingUnit: row.PricingUnit,
      cost: row.BilledCost,
      currency: row.BillingCurrency,
      chargePeriodStart: row.ChargePeriodStart,
      chargePeriodEnd: row.ChargePeriodEnd,
      zoneName: row.ZoneName ?? null,
      subscriptionId: row.SubscriptionId ?? null,
    }));
    const currencies = new Set(rows.map((row) => row.currency));
    const currency = currencies.size === 1 ? rows[0]?.currency ?? null : null;
    const dataThrough = maxString(
      raw.rows.map((row) => row.ChargePeriodEnd),
    );
    const billing: BillingUsage = {
      available: true,
      covered: raw.covered,
      error: null,
      billingPeriodStart: minString(
        raw.rows.map((row) => row.BillingPeriodStart),
      ),
      dataThrough,
      totalCost: currency === null ? null : safeSum(rows.map((row) => row.cost)),
      currency,
      rows,
    };
    return {
      billing,
      source: {
        id: "billing",
        label: "Billing · Billable Usage API V1",
        status: raw.covered ? "ok" : "partial",
        cadence: "daily",
        dataAsOf: dataThrough,
        message: raw.covered
          ? rows.length
            ? "官方日级用量读取成功"
            : "本账期暂无可计费用量记录"
          : "此账户暂未被 Billable Usage API 覆盖",
      },
    };
  } catch (error) {
    logSourceFailure("billing", error, Date.now() - startedAt);
    const message = publicErrorMessage(error);
    return {
      billing: {
        available: false,
        covered: null,
        error: message,
        billingPeriodStart: null,
        dataThrough: null,
        totalCost: null,
        currency: null,
        rows: [],
      },
      source: {
        id: "billing",
        label: "Billing · Billable Usage API V1（可选）",
        status: "error",
        cadence: "daily",
        dataAsOf: null,
        message,
      },
    };
  }
}

function billableUsageRowId(row: BillableUsageRaw["rows"][number]): string {
  return [
    row.SubscriptionId ?? "account",
    row.ZoneId ?? "account",
    row.ServiceFamilyName ?? row.ServiceName,
    row.ServiceName,
    row.ChargeDescription ?? "usage",
    row.PricingUnit,
    row.ChargePeriodStart,
    row.ChargePeriodEnd,
  ]
    .map((part) => encodeURIComponent(part))
    .join(":");
}

function availableProduct(
  definition: ProductDefinition,
  metrics: UsageMetric[],
  details: ProductUsage["details"] = [],
): ProductUsage {
  return {
    ...productMetadata(definition),
    available: true,
    partial: false,
    error: null,
    metrics,
    details,
  };
}

function productMetadata(
  definition: ProductDefinition,
): Omit<ProductUsage, "available" | "partial" | "error" | "metrics" | "details"> {
  return {
    id: definition.id,
    name: definition.name,
    eyebrow: definition.eyebrow,
    description: definition.description,
    behavior: definition.behavior,
    behaviorLabel: definition.behaviorLabel,
    documentationUrl: definition.documentationUrl,
    sourceLabel: definition.sourceLabel,
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

function logSourceFailure(
  source: string,
  error: unknown,
  durationMs: number,
): void {
  console.warn(
    JSON.stringify({
      event: "cloudflare_source_failed",
      source,
      duration_ms: durationMs,
      error_name: error instanceof Error ? error.name : "UnknownError",
    }),
  );
}

function minString(values: Array<string | null>): string | null {
  const present = values.filter((value): value is string => value !== null);
  return present.length ? present.toSorted()[0] ?? null : null;
}

function maxString(values: Array<string | null>): string | null {
  const present = values.filter((value): value is string => value !== null);
  return present.length ? present.toSorted().at(-1) ?? null : null;
}

function formatInteger(value: number): string {
  return new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 0 }).format(value);
}

const WORKERS_DEFINITION = createProductDefinition("workers");
const KV_DEFINITION = createProductDefinition("kv");
const D1_DEFINITION = createProductDefinition("d1");
const R2_DEFINITION = createProductDefinition("r2");
const QUEUES_DEFINITION = createProductDefinition("queues");
const PAGES_DEFINITION = createProductDefinition("pages");

function createProductDefinition(id: ProductId): ProductDefinition {
  const metadata = getProductMetadata(id);
  const metrics = Object.values(PRODUCT_CATALOG[id].metrics);
  return {
    ...metadata,
    cadence: id === "pages" ? "snapshot" : "near-real-time",
    unavailableMetrics: () =>
      metrics.map((metric) =>
        unavailableMetric(
          metric.id,
          metric.label,
          metric.limit,
          metric.unit,
          metric.period,
        ),
      ),
  };
}
