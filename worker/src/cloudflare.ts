import { z } from "zod";

import {
  classifyR2Operation,
  safeSum,
  sumLatestStoragePoints,
  type StoragePoint,
  type TimeWindows,
} from "./lib/metrics";

const CLOUDFLARE_API = "https://api.cloudflare.com/client/v4";
const CLOUDFLARE_GRAPHQL = `${CLOUDFLARE_API}/graphql`;
const REQUEST_TIMEOUT_MS = 15_000;
const REST_PAGE_SIZE = 100;
const MAX_REST_PAGES = 250;
const PAGES_PROJECT_CONCURRENCY = 5;

const numberSchema = z.number().finite();
const graphQlEnvelopeSchema = z.object({
  data: z
    .object({
      viewer: z.object({
        accounts: z.array(z.record(z.string(), z.unknown())),
      }),
    })
    .nullable()
    .optional(),
  errors: z
    .array(
      z.object({
        message: z.string(),
      }),
    )
    .optional(),
});

const restEnvelopeSchema = z.object({
  success: z.boolean(),
  errors: z
    .array(
      z.object({
        code: z.number().optional(),
        message: z.string(),
      }),
    )
    .optional(),
  result: z.unknown(),
  result_info: z
    .object({
      page: z.number().optional(),
      per_page: z.number().optional(),
      total_pages: z.number().optional(),
      count: z.number().optional(),
      total_count: z.number().optional(),
    })
    .optional(),
});

const workersGroupSchema = z.object({
  sum: z.object({
    requests: numberSchema,
    errors: numberSchema.optional(),
  }),
  dimensions: z
    .object({
      scriptName: z.string().nullable().optional(),
    })
    .optional(),
});

const operationGroupSchema = z.object({
  sum: z.object({ requests: numberSchema }),
  dimensions: z.object({
    actionType: z.string(),
  }),
});

const queueGroupSchema = z.object({
  sum: z.object({ billableOperations: numberSchema }),
  dimensions: z
    .object({
      actionType: z.string().optional(),
    })
    .optional(),
});

const kvStorageGroupSchema = z.object({
  max: z.object({
    byteCount: numberSchema,
    keyCount: numberSchema.optional(),
  }),
  dimensions: z.object({
    namespaceId: z.string(),
    date: z.string(),
  }),
});

const d1AnalyticsGroupSchema = z.object({
  sum: z.object({
    rowsRead: numberSchema,
    rowsWritten: numberSchema,
  }),
});

const d1StorageGroupSchema = z.object({
  max: z.object({ databaseSizeBytes: numberSchema }),
  dimensions: z.object({
    databaseId: z.string(),
    date: z.string(),
  }),
});

const r2StorageGroupSchema = z.object({
  max: z.object({
    payloadSize: numberSchema,
    metadataSize: numberSchema.optional(),
    objectCount: numberSchema.optional(),
  }),
  dimensions: z.object({
    bucketName: z.string(),
    datetime: z.string(),
  }),
});

const pagesProjectSchema = z.object({ name: z.string() });
const pagesDeploymentSchema = z.object({
  created_on: z.string(),
  is_skipped: z.boolean().optional(),
  deployment_trigger: z
    .object({
      type: z.string().optional(),
    })
    .optional(),
});

export class CloudflareApiError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "CloudflareApiError";
  }
}

export interface CloudflareClientOptions {
  accountId: string;
  apiToken: string;
  fetcher?: typeof fetch;
}

export interface WorkersUsageRaw {
  requests: number;
  errors: number;
  scripts: number;
}

export interface KvUsageRaw {
  reads: number;
  writes: number;
  deletes: number;
  lists: number;
  otherOperations: number;
  storageBytes: number;
}

export interface D1UsageRaw {
  rowsRead: number;
  rowsWritten: number;
  storageBytes: number;
}

export interface R2UsageRaw {
  classA: number;
  classB: number;
  freeOperations: number;
  unknownOperations: number;
  storageBytes: number;
}

export interface QueueUsageRaw {
  billableOperations: number;
}

export interface PagesUsageRaw {
  builds: number;
  projectsChecked: number;
  partial: boolean;
  failedProjects: number;
}

