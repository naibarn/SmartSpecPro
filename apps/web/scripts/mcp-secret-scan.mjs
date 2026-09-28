#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import fs from "node:fs";

const root = new URL("../../..", import.meta.url);
const tracked = execFileSync("git", ["ls-files", "--", "apps/web/server/_core", "apps/web/server/middleware/publicApiCors.ts", "apps/web/server/services/mcpDownloadBrokerService.ts", "apps/web/server/services/tenantFeatureFlagService.ts", "apps/web/shared/featureFlags.ts", "apps/web/scripts"], { cwd: root, encoding: "utf8" })
  .split(/\r?\n/)
  .filter((file) => file && (file.startsWith("apps/web/server/_core/mcp") || file === "apps/web/server/_core/authz.ts" || file === "apps/web/server/middleware/publicApiCors.ts" || file === "apps/web/server/services/mcpDownloadBrokerService.ts" || file === "apps/web/server/services/tenantFeatureFlagService.ts" || file === "apps/web/shared/featureFlags.ts" || file.startsWith("apps/web/scripts/mcp-")));
const workingTree = execFileSync("find", ["apps/web/server/_core", "apps/web/server/middleware", "apps/web/server/services", "apps/web/shared", "apps/web/scripts", "-type", "f"], { cwd: root, encoding: "utf8" })
  .split(/\r?\n/)
  .filter((file) => file && (file.startsWith("apps/web/server/_core/mcp") || file === "apps/web/server/_core/authz.ts" || file === "apps/web/server/middleware/publicApiCors.ts" || file === "apps/web/server/services/mcpDownloadBrokerService.ts" || file === "apps/web/server/services/tenantFeatureFlagService.ts" || file === "apps/web/shared/featureFlags.ts" || file.startsWith("apps/web/scripts/mcp-")));
const files = [...new Set([...tracked, ...workingTree])];
const suspicious = [
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  /\bAKIA[0-9A-Z]{16}\b/,
  /\b(?:sk|rk)-(?:live|prod)[-_][A-Za-z0-9]{16,}\b/,
  /(?:password|client_secret|private_key|access_token)\s*[:=]\s*["'][^"']{24,}["']/i,
];
const findings = [];
for (const file of files) {
  const absolute = new URL(`../../../${file}`, import.meta.url);
  const text = fs.existsSync(absolute) ? fs.readFileSync(absolute, "utf8") : execFileSync("git", ["show", `HEAD:${file}`], { cwd: root, encoding: "utf8" });
  for (const [lineNumber, line] of text.split(/\r?\n/).entries()) {
    if (suspicious.some((pattern) => pattern.test(line))) findings.push({ file, line: lineNumber + 1 });
  }
}
if (findings.length > 0) {
  console.error(JSON.stringify({ ok: false, findings }, null, 2));
  process.exit(1);
}
console.log(JSON.stringify({ ok: true, filesScanned: files.length, findings: [] }, null, 2));
