import { describe, expect, it, vi } from "vitest";

import {
  CloudflareApiError,
  CloudflareClient,
} from "../worker/src/cloudflare";
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

describe("CloudflareClient", () => {
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
        String(input).includes("projects?page=2&per_page=100"),
      ),
    ).toBe(true);
    expect(
      fetcher.mock.calls.some(([input]) =>
        String(input).includes("alpha%2Fdeployments"),
      ),
    ).toBe(false);
    expect(
      fetcher.mock.calls.some(([input]) =>
        String(input).includes("alpha/deployments?page=2&per_page=100"),
      ),
    ).toBe(true);
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

  it("paginates and normalizes PayGo rows", async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const page = new URL(String(input)).searchParams.get("page");
      return json(
        {
          success: true,
          errors: [],
          result: [
            page === "1"
              ? {
                  ServiceName: "Workers",
                  ServiceFamilyName: "Compute",
                  ConsumedQuantity: "12",
                  ConsumedUnit: "requests",
                  PricingQuantity: "2",
                  ContractedCost: "0.42",
                  BillingCurrency: "USD",
                }
              : {
                  service_name: "R2",
                  service_family_name: "Storage",
                  consumed_quantity: 3,
                  consumed_unit: "GB-month",
                  pricing_quantity: 0,
                  contracted_cost: 0,
                  billing_currency: "USD",
                },
          ],
          result_info: {
            page: Number(page),
            per_page: 1,
            total_count: 2,
          },
        },
      );
    });
    const client = new CloudflareClient({
      accountId: "account-id",
      apiToken: "api-token",
      fetcher: fetcher as typeof fetch,
    });

    const rows = await client.getPaygoUsage();

    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      service: "Workers",
      family: "Compute",
      consumed: 12,
      pricingQuantity: 2,
      cost: 0.42,
      currency: "USD",
    });
    expect(rows[1]).toMatchObject({ service: "R2", consumed: 3 });
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
