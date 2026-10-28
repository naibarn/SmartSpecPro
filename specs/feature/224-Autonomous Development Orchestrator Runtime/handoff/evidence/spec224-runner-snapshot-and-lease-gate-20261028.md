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

The Runner connection is configured for `aimarkethubs.com`, not the Control Plane serving this development checkout. The local development PostgreSQL `runner_nodes` table has no row for device `runner-device-f1328901deec1b147d200a818e12e4be`. After each signed upgrade the service received `RUNNER_EVENT_REJECTED` and `RUNNER_STARTUP_RECONCILIATION_INCOMPLETE`; there is no server-acknowledged snapshot proving the complete `dirtyPaths` list. No endpoint change, re-enrollment, Goal, approval, or synthetic receipt was made.

The SPEC-224 source admission currently checks Runner source facts and dirty-path overlap, but does not atomically acquire/revalidate the SPEC-293 owner lease/fencing record or release an owned execution lease on terminal/recovery. `workspace.authority.audit` evidence alone is not a lease claim. No `SAFE_DISJOINT_DIRTY` result or live Goal start may be inferred from this work.

## Exact continuation

Implement the run-scoped claim/renew/release bridge using the existing SPEC-293 `workspace_authority.py` owner/fencing authority and canonical `worker_jobs` lifecycle. Bind the lease/fence to the current DevelopmentRun/Attempt in `spec224AuthorizationService.ts`; revalidate it at canonical outbox release and Runner apply boundaries; release it idempotently on terminal completion and recovery. Add connected tests for contention, disjoint dirty paths, stale fencing, crash recovery and duplicate release. Then resolve the existing device’s authorized development Control Plane binding without changing its identity, publish and acknowledge the signed Runner snapshot, and rerun server-authoritative source admission.
