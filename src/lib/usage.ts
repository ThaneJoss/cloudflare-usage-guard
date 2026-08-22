import type {
  BillingUsage,
  MetricPeriod,
  MetricUnit,
  OverageBehavior,
  ProductUsage,
  SourceHealth,
  UsageMetric,
  UsagePayload,
  UsageStatus,
} from "../../shared/usage";
export { parseUsagePayload } from "../../shared/usage-schema";

export type ProductFilter =
  | "all"
  | "attention"
  | "hard-stop"
  | "paid-overage"
  | "unavailable";

export interface MetricSignal {
  metric: UsageMetric;
  product: ProductUsage;
}

export const PRODUCT_FILTERS: ReadonlyArray<{
  id: ProductFilter;
  label: string;
}> = [
  { id: "all", label: "全部资源" },
  { id: "attention", label: "需要关注" },
  { id: "hard-stop", label: "达到即停" },
  { id: "paid-overage", label: "可能计费" },
  { id: "unavailable", label: "数据不可用" },
];

export function normalizeEndpoint(value: string): string {
  const normalized = value.trim().replace(/\/+$/, "");
  try {
    const url = new URL(normalized);
    const isLocal = url.hostname === "localhost" || url.hostname === "127.0.0.1";
    return url.protocol === "https:" || (url.protocol === "http:" && isLocal)
      ? url.origin
      : "";
  } catch {
    return "";
  }
}

export function matchesProductFilter(
  product: ProductUsage,
  filter: ProductFilter,
): boolean {
  if (filter === "all") return true;
  if (filter === "unavailable") return !product.available;
  if (filter === "hard-stop") return product.behavior === "hard-stop";
  if (filter === "paid-overage") {
    return (
      product.behavior === "paid-overage" ||
      product.behavior === "plan-dependent"
    );
  }
  const attentionStatuses = new Set<UsageStatus>([
    "watch",
    "critical",
    "exceeded",
  ]);
  return product.metrics.some((metric) => attentionStatuses.has(metric.status));
}

export function rankMetricSignals(products: ProductUsage[]): MetricSignal[] {
  return products
    .flatMap((product) =>
      product.metrics.map((metric) => ({ metric, product })),
    )
    .filter((signal) => signal.metric.utilization !== null)
    .toSorted(
      (left, right) =>
        (right.metric.utilization ?? 0) - (left.metric.utilization ?? 0),
    );
}

export function worstMetricStatus(metrics: UsageMetric[]): UsageStatus {
  const statuses = new Set(metrics.map((metric) => metric.status));
  if (statuses.has("exceeded")) return "exceeded";
  if (statuses.has("critical")) return "critical";
  if (statuses.has("watch")) return "watch";
  if (statuses.has("ok")) return "ok";
  return "unavailable";
}

export function statusLabel(
  status: UsagePayload["summary"]["overall"] | UsageStatus,
): string {
  const labels = {
    ok: "运行稳健",
    watch: "建议关注",
    critical: "接近上限",
    exceeded: "已经超限",
    unavailable: "数据不可用",
    unknown: "等待数据",
  } as const;
  return labels[status];
}

export function statusAction(
  status: UsagePayload["summary"]["overall"],
): string {
  const actions = {
    ok: "当前没有指标进入 70% 预警区间",
    watch: "已有指标超过 70%，建议检查增长速度",
    critical: "已有指标超过 90%，请优先处理",
    exceeded: "已有额度耗尽，服务或费用可能受到影响",
    unknown: "有效数据不足，先检查数据源健康状态",
  } as const;
  return actions[status];
}

export function behaviorLabel(behavior: OverageBehavior): string {
  if (behavior === "hard-stop") return "达到即停";
  if (behavior === "paid-overage") return "超额计费";
  return "取决于套餐";
}

export function formatMetricValue(value: number, unit: MetricUnit): string {
  return unit === "bytes" ? formatBytes(value) : formatCompact(value);
}

export function formatCompact(value: number): string {
  return new Intl.NumberFormat("zh-CN", {
    notation: Math.abs(value) >= 10_000 ? "compact" : "standard",
    maximumFractionDigits: Math.abs(value) >= 10_000 ? 1 : 0,
  }).format(value);
}

export function formatBytes(value: number): string {
  if (value >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(2)} GB`;
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)} MB`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)} KB`;
  return `${Math.round(value)} B`;
}

export function formatPercent(value: number): string {
  return value >= 100 ? value.toFixed(0) : value.toFixed(1).replace(".0", "");
}

export function formatMoney(value: number, currency: string): string {
  try {
    return new Intl.NumberFormat("zh-CN", {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
    }).format(value);
  } catch {
    return `${currency} ${value.toFixed(2)}`;
  }
}

export function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "UTC",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(new Date(value));
}

export function formatDate(value: string): string {
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "UTC",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(value));
}

export function resetLabel(value: string, now = Date.now()): string {
  const date = new Date(value);
  const diff = date.getTime() - now;
  if (diff > 0 && diff < 36 * 60 * 60 * 1_000) {
    const hours = Math.max(1, Math.ceil(diff / (60 * 60 * 1_000)));
    return `${hours} 小时后重置`;
  }
  return `${date.getUTCMonth() + 1}/${date.getUTCDate()} UTC 重置`;
}

export function periodLabel(period: MetricPeriod): string {
  return period === "day" ? "今日" : period === "month" ? "本月" : "当前";
}

export function billingPeriodLabel(billing: BillingUsage): string {
  if (!billing.billingPeriodStart) return "当前账期";
  if (!billing.dataThrough) return `${formatDate(billing.billingPeriodStart)} 起`;
  return `${formatDate(billing.billingPeriodStart)} — 数据截至 ${formatDate(billing.dataThrough)}`;
}

export function sourceHealthLabel(status: SourceHealth["status"]): string {
  if (status === "ok") return "正常";
  if (status === "partial") return "部分数据";
  return "读取失败";
}

export function sourceCadenceLabel(cadence: SourceHealth["cadence"]): string {
  if (cadence === "near-real-time") return "近实时";
  if (cadence === "daily") return "日级";
  return "快照";
}

export function precisionLabel(precision: UsageMetric["precision"]): string {
  const labels = {
    "analytics-estimate": "分析估算",
    "api-count": "API 计数",
    "billing-exact": "账单精确值",
    "lower-bound": "下限数据",
  } as const;
  return labels[precision];
}
