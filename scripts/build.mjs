import { spawnSync } from "node:child_process";

const npmExecPath = process.env.npm_execpath;
const command = npmExecPath ? process.execPath : "pnpm";
for (const target of ["build:frontend", "build:worker"]) {
  const args = npmExecPath
    ? [npmExecPath, "run", target]
    : ["run", target];
  console.log(`[build] Running ${target}`);
  const result = spawnSync(command, args, {
    stdio: "inherit",
    shell: process.platform === "win32" && !npmExecPath,
  });
  if (result.error) {
    console.error(`[build] Failed to start ${target}:`, result.error);
    process.exit(1);
  }
  if (result.status !== 0) process.exit(result.status ?? 1);
}
