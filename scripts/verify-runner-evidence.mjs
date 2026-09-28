import fs from "node:fs";

const evidencePath = "specs/feature/205-smartaihub-runner-cross-platform/implementation/evidence.json";
const evidence = JSON.parse(fs.readFileSync(evidencePath, "utf8"));
const allowed = new Set([
  "pass",
  "pass_local",
  "pass_local_implementation",
  "pass_local_contract",
  "partial_provider_evidence_pending",
  "blocked",
  "unverified",
]);
const required = [
  "contract_and_security",
  "runtime_and_recovery",
  "shared_container_target",
  "windows_x86_64_host",
  "macos_intel_host",
  "macos_apple_silicon_host",
  "linux_x86_64_host",
  "cloudflare_target_account",
  "browser_deployed_surface",
  "manual_release_policy",
  "signed_provenance",
  "worker_boundary",
];
for (const key of required) {
  if (!allowed.has(evidence[key])) throw new Error(`RUNNER_EVIDENCE_INVALID:${key}`);
}
console.log(`runner evidence checklist: PASS (${required.length} criteria recorded)`);
