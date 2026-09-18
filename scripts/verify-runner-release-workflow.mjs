import fs from "node:fs";

const workflowPath = ".github/workflows/runner-release.yml";
const workflow = fs.readFileSync(workflowPath, "utf8");

if (!/^on:\s*\n\s+workflow_dispatch:/m.test(workflow)) {
  throw new Error("RUNNER_RELEASE_WORKFLOW_MUST_BE_MANUAL");
}
for (const trigger of ["push:", "pull_request:", "schedule:", "release:", "workflow_call:", "workflow_run:"]) {
  if (new RegExp(`^\\s+${trigger.replace(":", "\\:")}`, "m").test(workflow)) {
    throw new Error(`RUNNER_RELEASE_WORKFLOW_FORBIDDEN_TRIGGER:${trigger}`);
  }
}
for (const target of ["x86_64-pc-windows-msvc", "x86_64-apple-darwin", "aarch64-apple-darwin", "x86_64-unknown-linux-gnu"]) {
  if (!workflow.includes(target)) throw new Error(`RUNNER_RELEASE_TARGET_MISSING:${target}`);
}
if (!workflow.includes("platform: macos-arm64")) throw new Error("RUNNER_RELEASE_MACOS_ARM64_PLATFORM_MISSING");
if (workflow.includes("platform: macos-arm\n")) throw new Error("RUNNER_RELEASE_AMBIGUOUS_MACOS_ARM_PLATFORM");
for (const runnerLabel of ["macos-15-intel", "macos-14"]) {
  if (!workflow.includes(`os: ${runnerLabel}`)) throw new Error(`RUNNER_RELEASE_RUNNER_LABEL_MISSING:${runnerLabel}`);
}
if (workflow.includes("os: macos-13")) throw new Error("RUNNER_RELEASE_STALE_MACOS_INTEL_LABEL");
for (const required of ["profile:", "publish:", "release_id:", "release_notes:", "signing_mode:", "SHA256SUMS", "Copy-Item", "openssl dgst -sha256 -sign", "git rev-parse HEAD", "actions/download-artifact@v4", "gh release create", "gh release upload", "shared-container-manifest", "sourceCommit", "sah-runner-v1", "release_id is required", "publish requires required-secret signing"]) {
  if (!workflow.includes(required)) throw new Error(`RUNNER_RELEASE_REQUIREMENT_MISSING:${required}`);
}
for (const retiredWorkflow of ["desktop-release.yml", "worker-app-macos-release.yml"]) {
  if (workflow.includes(retiredWorkflow)) throw new Error(`RUNNER_RELEASE_REPURPOSES_WORKER_WORKFLOW:${retiredWorkflow}`);
}
console.log("runner-release workflow policy: PASS");
