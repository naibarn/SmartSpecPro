#!/usr/bin/env node

// Compatibility entry point. Production readiness is evaluated against the
// UI/database-backed MCP runtime config, never against MCP_* env values.
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const script = fileURLToPath(new URL("./mcp-v2-readiness.ts", import.meta.url));
const result = spawnSync(process.execPath, ["--import", "tsx", script], {
  stdio: "inherit",
  env: { ...process.env, NODE_ENV: "production" },
});
process.exit(result.status ?? 1);
