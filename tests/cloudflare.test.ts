import { describe, expect, it, vi } from "vitest";

import {
  CloudflareApiError,
  CloudflareClient,
} from "../worker/src/cloudflare";
import type { ResponseCache } from "../worker/src/cache";
import { getTimeWindows } from "../worker/src/lib/metrics";

const WINDOWS = getTimeWindows(new Date("2026-07-21T12:00:00.000Z"));

function json(value: unknown, status = 200): Response {
  return Response.json(value, { status });
}

function restResult(
  result: unknown,
  totalPages = 1,
): Record<string, unknown> {
  return {
    success: true,
    errors: [],
    result,
    result_info: { total_pages: totalPages },
  };
}

function billableRow(overrides: Record<string, unknown> = {}) {
  return {
    BilledCost: 0.42,
    BillingAccountId: "account-id",
    BillingAccountName: "Example",
    BillingCurrency: "USD",
    BillingPeriodStart: "2026-07-01T00:00:00.000Z",
    ChargeCategory: "Usage",
    ChargeClass: null,
    ChargeDescription: "Workers requests",
    ChargePeriodEnd: "2026-07-21T00:00:00.000Z",
    ChargePeriodStart: "2026-07-20T00:00:00.000Z",
    ConsumedQuantity: 12,
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
    ...overrides,
  };
}

