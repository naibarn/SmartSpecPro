#!/usr/bin/env node
/**
 * Fail-closed audit for the retired Agency Swarm execution surface.
 *
 * Historical schema/spec/UI strings are intentionally allowed. The audit only
 * checks executable package imports and the server registration/toggle points
 * that could spend credits or invoke a provider.
 */
import { execFileSync } from "node:child_process";

const checks = [
  {
    name: "retired third-party imports",
    pattern: "(^|[[:space:]])(from[[:space:]]+agency_swarm|import[[:space:]]+agency_swarm)([[:space:]]|$)",
    paths: ["python-backend/app", "apps/web/server", "apps/tauri-shell/src-tauri"],
    allow: [/^python-backend\/app\/services\/agency_swarm_adapter\.py$/],
  },
  {
    name: "retired FastAPI router registration",
    pattern: "(agency_review|agencies|agency_creator|agency_feedback)\.router|from app\.api import.*(agency_review|agencies|agency_creator|agency_feedback)",
    paths: ["python-backend/app/main.py"],
    allow: [],
  },
  {
    name: "retired public agency registration",
    pattern: "createPublicAgencyRouter|app\.use\\(\"/v1/agencies\"",
    paths: ["apps/web/server/_core/index.ts"],
    allow: [],
  },
  {
    name: "legacy feature-flag activation",
    pattern: "setTenantFeatureFlag\\(\"AGENCY_SWARM_ENABLED\"|process\.env\.AGENCY_SWARM_ENABLED === \"true\"",
    paths: ["apps/web/server/routers/agency.ts"],
    allow: [],
  },
];

let failed = false;
for (const check of checks) {
  let output = "";
  try {
    output = execFileSync(
      "git",
      ["grep", "-Il", "-E", check.pattern, "--", ...check.paths],
      { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
    );
  } catch (error) {
    const result = error;
    if (typeof result?.stdout === "string") output = result.stdout;
    if (!output) continue;
  }
  const violations = output
    .split("\n")
    .filter(Boolean)
    .filter((file) => !check.allow.some((rule) => rule.test(file)));
  if (violations.length > 0) {
    failed = true;
    console.error(`${check.name}: ${violations.length} violation(s)`);
    for (const file of violations) console.error(`- ${file}`);
  }
}

if (failed) process.exitCode = 1;
else console.log("Agency Swarm active-execution audit passed.");
