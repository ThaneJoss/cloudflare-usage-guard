import type {
  MetricPeriod,
  MetricUnit,
  UsageMetric,
  UsagePrecision,
  UsageStatus,
} from "../../../shared/usage";

export const QUOTA_CATALOG_AS_OF = "2026-07-21";
export const DECIMAL_GB = 1_000_000_000;

export interface TimeWindows {
  dayStart: string;
  dayEnd: string;
  monthStart: string;
  monthEnd: string;
  storageStartDate: string;
  todayDate: string;
}

interface MetricInput {
  id: string;
  label: string;
  used: number | null;
  limit: number;
  unit: MetricUnit;
  period: MetricPeriod;
  resetAt: string | null;
  precision: UsagePrecision;
  note?: string | null;
}

export function createMetric(input: MetricInput): UsageMetric {
  const used = input.used === null ? null : Math.max(0, input.used);
  const utilization = used === null ? null : (used / input.limit) * 100;

  return {
    ...input,
    used,
    utilization,
    status: statusForUtilization(utilization),
    note: input.note ?? null,
  };
}

export function statusForUtilization(
  utilization: number | null,
): UsageStatus {
  if (utilization === null || !Number.isFinite(utilization)) {
    return "unavailable";
  }
  if (utilization >= 100) return "exceeded";
  if (utilization >= 90) return "critical";
  if (utilization >= 70) return "watch";
  return "ok";
}

export function getTimeWindows(now = new Date()): TimeWindows {
  const dayStart = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
  const dayEnd = new Date(dayStart);
  dayEnd.setUTCDate(dayEnd.getUTCDate() + 1);

  const monthStart = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
  );
  const monthEnd = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1),
  );

  const storageStart = new Date(dayStart);
  storageStart.setUTCDate(storageStart.getUTCDate() - 31);

  return {
    dayStart: dayStart.toISOString(),
    dayEnd: dayEnd.toISOString(),
    monthStart: monthStart.toISOString(),
    monthEnd: monthEnd.toISOString(),
    storageStartDate: storageStart.toISOString().slice(0, 10),
    todayDate: dayStart.toISOString().slice(0, 10),
  };
}

export interface StoragePoint {
  entity: string;
  timestamp: string;
  value: number;
}

export function sumLatestStoragePoints(points: StoragePoint[]): number {
  const latest = new Map<string, StoragePoint>();

  for (const point of points) {
    if (!Number.isFinite(point.value) || point.value < 0) continue;
    const existing = latest.get(point.entity);
    if (!existing || point.timestamp > existing.timestamp) {
      latest.set(point.entity, point);
    }
  }

  return [...latest.values()].reduce((sum, point) => sum + point.value, 0);
}

const R2_CLASS_A_ACTIONS = new Set([
  "ListBuckets",
  "PutBucket",
  "ListObjects",
  "PutObject",
  "CopyObject",
  "CompleteMultipartUpload",
  "CreateMultipartUpload",
  "UploadPart",
  "UploadPartCopy",
  "PutBucketEncryption",
  "PutBucketCors",
  "PutBucketLifecycleConfiguration",
  "PutBucketNotificationConfiguration",
]);

const R2_CLASS_B_ACTIONS = new Set([
  "HeadBucket",
  "HeadObject",
  "GetObject",
  "GetBucketEncryption",
  "GetBucketCors",
  "GetBucketLifecycleConfiguration",
  "GetBucketLocation",
  "GetBucketNotificationConfiguration",
  "UsageSummary",
]);

const R2_FREE_ACTIONS = new Set([
  "DeleteObject",
  "DeleteObjects",
  "DeleteBucket",
  "AbortMultipartUpload",
]);

export type R2OperationClass = "class-a" | "class-b" | "free" | "unknown";

export function classifyR2Operation(action: string): R2OperationClass {
  if (R2_CLASS_A_ACTIONS.has(action)) return "class-a";
  if (R2_CLASS_B_ACTIONS.has(action)) return "class-b";
  if (R2_FREE_ACTIONS.has(action)) return "free";
  return "unknown";
}

export function safeSum(values: number[]): number {
  return values.reduce(
    (sum, value) => sum + (Number.isFinite(value) ? value : 0),
    0,
  );
}
