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
for (const required of ["profile:", "publish:", "release_id:", "signing_mode:", "SHA256SUMS", "shared-container-manifest", "sourceCommit", "sah-runner-v1", "release_id is required"]) {
  if (!workflow.includes(required)) throw new Error(`RUNNER_RELEASE_REQUIREMENT_MISSING:${required}`);
}
for (const retiredWorkflow of ["desktop-release.yml", "worker-app-macos-release.yml"]) {
  if (workflow.includes(retiredWorkflow)) throw new Error(`RUNNER_RELEASE_REPURPOSES_WORKER_WORKFLOW:${retiredWorkflow}`);
}
console.log("runner-release workflow policy: PASS");