export interface PaygoUsageRawRow {
  id: string;
  service: string;
  family: string;
  consumed: number;
  consumedUnit: string;
  pricingQuantity: number;
  cost: number;
  currency: string;
  periodStart: string | null;
  periodEnd: string | null;
}

export class CloudflareClient {
  readonly #accountId: string;
  readonly #apiToken: string;
  readonly #fetcher: typeof fetch;

  constructor(options: CloudflareClientOptions) {
    this.#accountId = options.accountId;
    this.#apiToken = options.apiToken;
    this.#fetcher = options.fetcher ?? fetch;
  }

  async getWorkersUsage(windows: TimeWindows): Promise<WorkersUsageRaw> {
    const groups = await this.#graphQlGroups(
      `query WorkersUsage($accountTag: String!, $start: Time!, $end: Time!) {
        viewer {
          accounts(filter: { accountTag: $accountTag }) {
            workersInvocationsAdaptive(
              limit: 10000
              filter: { datetime_geq: $start, datetime_lt: $end }
            ) {
              sum { requests errors }
              dimensions { scriptName }
            }
          }
        }
      }`,
      "workersInvocationsAdaptive",
      { accountTag: this.#accountId, start: windows.dayStart, end: windows.dayEnd },
      workersGroupSchema,
    );

    return {
      requests: safeSum(groups.map((group) => group.sum.requests)),
      errors: safeSum(groups.map((group) => group.sum.errors ?? 0)),
      scripts: new Set(
        groups
          .map((group) => group.dimensions?.scriptName)
          .filter((name): name is string => Boolean(name)),
      ).size,
    };
  }

  async getKvUsage(windows: TimeWindows): Promise<KvUsageRaw> {
    const [operations, storage] = await Promise.all([
      this.#graphQlGroups(
        `query KvOperations($accountTag: String!, $start: Time!, $end: Time!) {
          viewer {
            accounts(filter: { accountTag: $accountTag }) {
              kvOperationsAdaptiveGroups(
                limit: 10000
                filter: { datetime_geq: $start, datetime_lt: $end }
              ) {
                sum { requests }
                dimensions { actionType }
              }
            }
          }
        }`,
        "kvOperationsAdaptiveGroups",
        { accountTag: this.#accountId, start: windows.dayStart, end: windows.dayEnd },
        operationGroupSchema,
      ),
      this.#graphQlGroups(
        `query KvStorage($accountTag: String!, $start: Date!, $end: Date!) {
          viewer {
            accounts(filter: { accountTag: $accountTag }) {
              kvStorageAdaptiveGroups(
                limit: 10000
                filter: { date_geq: $start, date_leq: $end }
              ) {
                max { byteCount keyCount }
                dimensions { namespaceId date }
              }
            }
          }
        }`,
        "kvStorageAdaptiveGroups",
        {
          accountTag: this.#accountId,
          start: windows.storageStartDate,
          end: windows.todayDate,
        },
        kvStorageGroupSchema,
      ),
    ]);

    const counts = new Map<string, number>();
    for (const group of operations) {
      counts.set(
        group.dimensions.actionType,
        (counts.get(group.dimensions.actionType) ?? 0) + group.sum.requests,
      );
    }
    const known = new Set(["read", "write", "delete", "list"]);
    const normalized = new Map<string, number>();
    for (const [action, count] of counts) {
      normalized.set(action.toLowerCase(), count);
    }

