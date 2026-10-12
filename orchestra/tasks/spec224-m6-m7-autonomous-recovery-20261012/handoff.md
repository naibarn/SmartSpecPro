# SPEC-224 M6/M7 Recovery Checkpoint — 2026-10-12

## State

`PARTIAL — implementation checkpoint prepared; real M6/M7 acceptance remains blocked by missing external non-production authority.`

Canonical source observed: `origin/main` at `162846d83b76c56a2fb1f2931327aa4ea6f65d9d`.

M6 is not PASS. The Factory runtime, stage worker, Runner stage adapter, and worker_jobs/outbox path are present in current source. A real stage still creates a child DevelopmentRun in `PENDING_AUTHORIZATION`; no generated app code, real Runner receipt, package artifact, or browser evidence was created in this recovery.

M7 has synthetic DevelopmentRun/outbox restart and retry evidence at historical integrated SHAs, but no real Runner execution was interrupted or reattached. SPEC-278's Linux session-host launch and recovery code is opt-in and authority-gated. The Linux release archive and installer previously omitted its helper binary, so the supporting checkpoint now packages and installs that helper while leaving the feature disabled.

M8 remains deferred.

## Root cause and classifications

- `smartaihub-runner status --json` observed Runner `0.2.23`, lifecycle `ready`, 11 discovered tools, and zero ready tools. Codex and browser are discovered but `probe_required`; `ready` does not establish capability readiness.
- Read-only `codex login status` returned `Logged in using ChatGPT`. This confirms local CLI login only. It does not prove the Runner published that authority to an authorized tenant or that it is bound to a Factory run.
- No authorized non-production Runner/session/source/workspace binding or disposable application-schema database was available. Dispatch remains explicitly fail-closed: `REMOTE_TRUST_NOT_ESTABLISHED`, `ADMISSION_POLICY_DENIED`, and `INSUFFICIENT_EVIDENCE`.
- No actual policy denial was observed because no admission/dispatch was attempted. Missing evidence is not recorded as denial.
- No `smartaihub-runner rescan` was run: Runner rescan publishes capability state to the configured control plane, whose default origin is production. No authorized non-production origin was discovered.
- No `CREDENTIAL_UNAVAILABLE`, protocol incompatibility, dispatch defect, or receipt-settlement defect is proven. No real dispatch occurred.
- A directly related implementation gap was confirmed in SPEC-278 packaging: source contains a Linux opt-in launch/reattach route, but `runner-release.yml` and the Linux installer did not ship/install `smartaihub-session-host`. The checkpoint fixes artifact packaging and rollback-safe installation without enabling the feature or provisioning authority.

## Validation

- `apps/runner-app/tests/test-linux-install.sh` — PASS using its fake systemd/home in a temporary directory.
- Focused Node assertions for Linux release packaging contract — PASS.
- PyYAML parse of `.github/workflows/runner-release.yml` — PASS.
- `bash -n apps/runner-app/install-linux-runner.sh` — PASS.
- `git diff --check` — PASS.
- Added Vitest regression coverage in `runnerReleaseWorkflow.test.ts`; Vitest could not run because `pnpm --filter @smartspec/web exec vitest` reports `Command "vitest" not found` in this clean worktree. No dependency install was attempted.
- `actionlint` and `shellcheck` are unavailable in this environment.
- No full build/typecheck, Runner live probe, database action, deployment, M6, M7 or browser UAT was run.

## Handoff ownership

This file and `capability-matrix.json` are supporting recovery evidence. The canonical SPEC-224 manifest remains the authority and was not rewritten because the registered SPEC-224 audit worktree/ownership is separate and its current manifest integration SHA (`5bc461753c6fbf968b9874257892631ad8c4b089`) is stale relative to current `origin/main`. After this checkpoint integrates, the SPEC-224 owner must reconcile the canonical manifest and requirement ledger through `tools.spec_handoff` using the new exact SHA. Do not edit another task worktree.

## Next action

Finish the bounded checks, open a small normal PR for the Linux helper package/installer fix, and wait for required branch-protection checks. After integration, the authorized SPEC-224 owner should update the canonical Handoff and pursue the exact resume predicate in `capability-matrix.json`: owner-authorized disposable Runner registration, fresh capability snapshot and source/workspace attestation, supported disposable PostgreSQL target, DevelopmentRun/job/attempt binding, and scoped approval. Then run M6 and M7 acceptance separately and preserve exact receipts, artifact digests and browser evidence. No production/staging resources or live tenant data are authorized by this checkpoint.
