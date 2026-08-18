#!/usr/bin/env node
/**
 * Agency Swarm decommission audit.
 *
 * This is intentionally fail-closed for active source references. Migration
 * exports, archived specs, and tests may be allowlisted by path while the
 * removal wave is in progress. The script is safe to run in CI and never
 * modifies files.
 */
import { execFileSync } from "node:child_process";

const allowed = [
  /^specs\/feature\/151-unified-agent-output-assurance-orchestra\//,
  /^specs\/feature\/130-hybrid-flow-openai-agents-sdk-runtime\//,
  /^python-backend\/tests\//,
  /^apps\/web\/server\/services\/agentRuntime\/__tests__\//,
  /^scripts\/check-agency-swarm-active-refs\.mjs$/,
];
const pattern = /agency[-_ ]?swarm|agencySwarm|agency_swarm/i;
const files = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard"], { encoding: "utf8" })
  .split("\n")
  .filter(Boolean)
  .filter(file => !allowed.some(rule => rule.test(file)));
const violations = [];
for (const file of files) {
  try {
    const content = execFileSync("git", ["show", `:${file}`], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
    if (pattern.test(content)) violations.push(file);
  } catch {
    // Unstaged files are read directly; binary/unreadable files are ignored.
    try {
      const fs = await import("node:fs/promises");
      const content = await fs.readFile(file, "utf8");
      if (pattern.test(content)) violations.push(file);
    } catch {}
  }
}
if (violations.length) {
  console.error(`Agency Swarm active references remain in ${violations.length} file(s):`);
  for (const file of violations) console.error(`- ${file}`);
  process.exitCode = 1;
} else {
  console.log("Agency Swarm active-reference audit passed.");
}
