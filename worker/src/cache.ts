export interface ResponseCache {
  match(request: Request): Promise<Response | undefined>;
  put(request: Request, response: Response): Promise<void>;
}

interface RuntimeSchema<T> {
  safeParse(value: unknown):
    | { success: true; data: T }
    | { success: false };
}

interface CachedJsonOptions<T> {
  cache: ResponseCache | null;
  key: string;
  source: string;
  ttlSeconds: number;
  schema: RuntimeSchema<T>;
  load: () => Promise<unknown>;
}

export function getDefaultCache(): ResponseCache | null {
  if (typeof caches === "undefined") return null;
  const defaultCache = Reflect.get(caches, "default");
  return isResponseCache(defaultCache) ? defaultCache : null;
}

export async function loadCachedJson<T>(
  options: CachedJsonOptions<T>,
): Promise<T> {
  const request = new Request(options.key, { method: "GET" });

  if (options.cache) {
    try {
      const response = await options.cache.match(request);
      if (response) {
        const parsed = options.schema.safeParse(await response.json());
        if (parsed.success) return parsed.data;
        logCacheEvent("cache_value_rejected", options.source);
      }
    } catch (error) {
      logCacheEvent("cache_read_failed", options.source, error);
    }
  }

  const parsed = options.schema.safeParse(await options.load());
  if (!parsed.success) {
    throw new Error(`${options.source} 返回的数据结构与预期不一致`);
  }

  if (options.cache) {
    try {
      await options.cache.put(
        request,
        Response.json(parsed.data, {
          headers: {
            "Cache-Control": `public, max-age=${options.ttlSeconds}`,
          },
        }),
      );
    } catch (error) {
      logCacheEvent("cache_write_failed", options.source, error);
    }
  }

  return parsed.data;
}

function logCacheEvent(event: string, source: string, error?: unknown): void {
  console.warn(
    JSON.stringify({
      event,
      source,
      ...(error
        ? {
            error_name:
              error instanceof Error ? error.name : "UnknownError",
          }
        : {}),
    }),
  );
}

function isResponseCache(value: unknown): value is ResponseCache {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof Reflect.get(value, "match") === "function" &&
    typeof Reflect.get(value, "put") === "function"
  );
}
