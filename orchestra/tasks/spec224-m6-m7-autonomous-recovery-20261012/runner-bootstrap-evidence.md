# SPEC-224 Non-production Runner Bootstrap Evidence

Observed: 2026-10-12, UTC. Canonical checkout state at observation: `2923d8a2855f257948e2d8a1c16357d4bc61224f`; Runner readiness repair PR #848 merged at `8eefd800eb8a13389dd75bc4bc61547a1262aef4`.

## Environment readiness

- The system-level unit `smartaihub-runner.service` is absent. The actual Runner was a systemd **user** unit at `/home/dev/.config/systemd/user/smartaihub-runner.service`, enabled and running since 2026-10-10. The earlier “inactive” observation came from querying system scope, so the Runner service itself was not inactive.
- Installed Runner: version `0.2.23`; contract `sah-runner-v1`; connect schema `sah-runner-connect-v2`; x86_64 Linux ELF, SHA-256 `382791c51220a4ddeebac63096ced9444753f25c20e55f5ee09d627c0ea291ed`. `ldd` found no missing dynamic dependencies.
- Service journal repeatedly recorded `RUNNER_CONNECT_REQUEST_REJECTED_409` on refresh/update. Existing connection metadata had already been identified as production-bound with an expired credential. No credential value was read or reused. To prevent additional production attempts, the user unit was stopped and disabled; its binary, configuration, enrollment data and workspace records were retained. Current state: `inactive`, `disabled`.
- `smartaihub-session-host` is not installed at `/home/dev/.local/bin`. The current installer test passes; the host absence reflects the installed bundle/version and is not an installer failure. Session Host remains opt-in and still requires its pinned digest and authorized execution-session grant.
- `smartaihub-runner status --json` observed 0/11 ready capabilities. Codex CLI `0.160.0` is installed and its local login status is “Logged in using ChatGPT”; this does not prove the Runner adapter can execute or publish evidence. Chromium for Testing `149.0.7827.55` is present in the Playwright cache with no missing shared libraries; it was not launched through the Runner or published as a capability because no authorized Runner session/grant exists.

## Control-plane discovery and isolation

- No suitable authorized dev/test Runner control plane was established.
- The existing local `smartspec-control-plane` container is configured with `NODE_ENV=production` and connects to the shared `smartspec` database through the shared PostgreSQL container. It is not an isolated disposable test target and was not used for enrollment, capability publication, DevelopmentRun dispatch, grant lookup/creation, or any database mutation.
- During initial endpoint inventory, before container configuration had been inspected, a read-only GET was sent to `http://127.0.0.1:7070/healthz`; it returned `200 {"ok":true}`. Subsequent inspection proved this local port maps to the production-configured container. No credentials were sent and no other route was used. Do not repeat this probe.
- The local Runner daemon was the only process making control requests before it was stopped. Its repeated 409 responses were not treated as a capability probe or authorization decision.

## Capability, admission, M6/M7 and UAT

- Runner capability readiness: **not ready**. No fresh tenant/session-bound snapshot was published. Codex and browser were not probed through Runner because that would require the unavailable authorized non-production Runner session/grant; local CLI/browser presence is discovery only.
- Admission: **not established**. No trusted tenant/project binding, source commit/digest, workspace binding, eligible DevelopmentRun, protected dispatch grant, operation/path scope, approval, or budget was verified. No grant was fabricated or bypassed.
- M6 real Factory execution: **not run**. No Runner dispatch, Codex implementation, generated artifacts, Factory stage receipt/settlement, repair, or isolated runtime launch occurred.
- M7 real interruption/retry/restart/idempotent-settlement recovery: **not run**.
- Browser functional UAT: **not run**. Cached Chromium version is not UAT evidence.
- Code defect repaired: `smartaihub-runner status` previously hard-coded `state=ready` even when `readyToolCount=0`. PR #848 changes the state to `degraded` when no trusted-ready capability exists, with a focused unit test. The installed `0.2.23` binary was not replaced by this code change.

## Verification and resource findings

- PASS: `cargo fmt --manifest-path apps/runner-app/Cargo.toml -- --check`.
- PASS: `CARGO_BUILD_JOBS=2 cargo test --manifest-path apps/runner-app/Cargo.toml redacted_status_tests::status_does_not_claim_ready_without_any_ready_capabilities --lib` (1 passed).
- PASS: `bash apps/runner-app/tests/test-linux-install.sh` (`linux runner install lifecycle: PASS`).
- PASS: PR #848 `progressive_integration_gate` for head `b0741ba95d47ddf9cb273e80fdb3aa19d4990352`; PR merged normally at `8eefd800eb8a13389dd75bc4bc61547a1262aef4`, reachable from `origin/main` at `2923d8a2855f257948e2d8a1c16357d4bc61224f`.
- The post-integration CI workflow for `8eefd800eb8a13389dd75bc4bc61547a1262aef4` was still in progress at observation; this is pending evidence, not a pass.
- Prior Runner release workflow `38191565929` failed before building artifacts: one Linux test failed in an unprivileged network-namespace assertion (`left=1`, `right=0`); 188 passed and 1 failed. No test was skipped or bypassed, and no repeated release build was attempted.
- The primary checkout `/mnt/SmartSpecDev/projects/SmartSpecPro` remains dirty and untouched. The code and evidence work occurred in isolated managed worktrees.

## Root cause, available authority, and unblock predicate

Root cause is layered: the prior “inactive” status queried the wrong systemd scope; the actual user service is running but points at production and is rejected with HTTP 409 because its credential is expired; local capability discovery has no verified-ready Codex/browser evidence; and the only discovered local control plane shares production configuration/storage. The installed bundle also lacks the optional Session Host executable. No engineering or installer failure was found in the tested installer path.

Minimum operator action: identify an existing authorized non-production SmartAIHub control-plane target or explicitly authorize a disposable isolated local target with its own app-schema database and storage. Through that target’s canonical enrollment/approval and protected-grant workflow, issue a current non-production Runner session and `protected_dispatch` grant scoped to the approved tenant, project, Runner/session, DevelopmentRun/job/attempt, exact source commit and digest, workspace, workpackage/operation, path set, runtime, and `isolated-non-production` environment; provide the corresponding approval/budget scope and trusted source verifier/issuer if required. Do not reuse the production credential or production database.

Exact unblock predicate: a fresh capability snapshot from the actual enrolled non-production Runner reports Codex and browser ready and binds the authorized tenant/project/session, current grant, exact source digest, workspace and eligible DevelopmentRun; server admission confirms operation/path/runtime/environment constraints and required approval/budget. Only then may real M6 run; M7 follows a passing M6.

Until this predicate is met, M6/M7 and UAT remain open. Do not restart or re-enable the production-bound user unit.
