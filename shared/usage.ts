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
  description: string | null;
  consumed: number;
  consumedUnit: string;
  pricingQuantity: number;
  pricingUnit: string;
  cost: number;
  currency: string;
  chargePeriodStart: string;
  chargePeriodEnd: string;
  zoneName: string | null;
  subscriptionId: string | null;
}

export interface BillingUsage {
  available: boolean;
  covered: boolean | null;
  error: string | null;
  billingPeriodStart: string | null;
  dataThrough: string | null;
  totalCost: number | null;
  currency: string | null;
  rows: BillingUsageRow[];
}

export type SourceCadence = "near-real-time" | "snapshot" | "daily";

export interface SourceHealth {
  id: string;
  label: string;
  status: "ok" | "partial" | "error";
  cadence: SourceCadence;
  dataAsOf: string | null;
  message: string;
}

export interface RealtimeCoverageGap {
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
  realtimeCoverageGaps: RealtimeCoverageGap[];
  disclaimer: string;
}
