import fs from "node:fs";

const read = (path) => fs.readFileSync(path, "utf8");
const has = (path, pattern) => pattern.test(read(path));
const rounds = [
  [
    "requirements",
    () =>
      fs.existsSync(
        "specs/feature/205-smartaihub-runner-cross-platform/implementation/section-status.md",
      ) && fs.existsSync("apps/runner-app/Cargo.toml"),
  ],
  [
    "ownership",
    () =>
      !read("apps/runner-app/src/lib.rs").includes("worker-app") &&
      !read("apps/runner-app/src/lib.rs").includes("OpenSandbox"),
  ],
  [
    "contract",
    () =>
      has(
        "apps/web/server/services/runnerContracts.ts",
        /RunnerProtocolEnvelope/,
      ) &&
      has("apps/web/server/services/runnerContracts.ts", /toolInventory/) &&
      has(
        "apps/web/server/services/runnerContracts.ts",
        /capabilityInventory/,
      ) &&
      has("apps/runner-app/src/protocol.rs", /rename_all = "camelCase"/),
  ],
  [
    "authentication",
    () =>
      has(
        "apps/web/server/services/runnerAuthService.ts",
        /smartspec-runner-registration/,
      ) &&
      has(
        "apps/web/server/services/runnerAuthService.ts",
        /runner_execution/,
      ) &&
      has("apps/web/server/services/runnerAuthService.ts", /runner_refresh/) &&
      has(
        "apps/web/server/services/runnerAuthService.ts",
        /verifyRunnerRefreshToken/,
      ) &&
      has(
        "apps/web/server/services/runnerAuthService.ts",
        /runner_device_public_key_invalid/,
      ) &&
      has("apps/web/server/services/runnerAuthService.ts", /isJtiRevoked/) &&
      has(
        "apps/web/server/services/runnerAuthService.ts",
        /runner_permission_denied/,
      ) &&
      has(
        "apps/web/server/services/runnerAuthService.ts",
        /runner_device_proof_required/,
      ) &&
      has(
        "apps/web/server/services/runnerAuthService.ts",
        /hashRequestBody\(req\.body/,
      ) &&
      has("apps/runner-app/src/device_proof.rs", /SigningKey/) &&
      has(
        "apps/runner-app/src/device_proof.rs",
        /SAH_RUNNER_DEVICE_PRIVATE_KEY/,
      ) &&
      has(
        "apps/web/server/services/runnerAuthService.ts",
        /refreshRunnerAccessTokens/,
      ),
  ],
  [
    "gateway-and-durability",
    () =>
      has("apps/web/server/routes/runnerControl.ts", /\/api\/runners\/setup/) &&
      has(
        "apps/web/server/routes/runnerControl.ts",
        /\/api\/runners\/\:runnerId\/revoke/,
      ) &&
      has(
        "apps/web/server/routes/runnerControl.ts",
        /\/api\/runners\/\:runnerId\/access\/refresh/,
      ) &&
      has(
        "apps/web/server/routes/runnerControl.ts",
        /\/api\/runners\/\:runnerId\/control\/rotate/,
      ) &&
      has(
        "apps/web/server/routes/runnerControl.ts",
        /\/api\/runners\/\:runnerId\/capabilities/,
      ) &&
      has(
        "apps/web/server/routes/runnerControl.ts",
        /\/api\/runners\/\:runnerId\/control/,
      ) &&
      has("apps/web/server/routes/runnerControl.ts", /handleRunnerUpgrade/) &&
      has(
        "apps/web/server/routes/runnerControl.ts",
        /RUNNER_CONTRACT_VERSION/,
      ) &&
      has(
        "apps/web/drizzle/manual_smartaihub_runner_registry.sql",
        /runner_capability_snapshots/,
      ) &&
      has("apps/web/server/services/runnerGateway.ts", /commitSnapshot/) &&
      has(
        "apps/web/server/services/runnerGateway.ts",
        /requestedOwnerUserId/,
      ) &&
      has("apps/web/server/services/runnerGateway.ts", /\.for\("update"\)/),
  ],
  [
    "lease-and-isolation",
    () =>
      has("apps/runner-app/src/leasing.rs", /RUNNER_LEASE_FENCE_MISMATCH/) &&
      has("apps/runner-app/src/workspace.rs", /RUNNER_WORKSPACE_TRAVERSAL/) &&
      has(
        "apps/runner-app/src/workspace.rs",
        /RUNNER_WORKSPACE_SYMLINK_ESCAPE/,
      ) &&
      has("apps/runner-app/src/container.rs", /ContainerScope/) &&
      has(
        "apps/cloudflare/src/runnerContainer.ts",
        /RUNNER_CONTAINER_TENANT_SCOPE_INVALID/,
      ),
  ],
  [
    "discovery-and-adapters",
    () =>
      [
        "claude",
        "codex",
        "deepseek",
        "antigravity",
        "hermes",
        "openclaw",
      ].every((name) =>
        read("apps/runner-app/src/discovery.rs").includes(`"${name}"`),
      ) &&
      has("apps/runner-app/src/discovery.rs", /scan_environment/) &&
      has("apps/runner-app/src/adapters.rs", /probe_candidate/) &&
      has("apps/runner-app/src/process.rs", /Command::new/) &&
      has("apps/runner-app/src/transport.rs", /NativeControlTransport/) &&
      has("apps/runner-app/src/transport.rs", /handshake/) &&
      has("apps/runner-app/src/control_channel.rs", /Reconciling/) &&
      has("apps/runner-app/src/diagnostics.rs", /run_local_entrypoint/),
  ],
  [
    "ui-flow",
    () =>
      has(
        "apps/web/client/src/components/guardian/FeedbackButton.tsx",
        /Task Control/,
      ) &&
      has(
        "apps/web/client/src/components/chat/UniversalControlPlanePanel.tsx",
        /runnerNodes\.list/,
      ) &&
      has(
        "apps/web/client/src/components/chat/UniversalControlPlanePanel.tsx",
        /verification_pending/,
      ) &&
      has(
        "apps/web/client/src/components/settings/RunnerConnectPanel.tsx",
        /\/api\/runners\/setup/,
      ) &&
      has(
        "apps/web/client/src/pages/WorkerAppConnect.tsx",
        /RunnerConnectPanel/,
      ) &&
      has("apps/web/server/routers/runnerNodes.ts", /displayState/),
  ],
  [
    "release-policy",
    () =>
      has(
        ".github/workflows/runner-release.yml",
        /^on:\s*\n\s+workflow_dispatch:/m,
      ) &&
      !has(".github/workflows/runner-release.yml", /^\s+push:/m) &&
      has(
        ".github/workflows/runner-release.yml",
        /\"healthSignal\":\"\/health\/runner\"/,
      ) &&
      has("apps/runner-app/src/main.rs", /\"run\"/) &&
      has("apps/runner-app/src/main.rs", /\"rescan\"/) &&
      has("scripts/verify-runner-release-workflow.mjs", /workflow_dispatch/),
  ],
  [
    "rollout-evidence",
    () =>
      has(
        "specs/feature/205-smartaihub-runner-cross-platform/implementation/evidence.json",
        /cloudflare_target_account/,
      ) &&
      has(
        "specs/feature/205-smartaihub-runner-cross-platform/implementation/evidence.json",
        /unverified/,
      ) &&
      has(
        "specs/feature/205-smartaihub-runner-cross-platform/reviews/implementation-audit-10-rounds-2026-09-18.md",
        /\|\s*10\s*\|/,
      ),
  ],
];

let failed = false;
for (const [index, [name, check]] of rounds.entries()) {
  const pass = Boolean(check());
  console.log(`${pass ? "PASS" : "FAIL"} round ${index + 1}: ${name}`);
  if (!pass) failed = true;
}
if (failed) process.exitCode = 1;
else
  console.log(`runner implementation audit: ${rounds.length}/10 rounds passed`);
