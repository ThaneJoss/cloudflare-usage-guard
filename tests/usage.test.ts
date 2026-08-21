import { describe, expect, it, vi } from "vitest";

import { getTimeWindows } from "../worker/src/lib/metrics";
import { collectUsage, type UsageClient } from "../worker/src/usage";

describe("collectUsage", () => {
  it("isolates product failures and summarizes the remaining data", async () => {
    const now = new Date("2026-07-21T12:34:56.000Z");
    const client: UsageClient = {
      getWorkersUsage: vi.fn().mockResolvedValue({
        requests: 95_000,
        errors: 12,
        scripts: 3,
      }),
      getKvUsage: vi.fn().mockRejectedValue(new Error("permission denied\nkv")),
      getD1Usage: vi.fn().mockResolvedValue({
        rowsRead: 100,
        rowsWritten: 20,
        storageBytes: 1_000,
      }),
      getR2Usage: vi.fn().mockResolvedValue({
        classA: 20,
        classB: 30,
        freeOperations: 10,
        unknownOperations: 2,
        storageBytes: 2_000,
      }),
      getQueueUsage: vi.fn().mockResolvedValue({
        billableOperations: 10_000,
      }),
      getPagesUsage: vi.fn().mockResolvedValue({
        builds: 500,
        projectsChecked: 4,
        partial: true,
        failedProjects: 1,
      }),
      getBillableUsage: vi.fn().mockResolvedValue({
        covered: true,
        subscriptions: [],
        rows: [billableRow()],
      }),
    };

    const result = await collectUsage(
      { CF_ACCOUNT_ID: "account", CF_API_TOKEN: "token" },
      now,
      client,
    );

    expect(result.generatedAt).toBe(now.toISOString());
    expect(result.summary).toEqual({
      overall: "exceeded",
      trackedMetrics: 9,
      attentionMetrics: 3,
      unavailableProducts: 1,
      healthySources: 5,
      totalSources: 7,
    });
    expect(result.products.find((product) => product.id === "kv")).toMatchObject({
      available: false,
      error: "permission denied kv",
    });
    expect(
      result.products.find((product) => product.id === "pages"),
    ).toMatchObject({
      available: true,
      partial: true,
      metrics: [
        expect.objectContaining({
          used: 500,
          status: "exceeded",
          precision: "lower-bound",
        }),
      ],
    });
    expect(result.billing).toMatchObject({
      available: true,
      covered: true,
      totalCost: 0.42,
      currency: "USD",
      billingPeriodStart: "2026-07-01T00:00:00.000Z",
      dataThrough: "2026-07-21T00:00:00.000Z",
    });
    expect(result.sources[0]).toMatchObject({
      cadence: "near-real-time",
      dataAsOf: now.toISOString(),
    });
    expect(result.sources.at(-1)).toMatchObject({
      cadence: "daily",
      dataAsOf: "2026-07-21T00:00:00.000Z",
    });
    expect(result.realtimeCoverageGaps.length).toBeGreaterThan(0);
    expect(client.getWorkersUsage).toHaveBeenCalledWith(getTimeWindows(now));
  });

  it("keeps optional billing failures from hiding quota data", async () => {
    const zeroClient: UsageClient = {
      getWorkersUsage: vi.fn().mockResolvedValue({ requests: 0, errors: 0, scripts: 0 }),
      getKvUsage: vi.fn().mockResolvedValue({
        reads: 0,
        writes: 0,
        deletes: 0,
        lists: 0,
        otherOperations: 0,
        storageBytes: 0,
      }),
      getD1Usage: vi.fn().mockResolvedValue({ rowsRead: 0, rowsWritten: 0, storageBytes: 0 }),
      getR2Usage: vi.fn().mockResolvedValue({
        classA: 0,
        classB: 0,
        freeOperations: 0,
        unknownOperations: 0,
        storageBytes: 0,
      }),
      getQueueUsage: vi.fn().mockResolvedValue({ billableOperations: 0 }),
      getPagesUsage: vi.fn().mockResolvedValue({
        builds: 0,
        projectsChecked: 0,
        partial: false,
        failedProjects: 0,
      }),
      getBillableUsage: vi.fn().mockRejectedValue(new Error("Billing Read required")),
    };

    const result = await collectUsage(
      { CF_ACCOUNT_ID: "account", CF_API_TOKEN: "token" },
      new Date("2026-07-21T12:00:00.000Z"),
      zeroClient,
    );

    expect(result.summary.overall).toBe("ok");
    expect(result.summary.trackedMetrics).toBe(14);
    expect(result.billing).toMatchObject({
      available: false,
      error: "Billing Read required",
      rows: [],
    });
    expect(result.sources.at(-1)).toMatchObject({
      id: "billing",
      status: "error",
    });
  });

  it("distinguishes an uncovered account from a Billing permission failure", async () => {
    const client = zeroUsageClient();
    client.getBillableUsage = vi.fn().mockResolvedValue({
      covered: false,
      subscriptions: [],
      rows: [],
    });

    const result = await collectUsage(
      { CF_ACCOUNT_ID: "account", CF_API_TOKEN: "token" },
      new Date("2026-07-21T12:00:00.000Z"),
      client,
    );

    expect(result.billing).toMatchObject({
      available: true,
      covered: false,
      error: null,
      rows: [],
    });
    expect(result.sources.at(-1)).toMatchObject({
      status: "partial",
      message: "此账户暂未被 Billable Usage API 覆盖",
    });
  });
});

