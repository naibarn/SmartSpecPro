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
  /^python-backend\/app\/services\/openai_agents_orchestra\.py$/,
  /^scripts\/check-agency-swarm-active-refs\.mjs$/,
];
const files = execFileSync("git", ["grep", "-Il", "-E", "agency[-_ ]?swarm|agencySwarm|agency_swarm", "--"], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 })
  .split("\n")
  .filter(Boolean)
  .filter(file => !allowed.some(rule => rule.test(file)));
const violations = [];
for (const file of files) {
  violations.push(file);
}
if (violations.length) {
  console.error(`Agency Swarm active references remain in ${violations.length} file(s):`);
  for (const file of violations) console.error(`- ${file}`);
  process.exitCode = 1;
} else {
  console.log("Agency Swarm active-reference audit passed.");
}