describe("CloudflareClient", () => {
  it("preserves the global receiver for fetch-compatible functions", async () => {
    let receiver: unknown;
    const fetcher = vi.fn(function (this: unknown) {
      receiver = this;
      return Promise.resolve(
        json({
          data: {
            viewer: {
              accounts: [
                {
                  workersInvocationsAdaptive: [
                    {
                      sum: { requests: 12, errors: 1 },
                      dimensions: { scriptName: "usage-api" },
                    },
                  ],
                },
              ],
            },
          },
        }),
      );
    });
    const client = new CloudflareClient({
      accountId: "account-id",
      apiToken: "api-token",
      fetcher: fetcher as typeof fetch,
    });

    await expect(client.getWorkersUsage(WINDOWS)).resolves.toEqual({
      requests: 12,
      errors: 1,
      scripts: 1,
    });
    expect(receiver).toBe(globalThis);
  });

  it("paginates Pages projects and deployments without marking complete data partial", async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      const page = url.searchParams.get("page");

      if (url.pathname.endsWith("/pages/projects")) {
        return json(
          restResult(
            page === "1" ? [{ name: "alpha" }] : [{ name: "beta" }],
            2,
          ),
        );
      }

      if (url.pathname.endsWith("/projects/alpha/deployments")) {
        return json(
          restResult(
            page === "1"
              ? [
                  {
                    created_on: "2026-07-20T08:00:00.000Z",
                    deployment_trigger: { type: "github" },
                  },
                ]
              : [
                  {
                    created_on: "2026-06-30T23:59:59.000Z",
                    deployment_trigger: { type: "github" },
                  },
                ],
            2,
          ),
        );
      }

      if (url.pathname.endsWith("/projects/beta/deployments")) {
        return json(
          restResult([
            {
              created_on: "2026-07-18T08:00:00.000Z",
              deployment_trigger: { type: "gitlab" },
            },
            {
              created_on: "2026-07-17T08:00:00.000Z",
              deployment_trigger: { type: "ad_hoc" },
            },
            {
              created_on: "2026-07-16T08:00:00.000Z",
              is_skipped: true,
              deployment_trigger: { type: "github" },
            },
          ]),
        );
      }

      throw new Error(`Unexpected request: ${url}`);
    });
    const client = new CloudflareClient({
      accountId: "account-id",
      apiToken: "api-token",
      fetcher: fetcher as typeof fetch,
    });

    await expect(client.getPagesUsage(WINDOWS)).resolves.toEqual({
      builds: 2,
      projectsChecked: 2,
      partial: false,
      failedProjects: 0,
    });
    expect(
      fetcher.mock.calls.some(([input]) =>
        String(input).includes("projects?page=2&per_page=10"),
      ),
    ).toBe(true);
    expect(
      fetcher.mock.calls.some(([input]) =>
        String(input).includes("alpha%2Fdeployments"),
      ),
    ).toBe(false);
    expect(
      fetcher.mock.calls.some(([input]) =>
        String(input).includes("alpha/deployments?page=2&per_page=10"),
      ),
    ).toBe(true);
  });

  it("accepts GraphQL success responses with a null errors field", async () => {
    const fetcher = vi.fn(async () =>
      json({
        data: {
          viewer: {
            accounts: [
              {
                workersInvocationsAdaptive: [],
              },
            ],
          },
        },
        errors: null,
      }),
    );
    const client = new CloudflareClient({
      accountId: "account-id",
      apiToken: "api-token",
      fetcher: fetcher as typeof fetch,
    });

    await expect(client.getWorkersUsage(WINDOWS)).resolves.toEqual({
      requests: 0,
      errors: 0,
      scripts: 0,
    });
  });

  it("returns a lower-bound Pages count when one project cannot be read", async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      if (url.pathname.endsWith("/pages/projects")) {
        return json(restResult([{ name: "ok" }, { name: "denied" }]));
      }
      if (url.pathname.endsWith("/projects/denied/deployments")) {
        throw new Error("network unavailable");
      }
      return json(
        restResult([
          {
            created_on: "2026-07-20T08:00:00.000Z",
            deployment_trigger: { type: "github" },
          },
        ]),
      );
    });
    const client = new CloudflareClient({
      accountId: "account-id",
      apiToken: "api-token",
      fetcher: fetcher as typeof fetch,
    });

    await expect(client.getPagesUsage(WINDOWS)).resolves.toEqual({
      builds: 1,
      projectsChecked: 2,
      partial: true,
      failedProjects: 1,
    });
  });

  it("uses the official Billable Usage V1 info and usage methods", async () => {
    const cache = new MemoryResponseCache();
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      return url.pathname.endsWith("/billable-usage/info")
        ? json(restResult({
            covered: true,
            subscriptions: [
              {
                id: "subscription-id",
                billing_cycle_anchor_timestamp: "2026-07-01T00:00:00.000Z",
                start_timestamp: "2026-01-01T00:00:00.000Z",
              },
            ],
          }))
        : json(restResult([billableRow()]));
    });
    const client = new CloudflareClient({
      accountId: "account-id",
      apiToken: "api-token",
      fetcher: fetcher as typeof fetch,
      cache,
      cacheOrigin: "https://usage.example",
    });

    const result = await client.getBillableUsage();
    const cached = await client.getBillableUsage();

    expect(result).toMatchObject({
      covered: true,
      rows: [
        {
          ServiceName: "Workers",
          ServiceFamilyName: "Compute",
          ConsumedQuantity: 12,
          BilledCost: 0.42,
        },
      ],
    });
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(cached).toEqual(result);
    expect(cache.response?.headers.get("Cache-Control")).toBe(
      "public, max-age=3600",
    );
    expect(fetcher.mock.calls.map(([input]) => new URL(String(input)).pathname)).toEqual([
      "/client/v4/accounts/account-id/billable-usage/info",
      "/client/v4/accounts/account-id/billable-usage",
    ]);
  });

  it("does not invent defaults when a Billable Usage row violates the contract", async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      return url.pathname.endsWith("/billable-usage/info")
        ? json(restResult({ covered: true, subscriptions: [] }))
        : json(restResult([billableRow({ BilledCost: "0.42" })]));
    });
    const client = new CloudflareClient({
      accountId: "account-id",
      apiToken: "api-token",
      fetcher: fetcher as typeof fetch,
    });

    await expect(client.getBillableUsage()).rejects.toMatchObject({
      name: "ZodError",
    });
  });

  it("uses coverage info without requesting rows for an uncovered account", async () => {
    const fetcher = vi.fn(async () =>
      json(restResult({ covered: false, subscriptions: [] })),
    );
    const client = new CloudflareClient({
      accountId: "account-id",
      apiToken: "api-token",
      fetcher: fetcher as typeof fetch,
    });

    await expect(client.getBillableUsage()).resolves.toEqual({
      covered: false,
      subscriptions: [],
      rows: [],
    });
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it("surfaces GraphQL errors even when the data field is null", async () => {
    const fetcher = vi.fn(async () =>
      json({
        data: null,
        errors: [{ message: "permission denied\nsecret detail" }],
      }),
    );
    const client = new CloudflareClient({
      accountId: "account-id",
      apiToken: "api-token",
      fetcher: fetcher as typeof fetch,
    });

    await expect(client.getWorkersUsage(WINDOWS)).rejects.toEqual(
      expect.objectContaining<Partial<CloudflareApiError>>({
        name: "CloudflareApiError",
        message: "GraphQL 拒绝了查询：permission denied secret detail",
      }),
    );
  });
});

class MemoryResponseCache implements ResponseCache {
  response: Response | null = null;

  async match(): Promise<Response | undefined> {
    return this.response?.clone();
  }

  async put(_request: Request, response: Response): Promise<void> {
    this.response = response.clone();
  }
}
