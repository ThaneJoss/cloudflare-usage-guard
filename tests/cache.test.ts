import { z } from "zod";
import { describe, expect, it, vi } from "vitest";

import {
  loadCachedJson,
  type ResponseCache,
} from "../worker/src/cache";

describe("Worker JSON cache", () => {
  it("rejects an invalid cached value and refreshes it through the loader", async () => {
    const cache = new MemoryResponseCache(
      Response.json({ value: "not-a-number" }),
    );
    const load = vi.fn().mockResolvedValue({ value: 42 });

    await expect(
      loadCachedJson({
        cache,
        key: "https://usage.example/__internal/cache/test",
        source: "test_source",
        ttlSeconds: 60,
        schema: z.object({ value: z.number() }),
        load,
      }),
    ).resolves.toEqual({ value: 42 });

    expect(load).toHaveBeenCalledOnce();
    await expect(cache.response?.clone().json()).resolves.toEqual({ value: 42 });
  });

  it("does not let a cache write failure hide a fresh value", async () => {
    const cache: ResponseCache = {
      match: vi.fn().mockResolvedValue(undefined),
      put: vi.fn().mockRejectedValue(new Error("cache unavailable")),
    };

    await expect(
      loadCachedJson({
        cache,
        key: "https://usage.example/__internal/cache/test",
        source: "test_source",
        ttlSeconds: 60,
        schema: z.object({ value: z.number() }),
        load: async () => ({ value: 7 }),
      }),
    ).resolves.toEqual({ value: 7 });
  });
});

class MemoryResponseCache implements ResponseCache {
  constructor(public response: Response | null) {}

  async match(): Promise<Response | undefined> {
    return this.response?.clone();
  }

  async put(_request: Request, response: Response): Promise<void> {
    this.response = response.clone();
  }
}
