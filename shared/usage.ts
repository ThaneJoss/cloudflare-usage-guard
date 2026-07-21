export type UsageStatus =
  | "ok"
  | "watch"
  | "critical"
  | "exceeded"
  | "unavailable";

export type OverageBehavior =
  | "hard-stop"
  | "paid-overage"
  | "plan-dependent";

export type UsagePrecision =
  | "analytics-estimate"
  | "api-count"
  | "billing-exact"
  | "lower-bound";

export type MetricPeriod = "day" | "month" | "current";

export type MetricUnit =
  | "requests"
  | "operations"
  | "rows"
  | "bytes"
  | "builds";

export interface UsageMetric {
  id: string;
  label: string;
  used: number | null;
  limit: number;
  unit: MetricUnit;
  period: MetricPeriod;
  utilization: number | null;
  status: UsageStatus;
  resetAt: string | null;
  precision: UsagePrecision;
  note: string | null;
}

export interface ProductDetail {
  label: string;
  value: string;
}

export interface ProductUsage {
  id: string;
  name: string;
  eyebrow: string;
  description: string;
  behavior: OverageBehavior;
  behaviorLabel: string;
  documentationUrl: string;
  sourceLabel: string;
  available: boolean;
  partial: boolean;
  error: string | null;
  metrics: UsageMetric[];
  details: ProductDetail[];
}

export interface BillingUsageRow {
  id: string;
  service: string;
  family: string;
  consumed: number;
  consumedUnit: string;
  pricingQuantity: number;
  cost: number;
  currency: string;
}

export interface BillingUsage {
  available: boolean;
  error: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  totalCost: number | null;
  currency: string | null;
  rows: BillingUsageRow[];
}

export interface SourceHealth {
  id: string;
  label: string;
  status: "ok" | "partial" | "error";
  message: string;
}

export interface CoverageGap {
  name: string;
  allowance: string;
  reason: string;
  documentationUrl: string;
}

export interface UsageSummary {
  overall: Exclude<UsageStatus, "unavailable"> | "unknown";
  trackedMetrics: number;
  attentionMetrics: number;
  unavailableProducts: number;
  healthySources: number;
  totalSources: number;
}

export interface UsagePayload {
  generatedAt: string;
  quotaCatalogAsOf: string;
  timezone: "UTC";
  summary: UsageSummary;
  products: ProductUsage[];
  billing: BillingUsage;
  sources: SourceHealth[];
  coverageGaps: CoverageGap[];
  disclaimer: string;
}
