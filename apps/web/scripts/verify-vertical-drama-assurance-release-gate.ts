import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export type ReleaseGateTier = "implementation" | "production";
export type ReleaseEvidenceManifest = { releaseId: string; gates: Record<string, { status: "pass" | "pending" | "blocked" | "failed"; evidenceRefs?: string[] }> };

const IMPLEMENTATION_GATES = ["node_contract", "python_contract", "focused_tests", "replay_fault", "browser_harness", "migration_static", "diff_clean", "review_loops"] as const;
const PRODUCTION_GATES = ["staging_migration", "staging_restart", "live_provider", "deployed_browser", "canary", "observability", "rollback"] as const;

export function evaluateVerticalDramaAssuranceReleaseGate(input: { tier: ReleaseGateTier; manifest: ReleaseEvidenceManifest; expectedReleaseId?: string }): { ok: boolean; missing: string[]; invalid: string[] } {
  const required = input.tier === "production" ? [...IMPLEMENTATION_GATES, ...PRODUCTION_GATES] : [...IMPLEMENTATION_GATES];
  const missing: string[] = [];
  const invalid: string[] = [];
  if (input.expectedReleaseId && input.manifest.releaseId !== input.expectedReleaseId) invalid.push("release_id_mismatch");
  for (const gate of required) {
    const evidence = input.manifest.gates[gate];
    if (!evidence) { missing.push(gate); continue; }
    if (evidence.status !== "pass" || !evidence.evidenceRefs?.length) invalid.push(`${gate}:${evidence.status}`);
  }
  return { ok: missing.length === 0 && invalid.length === 0, missing, invalid };
}

function parseArgs(argv: string[]): { tier: ReleaseGateTier; evidence: string } {
  const tierIndex = argv.indexOf("--tier");
  const evidenceIndex = argv.indexOf("--evidence");
  const tier = tierIndex >= 0 && (argv[tierIndex + 1] === "production" || argv[tierIndex + 1] === "implementation") ? argv[tierIndex + 1] as ReleaseGateTier : "implementation";
  const defaultEvidence = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../specs/feature/157-vertical-drama-assurance-production-activation-qc-convergence/implementation/release-evidence/manifest.json");
  const evidence = evidenceIndex >= 0 && argv[evidenceIndex + 1] ? argv[evidenceIndex + 1] : defaultEvidence;
  return { tier, evidence };
}

if (process.argv[1]?.endsWith("verify-vertical-drama-assurance-release-gate.ts")) {
  const args = parseArgs(process.argv.slice(2));
  let manifest: ReleaseEvidenceManifest;
  try {
    manifest = JSON.parse(fs.readFileSync(args.evidence, "utf8")) as ReleaseEvidenceManifest;
  } catch {
    console.error(`release gate blocked: cannot read evidence manifest ${args.evidence}`);
    process.exitCode = 2;
    manifest = { releaseId: "unknown", gates: {} };
  }
  const result = evaluateVerticalDramaAssuranceReleaseGate({ tier: args.tier, manifest });
  if (!result.ok) {
    console.error(JSON.stringify({ tier: args.tier, status: "blocked", missing: result.missing, invalid: result.invalid }));
    process.exitCode = 1;
  } else {
    console.log(JSON.stringify({ tier: args.tier, status: "pass", releaseId: manifest.releaseId }));
  }
}
