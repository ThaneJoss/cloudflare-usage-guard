import type {
  CoverageGap,
  MetricPeriod,
  MetricUnit,
  ProductUsage,
} from "./usage";

export const QUOTA_CATALOG_AS_OF = "2026-07-27";

export interface QuotaMetricDefinition {
  id: string;
  label: string;
  limit: number;
  unit: MetricUnit;
  period: MetricPeriod;
}

type ProductMetadata = Pick<
  ProductUsage,
  | "id"
  | "name"
  | "eyebrow"
  | "description"
  | "behavior"
  | "behaviorLabel"
  | "documentationUrl"
  | "sourceLabel"
>;

interface ProductCatalogEntry extends ProductMetadata {
  metrics: Record<string, QuotaMetricDefinition>;
}

export const PRODUCT_CATALOG = {
  workers: {
    id: "workers",
    name: "Workers",
    eyebrow: "边缘计算",
    description: "HTTP 请求的每日免费额度。Cron 触发与部分内部调用可能采用不同计量规则。",
    behavior: "plan-dependent",
    behaviorLabel: "Free 停止 · Paid 超额计费",
    documentationUrl: "https://developers.cloudflare.com/workers/platform/pricing/",
    sourceLabel: "GraphQL · Workers Analytics",
    metrics: {
      requests: {
        id: "workers-requests",
        label: "请求",
        limit: 100_000,
        unit: "requests",
        period: "day",
      },
    },
  },
  kv: {
    id: "kv",
    name: "Workers KV",
    eyebrow: "键值存储",
    description: "读取、写入、删除和列表操作按 UTC 日独立计额；存储是账户总量。",
    behavior: "plan-dependent",
    behaviorLabel: "Free 操作失败 · Paid 超额计费",
    documentationUrl: "https://developers.cloudflare.com/kv/platform/pricing/",
    sourceLabel: "GraphQL · KV Analytics",
    metrics: {
      reads: {
        id: "kv-reads",
        label: "读取",
        limit: 100_000,
        unit: "operations",
        period: "day",
      },
      writes: {
        id: "kv-writes",
        label: "写入",
        limit: 1_000,
        unit: "operations",
        period: "day",
      },
      deletes: {
        id: "kv-deletes",
        label: "删除",
        limit: 1_000,
        unit: "operations",
        period: "day",
      },
      lists: {
        id: "kv-lists",
        label: "列表",
        limit: 1_000,
        unit: "operations",
        period: "day",
      },
      storage: {
        id: "kv-storage",
        label: "存储",
        limit: 1_000_000_000,
        unit: "bytes",
        period: "current",
      },
    },
  },
  d1: {
    id: "d1",
    name: "D1",
    eyebrow: "SQL 数据库",
    description: "行读取、行写入按 UTC 日计额；账户存储上限按所有数据库合计。",
    behavior: "plan-dependent",
    behaviorLabel: "Free 查询失败 · Paid 超额计费",
    documentationUrl: "https://developers.cloudflare.com/d1/platform/pricing/",
    sourceLabel: "GraphQL · D1 Analytics",
    metrics: {
      rowsRead: {
        id: "d1-rows-read",
        label: "读取行数",
        limit: 5_000_000,
        unit: "rows",
        period: "day",
      },
      rowsWritten: {
        id: "d1-rows-written",
        label: "写入行数",
        limit: 100_000,
        unit: "rows",
        period: "day",
      },
      storage: {
        id: "d1-storage",
        label: "账户存储",
        limit: 5_000_000_000,
        unit: "bytes",
        period: "current",
      },
    },
  },
  r2: {
    id: "r2",
    name: "R2",
    eyebrow: "对象存储",
    description: "免费层包含月度 Class A、Class B 与 GB-month 存储额度；网络出口免费。",
    behavior: "paid-overage",
    behaviorLabel: "超过免费层后计费",
    documentationUrl: "https://developers.cloudflare.com/r2/pricing/",
    sourceLabel: "GraphQL · R2 Analytics",
    metrics: {
      classA: {
        id: "r2-class-a",
        label: "Class A",
        limit: 1_000_000,
        unit: "operations",
        period: "month",
      },
      classB: {
        id: "r2-class-b",
        label: "Class B",
        limit: 10_000_000,
        unit: "operations",
        period: "month",
      },
      storage: {
        id: "r2-storage",
        label: "当前存储快照",
        limit: 10_000_000_000,
        unit: "bytes",
        period: "current",
      },
    },
  },
  queues: {
    id: "queues",
    name: "Queues",
    eyebrow: "消息队列",
    description: "发送、投递与确认/重试均可能形成计费操作，免费计划按 UTC 日计额。",
    behavior: "plan-dependent",
    behaviorLabel: "Free 停止 · Paid 超额计费",
    documentationUrl: "https://developers.cloudflare.com/queues/platform/pricing/",
    sourceLabel: "GraphQL · Queues Analytics",
    metrics: {
      operations: {
        id: "queues-operations",
        label: "计费操作",
        limit: 10_000,
        unit: "operations",
        period: "day",
      },
    },
  },
  pages: {
    id: "pages",
    name: "Pages",
    eyebrow: "前端部署",
    description: "免费计划每月最多 500 次构建；静态资源请求不计入 Workers 请求额度。",
    behavior: "hard-stop",
    behaviorLabel: "达到上限后构建停止",
    documentationUrl: "https://developers.cloudflare.com/pages/platform/limits/",
    sourceLabel: "REST · Pages Deployments",
    metrics: {
      builds: {
        id: "pages-builds",
        label: "构建次数",
        limit: 500,
        unit: "builds",
        period: "month",
      },
    },
  },
} as const satisfies Record<string, ProductCatalogEntry>;

export type ProductId = keyof typeof PRODUCT_CATALOG;

export function getProductMetadata(id: ProductId): ProductMetadata {
  const { metrics: _metrics, ...metadata } = PRODUCT_CATALOG[id];
  return metadata;
}

export const COVERAGE_GAPS: ReadonlyArray<CoverageGap> = [
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
    reason: "产品计费仍在演进，当前只展示覆盖缺口以避免误报。",
    documentationUrl: "https://developers.cloudflare.com/workflows/reference/pricing/",
  },
];
