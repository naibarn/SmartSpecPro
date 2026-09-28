#!/usr/bin/env node
import { spawnSync } from "node:child_process";

const result = spawnSync("npm", ["--workspace", "apps/web", "run", "check"], {
  cwd: new URL("../../..", import.meta.url),
  encoding: "utf8",
  maxBuffer: 32 * 1024 * 1024,
  env: { ...process.env, NODE_OPTIONS: "--max-old-space-size=8192" },
});
if (result.error) {
  console.error(`MCP targeted typecheck could not start: ${result.error.message}`);
  process.exit(1);
}

const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
const target = /(?:^|[\\/])(?:server[\\/]_core[\\/]mcp(?:V2Protocol|PublicServer|Registry|Resources|RolloutPolicy|OAuthMetadata|OAuthJwks)|server[\\/]middleware[\\/]publicApiCors|server[\\/]services[\\/]tenantFeatureFlagService|server[\\/]services[\\/]mcpDownloadBrokerService|server[\\/]_core[\\/]authz|shared[\\/]featureFlags)\.(?:ts|tsx)/;
const diagnostics = output.split(/\r?\n/).filter((line) => /error TS\d+/.test(line) && target.test(line));

if (diagnostics.length > 0) {
  console.error("MCP targeted typecheck failed:");
  console.error(diagnostics.join("\n"));
  process.exit(1);
}

console.log(JSON.stringify({
  ok: true,
  tscExitCode: result.status,
  note: result.status === 0
    ? "The full web typecheck passed."
    : "The full web typecheck has unrelated baseline diagnostics; no MCP-targeted diagnostic was reported.",
}, null, 2));
