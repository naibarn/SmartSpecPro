# SPEC-224 Runner Snapshot and Lease Gate — 2026-10-28

## Integrated Runner source

`501e0f258a601a5ddb45a822dfba4da79a34c82f` increased the complete dirty-path snapshot budget to 192 KiB and the bounded Runner envelope to 224 KiB, while retaining the 4,096-path limit. Oversized path sets remain unknown instead of being truncated. `573f9552b4115cd94eb6e8d873eb2d4cd3c677a7` fixes automatic Codex/Claude probe renewal so a failed probe is retried subject to the existing five-minute backoff even when its failed evidence has a future expiry. Both commits are integrated; current `origin/main` at observation was `4b05ae8f7628a68f3fb21d8047533468e354004f`.

Focused checks passed:

- `cargo test --manifest-path apps/runner-app/Cargo.toml --locked --lib workspace_registry:: -- --test-threads=1` — 19 passed.
- `cargo test --manifest-path apps/runner-app/Cargo.toml --locked --lib protocol:: -- --test-threads=1` — 7 passed.
- `cargo test --manifest-path apps/runner-app/Cargo.toml --locked --lib diagnostics:: -- --test-threads=1` — 32 passed.
- `cargo test --manifest-path apps/runner-app/Cargo.toml --locked --lib moli_isolation:: -- --test-threads=1` — 8 passed.
- `pnpm --dir apps/web exec vitest run server/services/__tests__/runnerContracts.test.ts` — 15 passed.
- `pnpm --dir apps/web exec vitest run server/services/spec224WorkspaceSourceAdmission.test.ts server/services/spec224WorkspaceSpecSet.test.ts server/services/workspaceAuthorityProjectReadModel.test.ts` — 46 passed.

## Signed in-place Runner upgrade

Runner workflow `40683218718` built the exact `501e0f258a601a5ddb45a822dfba4da79a34c82f` source. Its SHA256SUMS and RSA signatures verified; GitHub artifact `12813213251` had digest `sha256:a89d5dcff25868bf679f1033392955ea50359c3f77fb83eda076a8afd98931e0`. The artifact was installed with the bundled `install-linux-runner.sh upgrade`. The device data-root inode and `workspace_registry.json` inode and size remained unchanged. This removed the local `payload is too large` rejection.

Runner workflow `40684219130` built the exact `573f9552b4115cd94eb6e8d873eb2d4cd3c677a7` source, including the failed-probe retry fix. Its SHA256SUMS and binary/tarball/session-host signatures verified; GitHub artifact `12814367829` had digest `sha256:2ad3579aca243e1ae09af635d12a21c7f2695fcf6b73d7ea165ffa61c7e833f2`. The signed package was upgraded in place. Installed Runner version is `0.2.51-spec224-probe-retry-20261028a`, binary SHA256 `7e69d11a21770704c984f5c26bc8709ff4a9cac0f7d25c03f22d83fcb54b137c`; service is active. Data-root inode `45226397` and workspace-registry inode `45227923`/size `740` were unchanged.

The supported local command `/home/dev/.local/bin/smartaihub-runner verify codex` performed a real Codex task probe. It exited 3 with `taskProbeState=failed`, `reasonCode=task_probe_failed`; CLI version probe and authentication state passed. The retry fix now re-attempts failed evidence, but a successful task probe is not established.

## Live admission remains blocked

The Runner connection is configured for `aimarkethubs.com`. The configured local development PostgreSQL `runner_nodes` table has no row for device `runner-device-f1328901deec1b147d200a818e12e4be`; this alone does not identify the remote endpoint's environment. After each signed upgrade the service received `RUNNER_EVENT_REJECTED` and `RUNNER_STARTUP_RECONCILIATION_INCOMPLETE`; there is no server-acknowledged snapshot proving the complete `dirtyPaths` list. No endpoint change, re-enrollment, Goal, approval, or synthetic receipt was made.

The SPEC-224 source admission currently checks Runner source facts and dirty-path overlap, but does not atomically acquire/revalidate the SPEC-293 owner lease/fencing record or release an owned execution lease on terminal/recovery. `workspace.authority.audit` evidence alone is not a lease claim. No `SAFE_DISJOINT_DIRTY` result or live Goal start may be inferred from this work.

## Exact continuation

Implement the run-scoped claim/renew/release bridge using the existing SPEC-293 `workspace_authority.py` owner/fencing authority and canonical `worker_jobs` lifecycle. Bind the lease/fence to the current DevelopmentRun/Attempt in `spec224AuthorizationService.ts`; revalidate it at canonical outbox release and Runner apply boundaries; release it idempotently on terminal completion and recovery. Add connected tests for contention, disjoint dirty paths, stale fencing, crash recovery and duplicate release. Then establish which authorized Control Plane the existing device should use without changing its identity, obtain an acknowledged signed Runner snapshot there, and rerun server-authoritative source admission.

## Fresh readiness recheck — 2026-10-28

The installed Codex CLI authenticated and passed its version probe, but its read-only task probe initially failed because `/home/dev/.codex/config.toml` selected `gpt-6-luna`, which this ChatGPT account's refreshed Codex model catalog did not list. A direct read-only `codex exec --json --ephemeral --sandbox read-only --skip-git-repo-check` reproduced `model_not_found`; the same probe passed with account-listed `gpt-5.6-luna`. The single model setting was updated in the local Codex config, and `/home/dev/.local/bin/smartaihub-runner verify codex` then passed with `taskProbeState=passed`, `versionProbeState=passed`, and `authentication=ready`. Evidence reference: `runner-task-probe:sha256:ee6076950fc710b93558be40e42a5397cfc67014355a9b140e805ce4ba61058c`.

