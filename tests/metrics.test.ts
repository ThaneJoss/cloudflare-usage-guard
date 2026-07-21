import { describe, expect, it } from "vitest";

import {
  classifyR2Operation,
  createMetric,
  getTimeWindows,
  safeSum,
  statusForUtilization,
  sumLatestStoragePoints,
} from "../worker/src/lib/metrics";

describe("usage metrics", () => {
  it.each([
    [null, "unavailable"],
    [Number.NaN, "unavailable"],
    [0, "ok"],
    [69.99, "ok"],
    [70, "watch"],
    [90, "critical"],
    [100, "exceeded"],
  ] as const)("classifies %s%% as %s", (utilization, expected) => {
    expect(statusForUtilization(utilization)).toBe(expected);
  });

  it("normalizes invalid usage without emitting non-finite JSON values", () => {
    expect(
      createMetric({
        id: "requests",
        label: "Requests",
        used: Number.POSITIVE_INFINITY,
        limit: 100,
        unit: "requests",
        period: "day",
        resetAt: null,
        precision: "analytics-estimate",
      }),
    ).toMatchObject({
      used: null,
      utilization: null,
      status: "unavailable",
    });

    expect(() =>
      createMetric({
        id: "invalid",
        label: "Invalid",
        used: 1,
        limit: 0,
        unit: "requests",
        period: "day",
        resetAt: null,
        precision: "analytics-estimate",
      }),
    ).toThrow(RangeError);
  });

  it("builds UTC day and month windows across a leap-day boundary", () => {
    expect(getTimeWindows(new Date("2028-02-29T23:59:59.000Z"))).toEqual({
      dayStart: "2028-02-29T00:00:00.000Z",
      dayEnd: "2028-03-01T00:00:00.000Z",
      monthStart: "2028-02-01T00:00:00.000Z",
      monthEnd: "2028-03-01T00:00:00.000Z",
      storageStartDate: "2028-01-29",
      todayDate: "2028-02-29",
    });
  });

  it("sums only the newest valid storage point for each resource", () => {
    expect(
      sumLatestStoragePoints([
        { entity: "a", timestamp: "2026-07-19", value: 10 },
        { entity: "a", timestamp: "2026-07-20", value: 25 },
        { entity: "b", timestamp: "2026-07-20", value: 5 },
        { entity: "b", timestamp: "2026-07-21", value: -1 },
        { entity: "c", timestamp: "2026-07-21", value: Number.NaN },
      ]),
    ).toBe(30);
    expect(safeSum([1, Number.NaN, 2, Number.POSITIVE_INFINITY])).toBe(3);
  });

  it.each([
    ["PutObject", "class-a"],
    ["LifecycleStorageTierTransition", "class-a"],
    ["ListMultipartUploads", "class-a"],
    ["ListParts", "class-a"],
    ["GetObject", "class-b"],
    ["DeleteObject", "free"],
    ["FutureOperation", "unknown"],
  ] as const)("maps R2 %s to %s", (operation, expected) => {
    expect(classifyR2Operation(operation)).toBe(expected);
  });
});
