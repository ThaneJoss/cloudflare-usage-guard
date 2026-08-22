import * as z from "zod/mini";

import type { UsagePayload } from "./usage";

const nullableNumber = z.nullable(z.number());
const nullableString = z.nullable(z.string());
const dateTime = z.iso.datetime({ offset: true });
const nullableDateTime = z.nullable(dateTime);

const usageMetricSchema = z.object({
  id: z.string(),
  label: z.string(),
  used: nullableNumber,
  limit: z.number(),
  unit: z.enum(["requests", "operations", "rows", "bytes", "builds"]),
  period: z.enum(["day", "month", "current"]),
  utilization: nullableNumber,
  status: z.enum(["ok", "watch", "critical", "exceeded", "unavailable"]),
  resetAt: nullableDateTime,
  precision: z.enum([
    "analytics-estimate",
    "api-count",
    "billing-exact",
    "lower-bound",
  ]),
  note: nullableString,
});

const productUsageSchema = z.object({
  id: z.string(),
  name: z.string(),
  eyebrow: z.string(),
  description: z.string(),
  behavior: z.enum(["hard-stop", "paid-overage", "plan-dependent"]),
  behaviorLabel: z.string(),
  documentationUrl: z.url(),
  sourceLabel: z.string(),
  available: z.boolean(),
  partial: z.boolean(),
  error: nullableString,
  metrics: z.array(usageMetricSchema),
  details: z.array(z.object({ label: z.string(), value: z.string() })),
});

const billingUsageSchema = z.object({
  available: z.boolean(),
  covered: z.nullable(z.boolean()),
  error: nullableString,
  billingPeriodStart: nullableDateTime,
  dataThrough: nullableDateTime,
  totalCost: nullableNumber,
  currency: nullableString,
  rows: z.array(
    z.object({
      id: z.string(),
      service: z.string(),
      family: z.string(),
      description: nullableString,
      consumed: z.number(),
      consumedUnit: z.string(),
      pricingQuantity: z.number(),
      pricingUnit: z.string(),
      cost: z.number(),
      currency: z.string(),
      chargePeriodStart: dateTime,
      chargePeriodEnd: dateTime,
      zoneName: nullableString,
      subscriptionId: nullableString,
    }),
  ),
});

const sourceHealthSchema = z.object({
  id: z.string(),
  label: z.string(),
  status: z.enum(["ok", "partial", "error"]),
  cadence: z.enum(["near-real-time", "snapshot", "daily"]),
  dataAsOf: nullableDateTime,
  message: z.string(),
});

export const usagePayloadSchema = z.object({
  generatedAt: dateTime,
  quotaCatalogAsOf: z.iso.date(),
  timezone: z.literal("UTC"),
  summary: z.object({
    overall: z.enum(["ok", "watch", "critical", "exceeded", "unknown"]),
    trackedMetrics: z.number(),
    attentionMetrics: z.number(),
    unavailableProducts: z.number(),
    healthySources: z.number(),
    totalSources: z.number(),
  }),
  products: z.array(productUsageSchema),
  billing: billingUsageSchema,
  sources: z.array(sourceHealthSchema),
  realtimeCoverageGaps: z.array(
    z.object({
      name: z.string(),
      allowance: z.string(),
      reason: z.string(),
      documentationUrl: z.url(),
    }),
  ),
  disclaimer: z.string(),
});

export function parseUsagePayload(value: unknown): UsagePayload {
  const parsed = usagePayloadSchema.safeParse(value);
  if (!parsed.success) {
    throw new Error("API 返回的数据结构不完整，请确认前后端版本一致。");
  }
  return parsed.data;
}