The existing Runner service was restarted through systemd user service control and remains active. Its startup snapshot delivery still receives `RUNNER_EVENT_REJECTED`, followed by `RUNNER_STARTUP_RECONCILIATION_INCOMPLETE`; therefore there is still no Control Plane acknowledgment of the passed Codex probe or complete dirty-path facts. The local development database still cannot be treated as evidence about the endpoint configured on the Runner. No endpoint was changed, no enrollment was repeated, and no Goal or synthetic receipt was created.

## Codex CLI upgrade and retest — 2026-10-28

The active `codex` executable resolves to the Node 24 global `@openai/codex` installation. Its owning npm executable was used to upgrade to the registry's `latest` tag, `0.165.0`, without switching Node installations. `/usr/local/bin/codex --version` reports `codex-cli 0.165.0`. The existing Runner command `/home/dev/.local/bin/smartaihub-runner verify codex` passed after the upgrade: authentication ready, version probe passed, task probe passed, evidence ref `runner-task-probe:sha256:653059b9d57dcd331f82d836729db054f3f1bea633a6885e3b3a342c2b5b883a`.

The Runner service was restarted to refresh discovery and remains active. Its status now discovers Codex `0.165.0`, but startup delivery still receives `RUNNER_EVENT_REJECTED` and `RUNNER_STARTUP_RECONCILIATION_INCOMPLETE`. The successful local task probe therefore is not a Control Plane acknowledgment or server-side readiness proof; admission and live Goal execution remain blocked.

## Rejection diagnostic repair — 2026-10-28

Source checkpoint `1fb72918c587d4b44875ccc733bf2540af063cf4` is integrated on `origin/main`. `runnerControl.ts` now preserves a validated stable `code` from structured control-plane errors and records the safe error class with the existing rejection stage/event metadata. This closes a confirmed diagnostic defect: capability-contract validation throws `JobControlPlaneError("RUNNER_CONTRACT_INVALID", ...)`, but the previous rejection mapper reduced it to `RUNNER_EVENT_REJECTED`. The real `handleRunnerSocketMessage` regression reproduces an invalid snapshot at `validate_snapshot` and now receives the stable `RUNNER_CONTRACT_INVALID` ACK. Command `JWT_SECRET=spec224-test-secret-0123456789abcdef012345 pnpm exec vitest run server/routes/__tests__/runnerControl.test.ts` passed 26/26 at this source checkpoint.

The installed local Runner remains active at `0.2.51-spec224-probe-retry-20261028a`; Codex CLI `0.165.0` passed an authenticated task probe at 2026-10-28 19:21 local time with evidence ref `runner-task-probe:sha256:d6ae6756ceafb763d8f064549af1c0afc29f49fd55110e31c7eb3d2f9feb9bea`. A later startup delivery to its configured `aimarkethubs.com` endpoint was still logged at 19:40 as `RUNNER_EVENT_REJECTED`, followed by `RUNNER_STARTUP_RECONCILIATION_INCOMPLETE`. Public `/healthz` and local `127.0.0.1:3100/healthz` both return `{"status":"ok"}`; those health responses do not identify the serving source, backend environment, database or rejection stage. Local `127.0.0.1:8100` is a separate Python service and returns 404 for `/healthz`. No production release identity or server log access was available, so the endpoint's actual runtime/database and exact live rejection cause remain unverified.

## Exact P0 continuation

Continue with the run/attempt-bound, path-scoped lease in the existing SPEC-293 `workspace_authority.py` authority and canonical `worker_jobs`/outbox. The present Python claim is limited to local `TASK_WORKTREE`; it does not issue leases for a registered Project Workspace or persist path-scoped overlap ownership. The Runner's existing `Candidate.apply()` does serialize per Project Workspace and recheck each changed path against its baseline, but it does not consume a server-issued run/attempt lease or fencing receipt. Connect claim, renewal, validation at authorization/release/apply, and idempotent terminal/recovery release; test contention, disjoint paths, stale fences, crash/replay and duplicate release before source admission. Then use the newly returned structured rejection code and release/runtime evidence to identify the configured endpoint's serving revision and repair the actual boundary. Do not start a Goal until a current signed snapshot is acknowledged and source admission is `SAFE_CLEAN` or `SAFE_DISJOINT_DIRTY`.

## Current boundary

Codex task readiness is now locally verified, replacing the earlier failed-probe observation. Live Task Control readiness remains unverified because the configured Control Plane rejects Runner events. SPEC-293's current `workspace_authority.py` lease claim is limited to local `TASK_WORKTREE` developer claims and is not yet a run-scoped Project Workspace lease consumable by SPEC-224 release and Runner apply. The exact remaining source operation is to expose a run/attempt-bound, path-scoped lease through the existing `workspace.authority.safe_action` / `worker_jobs` lifecycle, then bind and revalidate its fencing receipt in SPEC-224 authorization, canonical release, Runner candidate apply, and terminal/recovery cleanup. Until those changes and the server ACK exist, source admission must remain blocked and no write-capable Goal may start.