    return {
      reads: normalized.get("read") ?? 0,
      writes: normalized.get("write") ?? 0,
      deletes: normalized.get("delete") ?? 0,
      lists: normalized.get("list") ?? 0,
      otherOperations: safeSum(
        [...normalized.entries()]
          .filter(([action]) => !known.has(action))
          .map(([, count]) => count),
      ),
      storageBytes: sumLatestStoragePoints(
        storage.map((group) => ({
          entity: group.dimensions.namespaceId,
          timestamp: group.dimensions.date,
          value: group.max.byteCount,
        })),
      ),
    };
  }

  async getD1Usage(windows: TimeWindows): Promise<D1UsageRaw> {
    const [operations, storage] = await Promise.all([
      this.#graphQlGroups(
        `query D1Operations($accountTag: String!, $start: Time!, $end: Time!) {
          viewer {
            accounts(filter: { accountTag: $accountTag }) {
              d1AnalyticsAdaptiveGroups(
                limit: 10000
                filter: { datetime_geq: $start, datetime_lt: $end }
              ) {
                sum { rowsRead rowsWritten }
              }
            }
          }
        }`,
        "d1AnalyticsAdaptiveGroups",
        { accountTag: this.#accountId, start: windows.dayStart, end: windows.dayEnd },
        d1AnalyticsGroupSchema,
      ),
      this.#graphQlGroups(
        `query D1Storage($accountTag: String!, $start: Date!, $end: Date!) {
          viewer {
            accounts(filter: { accountTag: $accountTag }) {
              d1StorageAdaptiveGroups(
                limit: 10000
                filter: { date_geq: $start, date_leq: $end }
              ) {
                max { databaseSizeBytes }
                dimensions { databaseId date }
              }
            }
          }
        }`,
        "d1StorageAdaptiveGroups",
        {
          accountTag: this.#accountId,
          start: windows.storageStartDate,
          end: windows.todayDate,
        },
        d1StorageGroupSchema,
      ),
    ]);

    return {
      rowsRead: safeSum(operations.map((group) => group.sum.rowsRead)),
      rowsWritten: safeSum(operations.map((group) => group.sum.rowsWritten)),
      storageBytes: sumLatestStoragePoints(
        storage.map((group) => ({
          entity: group.dimensions.databaseId,
          timestamp: group.dimensions.date,
          value: group.max.databaseSizeBytes,
        })),
      ),
    };
  }

  async getR2Usage(windows: TimeWindows): Promise<R2UsageRaw> {
    const [operations, storage] = await Promise.all([
      this.#graphQlGroups(
        `query R2Operations($accountTag: String!, $start: Time!, $end: Time!) {
          viewer {
            accounts(filter: { accountTag: $accountTag }) {
              r2OperationsAdaptiveGroups(
                limit: 10000
                filter: { datetime_geq: $start, datetime_lt: $end }
              ) {
                sum { requests }
                dimensions { actionType }
              }
            }
          }
        }`,
        "r2OperationsAdaptiveGroups",
        {
          accountTag: this.#accountId,
          start: windows.monthStart,
          end: windows.monthEnd,
        },
        operationGroupSchema,
      ),
      this.#graphQlGroups(
        `query R2Storage($accountTag: String!, $start: Time!, $end: Time!) {
          viewer {
            accounts(filter: { accountTag: $accountTag }) {
              r2StorageAdaptiveGroups(
                limit: 10000
                filter: { datetime_geq: $start, datetime_lt: $end }
              ) {
                max { payloadSize metadataSize objectCount }
                dimensions { bucketName datetime }
              }
            }
          }
        }`,
        "r2StorageAdaptiveGroups",
        {
          accountTag: this.#accountId,
          start: windows.monthStart,
          end: windows.monthEnd,
        },
        r2StorageGroupSchema,
      ),
    ]);

    let classA = 0;
    let classB = 0;
    let freeOperations = 0;
    let unknownOperations = 0;
    for (const group of operations) {
      const operationClass = classifyR2Operation(group.dimensions.actionType);
      if (operationClass === "class-a") classA += group.sum.requests;
      else if (operationClass === "class-b") classB += group.sum.requests;
      else if (operationClass === "free") freeOperations += group.sum.requests;
      else unknownOperations += group.sum.requests;
    }

    const storagePoints: StoragePoint[] = storage.map((group) => ({
      entity: group.dimensions.bucketName,
      timestamp: group.dimensions.datetime,
      value: group.max.payloadSize + (group.max.metadataSize ?? 0),
    }));

    return {
      classA,
      classB,
      freeOperations,
      unknownOperations,
      storageBytes: sumLatestStoragePoints(storagePoints),
    };
  }

  async getQueueUsage(windows: TimeWindows): Promise<QueueUsageRaw> {
    const groups = await this.#graphQlGroups(
      `query QueueOperations($accountTag: String!, $start: Time!, $end: Time!) {
        viewer {
          accounts(filter: { accountTag: $accountTag }) {
            queueMessageOperationsAdaptiveGroups(
              limit: 10000
              filter: { datetime_geq: $start, datetime_lt: $end }
            ) {
              sum { billableOperations }
              dimensions { actionType }
            }
          }
        }
      }`,
      "queueMessageOperationsAdaptiveGroups",
      { accountTag: this.#accountId, start: windows.dayStart, end: windows.dayEnd },
      queueGroupSchema,
    );

    return {
      billableOperations: safeSum(
        groups.map((group) => group.sum.billableOperations),
      ),
    };
  }

  async getPagesUsage(windows: TimeWindows): Promise<PagesUsageRaw> {
    const projectsResult = await this.#restList(
      `/accounts/${encodeURIComponent(this.#accountId)}/pages/projects`,
      pagesProjectSchema,
      { maxPages: 5 },
    );
    const projects = projectsResult.items;
    const projectResults = await mapSettledWithConcurrency(
      projects,
      PAGES_PROJECT_CONCURRENCY,
      async (project) => {
        const deploymentsResult = await this.#restList(
          `/accounts/${encodeURIComponent(this.#accountId)}/pages/projects/${encodeURIComponent(project.name)}/deployments`,
          pagesDeploymentSchema,
          {
            stopWhen: (deployments) =>
              deployments.some(
                (deployment) => deployment.created_on < windows.monthStart,
              ),
          },
        );
        const builds = deploymentsResult.items.filter((deployment) => {
          const trigger = deployment.deployment_trigger?.type;
          return (
            !deployment.is_skipped &&
            trigger !== "ad_hoc" &&
            deployment.created_on >= windows.monthStart &&
            deployment.created_on < windows.monthEnd
          );
        }).length;
        return {
          builds,
          partial: !deploymentsResult.complete,
        };
      },
    );

    let builds = 0;
    let failedProjects = 0;
    let partial = !projectsResult.complete;
    for (const result of projectResults) {
      if (result.status === "fulfilled") {
        builds += result.value.builds;
        partial ||= result.value.partial;
      } else {
        failedProjects += 1;
        partial = true;
      }
    }

    return {
      builds,
      projectsChecked: projects.length,
      partial,
      failedProjects,
    };
  }

  async getPaygoUsage(): Promise<PaygoUsageRawRow[]> {
    const result = await this.#restList(
      `/accounts/${encodeURIComponent(this.#accountId)}/paygo-usage`,
      z.record(z.string(), z.unknown()),
    );
    if (!result.complete) {
      throw new CloudflareApiError("PayGo API 明细超过安全分页上限");
    }
    const rows = result.items;

    return rows.map((row, index) => {
      const service = stringField(row, "ServiceName", "service_name") || "Unknown";
      const family =
        stringField(row, "ServiceFamilyName", "service_family_name") || service;
      const unit = stringField(row, "ConsumedUnit", "consumed_unit") || "unit";
      const currency =
        stringField(row, "BillingCurrency", "billing_currency") || "USD";
      return {
        id: `${service}:${family}:${unit}:${index}`,
        service,
        family,
        consumed: numberField(row, "ConsumedQuantity", "consumed_quantity"),
        consumedUnit: unit,
        pricingQuantity: numberField(
          row,
          "PricingQuantity",
          "pricing_quantity",
        ),
        cost: numberField(row, "ContractedCost", "contracted_cost"),
        currency,
        periodStart:
          nullableStringField(row, "BillingPeriodStart", "billing_period_start") ??
          nullableStringField(row, "ChargePeriodStart", "charge_period_start"),
        periodEnd: nullableStringField(
          row,
          "ChargePeriodEnd",
          "charge_period_end",
        ),
      };
    });
  }

  async #graphQlGroups<T extends z.ZodType>(
    query: string,
    dataset: string,
    variables: Record<string, string>,
    groupSchema: T,
  ): Promise<Array<z.infer<T>>> {
    const response = await this.#fetcher(CLOUDFLARE_GRAPHQL, {
      method: "POST",
      headers: this.#headers(),
      body: JSON.stringify({ query, variables }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    const body = graphQlEnvelopeSchema.parse(await parseJson(response));
    if (!response.ok) {
      throw new CloudflareApiError(
        `GraphQL 请求失败（HTTP ${response.status}）`,
        response.status,
      );
    }
    if (body.errors?.length) {
      throw new CloudflareApiError(
        `GraphQL 拒绝了查询：${sanitizeMessage(body.errors[0]?.message)}`,
      );
    }
    const account = body.data?.viewer.accounts[0];
    if (!account) throw new CloudflareApiError("GraphQL 未返回目标账户");
    return z.array(groupSchema).parse(account[dataset]);
  }

  async #rest(
    path: string,
  ): Promise<{
    result: unknown;
    resultInfo: z.infer<typeof restEnvelopeSchema>["result_info"];
  }> {
    const response = await this.#fetcher(`${CLOUDFLARE_API}${path}`, {
      headers: this.#headers(),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    const body = restEnvelopeSchema.parse(await parseJson(response));
    if (!response.ok || !body.success) {
      const detail = sanitizeMessage(body.errors?.[0]?.message);
      throw new CloudflareApiError(
        detail
          ? `Cloudflare API 请求失败：${detail}`
          : `Cloudflare API 请求失败（HTTP ${response.status}）`,
        response.status,
      );
    }
    return { result: body.result, resultInfo: body.result_info };
  }

  async #restList<T>(
    path: string,
    itemSchema: z.ZodType<T>,
    options: {
      maxPages?: number;
      stopWhen?: (items: T[]) => boolean;
    } = {},
  ): Promise<{ items: T[]; complete: boolean }> {
    const items: T[] = [];
    const maxPages = options.maxPages ?? MAX_REST_PAGES;

    for (let page = 1; page <= maxPages; page += 1) {
      const response = await this.#rest(
        withPagination(path, page, REST_PAGE_SIZE),
      );
      const pageItems = z.array(itemSchema).parse(response.result);
      items.push(...pageItems);

      if (options.stopWhen?.(pageItems)) {
        return { items, complete: true };
      }

      const resultInfo = response.resultInfo;
      const totalPages = resultInfo?.total_pages;
      const totalCount = resultInfo?.total_count;
      const reportedPageSize = resultInfo?.per_page ?? REST_PAGE_SIZE;
      const hasNextPage =
        totalPages !== undefined
          ? page < totalPages
          : totalCount !== undefined
            ? items.length < totalCount
            : reportedPageSize > 0 && pageItems.length >= reportedPageSize;
      if (!hasNextPage || pageItems.length === 0) {
        return { items, complete: true };
      }
    }

    return { items, complete: false };
  }

  #headers(): Headers {
    return new Headers({
      Authorization: `Bearer ${this.#apiToken}`,
      "Content-Type": "application/json",
      "User-Agent": "cloudflare-usage-guard/0.1",
    });
  }
}