function zeroUsageClient(): UsageClient {
  return {
    getWorkersUsage: vi.fn().mockResolvedValue({ requests: 0, errors: 0, scripts: 0 }),
    getKvUsage: vi.fn().mockResolvedValue({
      reads: 0,
      writes: 0,
      deletes: 0,
      lists: 0,
      otherOperations: 0,
      storageBytes: 0,
    }),
    getD1Usage: vi.fn().mockResolvedValue({ rowsRead: 0, rowsWritten: 0, storageBytes: 0 }),
    getR2Usage: vi.fn().mockResolvedValue({
      classA: 0,
      classB: 0,
      freeOperations: 0,
      unknownOperations: 0,
      storageBytes: 0,
    }),
    getQueueUsage: vi.fn().mockResolvedValue({ billableOperations: 0 }),
    getPagesUsage: vi.fn().mockResolvedValue({
      builds: 0,
      projectsChecked: 0,
      partial: false,
      failedProjects: 0,
    }),
    getBillableUsage: vi.fn().mockResolvedValue({
      covered: true,
      subscriptions: [],
      rows: [],
    }),
  };
}

function billableRow() {
  return {
    BilledCost: 0.42,
    BillingAccountId: "account",
    BillingAccountName: "Example",
    BillingCurrency: "USD",
    BillingPeriodStart: "2026-07-01T00:00:00.000Z",
    ChargeCategory: "Usage" as const,
    ChargeClass: null,
    ChargeDescription: "Workers requests",
    ChargePeriodEnd: "2026-07-21T00:00:00.000Z",
    ChargePeriodStart: "2026-07-20T00:00:00.000Z",
    ConsumedQuantity: 10,
    ConsumedUnit: "requests",
    ContractedCost: 0.42,
    CumulatedContractedCost: 0.42,
    CumulatedPricingQuantity: 2,
    EffectiveCost: 0.42,
    HostProviderName: "Cloudflare",
    InvoiceIssuerName: "Cloudflare",
    ListCost: 0.42,
    PricingQuantity: 2,
    PricingUnit: "million requests",
    ServiceName: "Workers",
    ServiceProviderName: "Cloudflare",
    ServiceFamilyName: "Compute",
    SubscriptionId: "subscription-id",
    ZoneId: null,
    ZoneName: null,
  };
}
