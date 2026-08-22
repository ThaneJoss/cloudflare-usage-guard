import { cloudflareTest } from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

process.env.CF_ACCOUNT_ID ??= "test-account";
process.env.CF_API_TOKEN ??= "test-read-only-token";
process.env.POLICY_AUD ??= "test-audience";

export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: {
        configPath: "./wrangler.jsonc",
      },
    }),
  ],
  test: {
    include: ["tests/**/*.worker.test.ts"],
    testTimeout: 20_000,
  },
});