async function parseJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    throw new CloudflareApiError(
      `Cloudflare API 返回了无效 JSON（HTTP ${response.status}）`,
      response.status,
    );
  }
}

function withPagination(path: string, page: number, perPage: number): string {
  const url = new URL(path, CLOUDFLARE_API);
  url.searchParams.set("page", String(page));
  url.searchParams.set("per_page", String(perPage));
  return `${url.pathname}${url.search}`;
}

async function mapSettledWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  map: (item: T) => Promise<R>,
): Promise<Array<PromiseSettledResult<R>>> {
  const results: Array<PromiseSettledResult<R>> = [];

  for (let start = 0; start < items.length; start += concurrency) {
    const batch = items.slice(start, start + concurrency);
    results.push(...(await Promise.allSettled(batch.map(map))));
  }

  return results;
}

function sanitizeMessage(message: string | undefined): string {
  return (message ?? "").replace(/[\r\n]+/g, " ").slice(0, 180);
}

function stringField(
  row: Record<string, unknown>,
  ...keys: string[]
): string {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === "string") return value;
  }
  return "";
}

function nullableStringField(
  row: Record<string, unknown>,
  ...keys: string[]
): string | null {
  return stringField(row, ...keys) || null;
}

function numberField(
  row: Record<string, unknown>,
  ...keys: string[]
): number {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string") {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return 0;
}
