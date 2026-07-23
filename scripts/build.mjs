import { spawnSync } from "node:child_process";

const target = process.env.WORKERS_CI === "1" ? "build:worker" : "build:frontend";
const npmExecPath = process.env.npm_execpath;
const command = npmExecPath ? process.execPath : "pnpm";
const args = npmExecPath
  ? [npmExecPath, "run", target]
  : ["run", target];

console.log(`[build] Running ${target} (WORKERS_CI=${process.env.WORKERS_CI ?? "unset"})`);

const result = spawnSync(command, args, {
  stdio: "inherit",
  shell: process.platform === "win32" && !npmExecPath,
});

if (result.error) {
  console.error(`[build] Failed to start ${target}:`, result.error);
  process.exit(1);
}

process.exit(result.status ?? 1);
