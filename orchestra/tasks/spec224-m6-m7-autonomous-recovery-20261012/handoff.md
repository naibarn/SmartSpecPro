# SPEC-224 M6/M7 Recovery Checkpoint — 2026-10-12

## State

`PARTIAL — Linux packaging fix integrated; real M6/M7 acceptance remains blocked by missing external non-production authority.`

Implementation source: PR #836 merged normally at `5f5154a161ef6cf73c2d0f1ea260ab0d43a495cc`. Handoff source was PR #837 at `4bfb94f3422787ffe161915e0d82097c8e95afa1`. Latest `origin/main` fetched during this continuation is `d0b558f7b1e511bbb866b35bae7f3880b742277c`; the execution-fix worktree is based on it.

## Fresh execution unblock audit — 2026-10-12

- `smartaihub-runner status --json` at `2026-10-12T01:16:53.712Z` again reported 0/11 ready tools. Source confirms `status`/`doctor`/`capabilities` only call `scan_environment` (PATH discovery); they do not execute probes. `redacted_status` also reports process `state: ready` unconditionally, so that field is not capability evidence.
- `rescan` is the probe-and-publish path. With no `SAH_RUNNER_*` process/service configuration it defaults to `https://smartaihub.app`; the systemd Runner service is inactive. The only stored connection record is under `/home/dev/.smartaihub-runner`, is bound to the production origin, and its control token expired `2026-10-09T08:15:53Z`. No rescan, pairing, or dispatch was attempted. Reusing that record would contact production and is prohibited.
- This is missing valid non-production configuration/evidence, not an observed admission denial. No non-production Runner session, fresh tenant-scoped snapshot, source/workspace attestation, scoped grant, or disposable application database is present. Local Codex login and discovered binaries do not establish those bindings.
- Source review confirms the protected admission path remains intentionally fail-closed. Local integrity-only source evidence is eligible only in `development`/`test` after the canonical Python grant validator returns `VALID`; remote trust remains denied until an owner-approved verifier can resolve issuer keys, storage policy, signature, binding, expiry, revocation, and replay. `spec224RemoteSourceTrustVerifier.ts` has no production caller. Do not relax these checks.
- Exact minimum owner-provisioned authority for a local M6/M7 run: non-production Runner enrollment/control URL and current device/session token; a fresh capability snapshot bound to tenant, Runner session, Codex and browser probes, exact source/workspace, and DevelopmentRun/job attempt; an existing canonical `protected_dispatch` grant bound to tenant, source commit/digest, workpackage, operation/path, runtime `node-control-plane`, environment `isolated-non-production`, and matching runtime/admission bindings; required provider approval and budget authorization; and a disposable non-production app-schema database. If the route requires remote trust, its approved verifier/issuer/storage/revocation configuration is also required. No such authority was found in this session.
- Focused Vitest on rebased task commit `6d5db0533ea55ad81457cd88c8a177a14ac238af`, after installing only `@smartspec/web` workspace dependencies in this isolated worktree: 8 files / 48 tests passed. It covers Runner release packaging, SPEC-224 admission/source/workspace contracts, and Factory/DevelopmentRun contracts. The first run exposed a false-negative release workflow assertion that expected quotes around tar member names; the assertion now checks the exact tar command. No runtime behavior changed.
- Main CI [38191201225](https://github.com/naibarn/SmartSpecPro/actions/runs/38191201225) for `94eedf0a…` failed `turbo_build` (TypeScript errors in unchanged paths) and `python`; SmartSpecWeb was still running when recorded. Current-source CI [38191643238](https://github.com/naibarn/SmartSpecPro/actions/runs/38191643238) for `d0b558f7…` is running; `turbo_build` has the same failure, while SmartSpecWeb/Python are pending. Runner workflow [38191565929](https://github.com/naibarn/SmartSpecPro/actions/runs/38191565929) ran at `94eedf0a…` with publish disabled; crate tests reported 188 passed and one failure in `moli_isolation::tests::linux_spawn_uses_user_network_namespaces_private_profile_and_group_cleanup` (child exit 1), so the workflow did not reach the build. Do not bypass this test; it is separate from Factory acceptance.
- Existing `smartspec-postgres` on local port 5432 is a shared persistent service and was not used. The SPEC-224 isolated test endpoint on port 55493 is not running. No Docker DB, staging, production, tenant data, approval, grant, or credential was created or modified.

M6 is not PASS. The Factory runtime, stage worker, Runner stage adapter, and worker_jobs/outbox path are present in current source. A real stage still creates a child DevelopmentRun in `PENDING_AUTHORIZATION`; no generated app code, real Runner receipt, package artifact, or browser evidence was created in this recovery.

M7 has synthetic DevelopmentRun/outbox restart and retry evidence at historical integrated SHAs, but no real Runner execution was interrupted or reattached. SPEC-278's Linux session-host launch and recovery code is opt-in and authority-gated. The Linux release archive and installer previously omitted its helper binary; PR #836 now packages and installs that helper while leaving the feature disabled.

M8 remains deferred.

## Integration and post-integration evidence

- PR #836: `https://github.com/naibarn/SmartSpecPro/pull/836`; source `606501f5f46f70404bacde9a959a75d2ad1c341a`, merge `5f5154a161ef6cf73c2d0f1ea260ab0d43a495cc`. The repository integration controller preflight was `READY`; `progressive_integration_gate` passed; merge used the normal protected path with no bypass. `build-preview` was skipped by workflow policy.
- The required post-integration canonical build for exact SHA `5f5154a161ef6cf73c2d0f1ea260ab0d43a495cc` is `RESOURCE_BLOCKED`, exit 137. Resource preflight found user-slice swap headroom below 512 MiB, so the web build never started. Result: `/home/dev/.cache/codex/canonical-sources/.development-build-results/f29801373bfd4154c0d8/5f5154a161ef6cf73c2d0f1ea260ab0d43a495cc-3049295e-e03b-49c5-b69a-3a3dcb95f6b8.json`. Do not retry without a fresh resource observation or changed capacity; use CI/dedicated build capacity. This is not a code failure.
- Workspace verify for integrated SHA `5f5154a161ef6cf73c2d0f1ea260ab0d43a495cc` returned `CONVERGENCE_PENDING`: registered `/home/dev/projects/SmartSpecPro` resolves to `/mnt/SmartSpecDev/projects/SmartSpecPro`, remains dirty at `ccd4cd11c664cf81cc54fe1287c60ce7f5c36978`, and was not modified or converged.

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
- `runnerReleaseWorkflow.test.ts` passes under Vitest; only the isolated web workspace dependencies were installed with the frozen lockfile.
- `actionlint` and `shellcheck` are unavailable in this environment.
- The prior exact-SHA central build was `RESOURCE_BLOCKED`; no retry was made on the same host. Current-main CI ran its `turbo_build` check and failed with unrelated TypeScript errors. No local typecheck, Runner live probe, database action, deployment, M6, M7 or browser UAT was run.

## Handoff ownership

This file and `capability-matrix.json` are supporting recovery evidence. The canonical SPEC-224 manifest remains the authority and was not rewritten because the registered SPEC-224 audit worktree/ownership is separate and its integration SHA (`5bc461753c6fbf968b9874257892631ad8c4b089`) is stale relative to current `origin/main`. After this recovery update integrates, the SPEC-224 owner must reconcile the canonical manifest and requirement ledger through `tools.spec_handoff` using the exact then-current canonical SHA. Do not edit another task worktree.

## Next action

The Linux helper packaging fix is integrated. The previous shared-host build was `RESOURCE_BLOCKED`; no retry was made. CI on exact current main `d0b558f7…` is the active build/test check, and no successful full build is claimed. Preserve the dirty registered user workspace. After this recovery update integrates, the SPEC-224 owner should reconcile the canonical manifest through `tools.spec_handoff` at the then-current SHA. Real M6/M7 remains blocked until the exact external predicate in `capability-matrix.json` is met; then run M6 and M7 acceptance separately and retain real Runner receipts, artifact digests, recovery evidence and functional browser UAT. No production/staging resources or live tenant data are authorized.
