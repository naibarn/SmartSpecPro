# SPEC-224 Personal Mini-App Closure Checkpoint

## Source and outcome

- Canonical source checked: `c81ce6f88f687e3347fc3f866c4fcb66fd86fc7f` (`origin/main`).
- Prior code checkpoint: `24e252092c95fd9b71018deed5b1cf0c03eaa909`.
- Outcome: partial implementation evidence only. No real app was generated, no App Identity/artifact was created, and no user-trial or production acceptance is claimed.
- Verification date: 2026-10-23 (UTC).

## Verified implementation evidence

- Profile `quick`, source `c81ce6f`: command `JWT_SECRET=spec224-focused-test-secret-0123456789abcdef pnpm --filter @smartspec/web exec vitest run server/routers/__tests__/spec226DevelopmentControl.test.ts client/src/pages/__tests__/MiniAppRoute.test.tsx server/services/appIdentityRepository.test.ts server/services/personalMiniAppPreview.test.ts server/services/miniAppFactoryPipeline.test.ts server/services/miniAppFactoryRunExecutor.test.ts` passed: 5 files, 37 tests. Vitest reported start time 2026-10-23 12:16:25Z; duration 5.09 seconds.
- At `24e2520`, command `JWT_SECRET=spec224-focused-test-secret-0123456789abcdef pnpm --filter @smartspec/web exec vitest run server/services/miniAppFactoryRunExecutor.test.ts server/services/miniAppFactoryDurableState.test.ts server/services/miniAppFactoryPipeline.test.ts server/services/personalMiniAppPreview.test.ts` passed: 4 files, 24 tests.
- Profile `integration`, source `c81ce6f`: command `TMPDIR=/tmp/spec224-miniapp-ext4 bash apps/web/scripts/test-mini-app-factory-stage-worker-runtime.sh` passed at 2026-10-23 12:18:12Z–12:18:22Z. It exercised disposable PostgreSQL worker_jobs/outbox admission, cross-process retry, outbox recovery, and settlement. Its stage implementation intentionally injects a synthetic retry and does not call a model.
- A code correction in `personalMiniAppPreview.ts` keeps a usable last-known-good preview visible if a later factory stage fails and prevents `BUILDING` from appearing when a usable artifact is already bound.
- A focused receipt validator can record `USER_TRIAL_READY` only for a PASS receipt bound to the Personal Mini-App ID, canonical URL, deployed artifact digest, and completed smoke/deploy scope. It has no production caller yet, so this is not evidence of a recorded trial-ready result.

## Live acceptance not demonstrated

- No authorized hosted non-production Mini-App runtime/Gateway target is configured for this session. The disposable runtime configuration pointed its control-plane URL to loopback port 1; no live model provider credential was configured there. The Python backend environment inspected for endpoint names was explicitly `production`, so it was not used as test infrastructure.
- No non-production expense-tracker run exists: no settled real model receipt, appId, source snapshot, artifact digest, bound private preview, or browser journey.
- Existing user/private-access unit tests are not equivalent to the requested real browser checks. Owner interaction, totals/chart, reload persistence, mobile viewport, and denial of private bytes to a second real identity remain unverified.
- Per-app repository provisioning supports `SMARTAIHUB_MANAGED`; no configured app-owner GitHub connection or SmartAIHub organization write authority is available. The local GitHub CLI identity has personal `repo` scope but no SmartAIHub organization visibility; it was not used to create or mislabel an app repository.
- Production runtime was last observed on SHA `26640e87162576a1505e02a026cc35a846eb8517`, while this source checkpoint is newer. The existing guarded release path reports `sudo: a password is required` for this user session. An earlier release preparation process remains blocked in NTFS I/O, before the authorization step. No production deployment was performed.

## Resource and migration notes

- The first disposable PostgreSQL target stored its data directory on `/mnt/ExpansionHD` (NTFS); PostgreSQL checkpoint I/O stalled there. No production database was touched.
- The repository's dedicated `drizzle.mini-app-baseline.config.ts` worker/outbox lane runs on a temporary PostgreSQL cluster under `/tmp` and passed as described above.
- Resource evidence around the integration run: `/tmp` was on ext4 with 5.7 GB available and 33,180,087 free inodes; I/O PSI `avg10` was 0.45 before and 0.76 after (full PSI), and the run completed in 10 seconds. The NTFS-backed PostgreSQL data directory was not reused.
- A separate attempt to run the full application migration chain from an empty database stopped at migration `0015_naive_franklin_richards.sql`, which assumes the legacy `workflow_templates` baseline. That attempt is not a SPEC-224 regression and is not a substitute for the dedicated Mini-App baseline lane.

## Exact continuation predicates

1. Resume live generation when an authorized hosted non-production web/worker target is provisioned with a disposable or test database, reachable SmartAIHub Skill Execution/Gateway, an authorized test tenant and identity, and an existing budget policy. Then run the exact expense-tracker prompt and preserve its real provider receipt.
2. Resume repository binding when either the configured SmartAIHub-managed repository-create/write token is available or the app owner connects an authorized user-owned GitHub repository through an existing app-owner connection.
3. Resume deployed browser acceptance after the real artifact is bound and the exact canonical candidate is built. Publish only through `pnpm run release:web:linux -- --required-integrated-revision <sha>` with an authenticated sudo session; then verify served SHA and run the owner/unauthorized browser journey.
