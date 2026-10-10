import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SHARED_FLAGS = "apps/web/shared/featureFlags.ts";
const MCP_FLAG_LINE = /^[+-].*\b(?:mcp[A-Z_]|browserTool\b)/;
const MCP_PATH = /^(?:apps\/web\/server\/_core\/(?:mcp.*\.ts|authz\.ts)|apps\/web\/server\/services\/(?:mcpDownloadBrokerService|tenantFeatureFlagService)\.ts|apps\/web\/scripts\/mcp-.*\.mjs|apps\/web\/scripts\/mcp-v2-gate-scope\.mjs|apps\/web\/server\/.*\/__tests__\/(?:mcp.*\.test\.ts|authz\.mcpOAuth\.test\.ts)|apps\/web\/server\/services\/__tests__\/mcpDownloadBrokerService\.test\.ts|load-tests\/scenario-mcp-v2\.js|\.github\/workflows\/mcp-v2-gates\.yml)$/;

export function requiresMcpV2Gates(changedPaths, sharedFlagsDiff = "") {
  const paths = [...changedPaths];
  if (paths.some((path) => path !== SHARED_FLAGS && MCP_PATH.test(path))) return true;
  if (!paths.includes(SHARED_FLAGS)) return false;
  const changedLines = sharedFlagsDiff.split(/\r?\n/)
    .filter((line) => /^[+-]/.test(line) && !line.startsWith("+++") && !line.startsWith("---"));
  // Unknown or structural changes fail closed and keep the full MCP gate.
  if (changedLines.length === 0) return true;
  return !changedLines.every((line) => line.includes("livingMascotDualSurface"))
    || changedLines.some((line) => MCP_FLAG_LINE.test(line));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const [base, head] = process.argv.slice(2);
  if (!base || !head) {
    process.stderr.write("usage: node mcp-v2-gate-scope.mjs <base-sha> <head-sha>\n");
    process.exit(2);
  }
  const changedPaths = execFileSync("git", ["diff", "--name-only", `${base}...${head}`], { encoding: "utf8" })
    .split(/\r?\n/).filter(Boolean);
  const flagsDiff = changedPaths.includes(SHARED_FLAGS)
    ? execFileSync("git", ["diff", "--unified=0", `${base}...${head}`, "--", SHARED_FLAGS], { encoding: "utf8" })
    : "";
  process.stdout.write(`${requiresMcpV2Gates(changedPaths, flagsDiff)}\n`);
}
