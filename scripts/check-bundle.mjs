import { readdir, readFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { gzipSync } from "node:zlib";

const ASSET_DIRECTORY = new URL("../dist/assets/", import.meta.url);
const LIMITS = {
  ".css": 12 * 1024,
  ".js": 90 * 1024,
};

const files = await readdir(ASSET_DIRECTORY);
const totals = new Map();

const measurements = await Promise.all(
  files
    .filter((file) => extname(file) in LIMITS)
    .map(async (file) => {
      const contents = await readFile(join(ASSET_DIRECTORY.pathname, file));
      return {
        extension: extname(file),
        gzipBytes: gzipSync(contents).byteLength,
      };
    }),
);

for (const { extension, gzipBytes } of measurements) {
  totals.set(extension, (totals.get(extension) ?? 0) + gzipBytes);
}

let exceeded = false;
for (const [extension, limit] of Object.entries(LIMITS)) {
  const bytes = totals.get(extension) ?? 0;
  console.log(
    `[bundle] ${extension.slice(1).toUpperCase()} gzip ${(bytes / 1024).toFixed(2)} KiB / ${(limit / 1024).toFixed(0)} KiB`,
  );
  exceeded ||= bytes > limit;
}

if (files.some((file) => file.endsWith(".map"))) {
  throw new Error("生产产物不应包含 source map");
}

if (exceeded) {
  throw new Error("前端产物超过预算，请检查依赖或拆分代码");
}
