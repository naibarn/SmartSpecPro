# SmartAIHub Runner Release Management Implementation Plan

Implementation record: Tasks 1–10 are implemented in the repository. Focused
local verification passes; real GitHub signing, native host installs, deployed
browser proof and Cloudflare target-account rollout remain explicit external
gates.

> **For agentic workers:** Execute the tasks in dependency order. Each task is
> backed by the corresponding Feature 205 section file and must be verified
> with focused tests before moving forward.

**Goal:** Build a manual GitHub Actions release pipeline and SmartAIHub-owned
Runner distribution surface that supports platform-aware download, version
check and verified local self-update without exposing GitHub to normal users.

**Architecture:** GitHub Actions builds deterministic native packages/raw
update binaries and a Cloudflare handoff manifest. SmartAIHub imports validated
assets into a dedicated release catalog/object-storage namespace and exposes
same-origin catalog/download/update APIs. Local Runner updates are durable
authenticated control-plane commands with drain, verification, atomic replace,
restart confirmation and rollback; Cloudflare image rollout remains Feature
204's owner.

**Tech Stack:** Rust/Cargo, TypeScript/Zod, Express, Drizzle/PostgreSQL,
object-storage helpers, React/Vitest, Playwright, GitHub Actions.

**Spec:** `docs/portable-skill-pack/specs/2026-09-18-smartaihub-runner-release-management-design.md`,
`specs/feature/205-smartaihub-runner-cross-platform/spec.md`,
`specs/feature/204-cloudflare-container-runtime-control-plane/spec.md`

## Global Constraints

- Keep `.github/workflows/runner-release.yml` `workflow_dispatch`-only.
- Do not modify Worker App package identity or Worker App release workflows.
- Do not introduce Agency, workpacks, custom workflows, OpenSandbox,
  `sandbox_jobs` or Docker/OpenSandbox dispatch.
- Use canonical `worker_jobs`/outbox for execution; update commands are control
  state, not a second Job ledger.
- Do not expose GitHub repository/workflow/token, raw paths, credentials or
  provider payloads to normal users.
- Do not run repository-wide TypeScript typecheck; use focused checks only.
- Preserve unrelated dirty-worktree changes and stage only owned paths.

---

### Task 1: Freeze the release catalog contract

**Files:**
- Create: `apps/web/shared/runnerReleases.ts`
- Modify: `apps/web/drizzle/schema.ts`
- Create: `apps/web/drizzle/0336_runner_release_assets.sql`
- Test: `apps/web/server/services/__tests__/runnerReleaseCatalog.test.ts`

**Interfaces:**
- `RunnerReleaseAsset` exposes version, platform, architecture, profile,
  channel, asset kind, hash, signature/provenance and SmartAIHub download path.
- `RunnerReleaseCatalogResponse` exposes published compatible assets and
  `latestByTarget` package/update pairs.
- Drizzle table identity is `(version, platform, architecture, profile,
  channel, assetKind)`.

- [ ] Add the Zod enums/types and validation checks for the four native target
  combinations plus `shared_container` manifest.
- [ ] Add the table and migration without touching existing desktop/worker
  runtime tables.
- [ ] Write tests for valid identity, duplicate identity, incompatible target,
  latest grouping and legacy-safe nullable signature metadata.
- [ ] Run the focused service test and then implement the minimal schema/service
  contract until it passes.
- [ ] Run `git diff --check`.

### Task 2: Implement catalog persistence and same-origin downloads

**Files:**
- Create: `apps/web/server/services/runnerReleaseService.ts`
- Create: `apps/web/server/routes/runnerReleases.ts`
- Modify: `apps/web/server/_core/index.ts`
- Test: `apps/web/server/routes/__tests__/runnerReleases.test.ts`

**Interfaces:**
- `listRunnerReleaseCatalog({ includeUnpublished, platform, architecture, channel })`.
- `persistRunnerReleaseAssetFromPath(input)` recomputes the SHA-256 and stores
  validated bytes.
- `getLatestRunnerRelease(input)` returns package and update asset metadata.
- `streamRunnerReleaseAsset(id, request)` returns a range-aware storage stream.

- [ ] Test public filtering, withdraw/invalid behavior, malformed IDs, safe
  headers and storage-missing errors.
- [ ] Implement path sanitization, hash recomputation, manifest checks and
  storage/object cleanup on DB failure.
- [ ] Add public `GET /api/runner-releases` and `/latest` routes.
- [ ] Add admin upload/import/publish/withdraw route seams needed by Task 4.
- [x] Add same-origin package download and command-bound Runner-authenticated raw
  update download route seams without returning external URLs.
- [ ] Run the focused route/service tests.

### Task 3: Make the manual workflow produce publishable Runner releases

**Files:**
- Modify: `.github/workflows/runner-release.yml`
- Modify: `scripts/verify-runner-release-workflow.mjs`
- Test: focused Node workflow-policy test or the verifier itself

- [ ] Add `release_notes` input and explicit `publish` release behavior.
- [ ] Emit unique package, raw executable, manifest and checksum filenames per
  target; record the selected checkout commit and Runner version.
- [ ] Add a publish job guarded by `inputs.publish == true` that creates or
  updates `runner-v<version>` using `GITHUB_TOKEN` without printing secrets.
- [ ] Keep the container job as manifest/handoff only and do not deploy
  Cloudflare from this workflow.
- [ ] Extend the static verifier for raw assets, release tag, release notes,
  manual-only triggers and no Worker workflow references.
- [ ] Run `node scripts/verify-runner-release-workflow.mjs`.

### Task 4: Add admin dispatch, status and server-side GitHub sync

**Files:**
- Create: `apps/web/shared/runnerReleaseBuilds.ts`
- Create: `apps/web/server/services/runnerReleaseBuildService.ts`
- Modify: `apps/web/server/routes/runnerReleases.ts`
- Modify: `apps/web/server/services/desktopReleaseSettings.ts`
- Modify: `apps/web/client/src/features/desktop-releases/DesktopReleaseConfigPanel.tsx`
- Test: focused build service/route tests

- [ ] Add a separate admin-configured Runner workflow name defaulting to
  `runner-release.yml` while reusing encrypted repository/ref/token storage.
- [ ] Implement admin-only dispatch with typed inputs and durable build state.
- [ ] Implement bounded status polling and release-tag lookup through GitHub
  server-side only.
- [ ] Select expected native package/raw/manifest assets, download them to a
  temporary directory, recompute hashes and persist them through Task 2.
- [ ] Mark sync complete only after all requested targets validate; retain
  retryable vs permanent errors and redact GitHub response bodies.
- [ ] Test role rejection, missing token, dispatch mapping, asset selection,
  hash mismatch, retry and partial-sync behavior.

### Task 5: Add Runner version reporting

**Files:**
- Modify: `apps/runner-app/Cargo.toml`
- Modify: `apps/runner-app/Cargo.lock`
- Modify: `apps/runner-app/src/main.rs`
- Modify: `apps/runner-app/src/diagnostics.rs`
- Modify: `apps/runner-app/src/lib.rs`
- Modify: `apps/web/server/services/runnerContracts.ts`
- Test: Rust focused tests and Runner contract tests

- [ ] Define a compile-time version constant with local Cargo fallback and
  `SAH_RUNNER_BUILD_VERSION` override for release builds.
- [ ] Add `version` command output and include version/target/contract in
  redacted status and capability snapshots.
- [ ] Normalize legacy snapshots without `runnerVersion` to `null`.
- [ ] Add tests proving release input and binary-reported version can match.
- [ ] Run `cargo fmt --check` and the focused Runner/server contract tests.

### Task 6: Implement durable authenticated update commands

**Files:**
- Create: `apps/web/drizzle/0337_runner_update_commands.sql`
- Modify: `apps/web/drizzle/schema.ts`
- Create: `apps/web/server/services/runnerUpdateService.ts`
- Modify: `apps/web/server/services/runnerAuthService.ts`
- Modify: `apps/web/server/routes/runnerControl.ts`
- Test: focused update service and route tests

- [ ] Add the control-state table with tenant/runner/release/idempotency,
  status, phase, actor, error and timestamps.
- [ ] Add `runner:update` to control-token defaults while preserving Runner
  audience/token-use/device-proof checks.
- [ ] Implement session endpoint for tenant-owner/admin update request and
  status endpoint with release compatibility/withdrawal checks.
- [ ] Implement Runner command next/download/ack endpoints with command scope,
  runner binding, device proof and monotonic idempotent state transitions.
- [ ] Test replay, foreign tenant, revoked runner, duplicate idempotency,
  command ordering and withdrawn release rejection.

### Task 7: Implement Rust verification, replacement and rollback

**Files:**
- Create: `apps/runner-app/src/update.rs`
- Modify: `apps/runner-app/src/config.rs`
- Modify: `apps/runner-app/src/diagnostics.rs`
- Modify: `apps/runner-app/src/lib.rs`
- Modify: `apps/runner-app/src/main.rs`
- Test: `apps/runner-app/src/update.rs` tests and diagnostics tests

- [ ] Add pure functions for bounded SHA-256 verification, required signature
  verification, target/path validation, backup naming and atomic replacement.
- [ ] Add temporary sibling download and platform-aware executable mode
  handling; never overwrite the running binary in place.
- [ ] Wire the local refresh lifecycle to poll one command, report phases,
  drain active work, verify before replacement, restart and confirm health.
- [ ] Restore the backup on restart timeout or permission/startup failure and
  report rollback through the ack endpoint.
- [ ] Add tests for hash/signature mismatch, traversal, active-job deferral,
  atomic replacement and rollback.
- [ ] Run `cargo fmt --check` and `cargo test --manifest-path apps/runner-app/Cargo.toml`.

### Task 8: Build Dashboard download/version/update UI

**Files:**
- Create: `apps/web/client/src/features/runner-releases/useRunnerReleaseCatalog.ts`
- Create: `apps/web/client/src/features/runner-releases/RunnerReleasePanel.tsx`
- Modify: `apps/web/client/src/pages/Dashboard.tsx`
- Modify: `apps/web/client/src/locales/en/dashboard.json`
- Modify: `apps/web/client/src/locales/th/dashboard.json`
- Test: `apps/web/client/src/features/runner-releases/__tests__/RunnerReleasePanel.test.tsx`

- [ ] Run `npm run astryx -- build "SmartAIHub Runner release download and update card"` before UI implementation and use it only as a reference.
- [ ] Add abort-safe catalog/status hooks and platform/architecture selection.
- [ ] Render current/latest version, last check, package download and update
  state with explicit offline/busy/reconciling/verification/rollback copy.
- [ ] Keep Runner and Worker App labels/routes distinct and redact GitHub/path/
  credential/provider data.
- [ ] Add responsive keyboard-accessible controls and semantic live status.
- [ ] Add Thai/English copy and focused component tests for all state branches.

### Task 9: Build Admin Runner release panel

**Files:**
- Create: `apps/web/client/src/features/desktop-releases/RunnerReleaseAdminPanel.tsx`
- Modify: `apps/web/client/src/pages/AdminDesktopHost.tsx`
- Test: `apps/web/client/src/features/desktop-releases/__tests__/RunnerReleaseAdminPanel.test.tsx`

- [ ] Add version/platform/profile/release-notes form and manual build button.
- [ ] Show dispatch, workflow, sync, validation, publish and withdraw states;
  show repository/workflow only in admin config areas.
- [ ] Add explicit Cloudflare manifest handoff wording owned by Feature 204.
- [ ] Test admin-only rendering, failed sync, retry and no public leakage.

### Task 10: Cross-section verification and evidence

**Files:**
- Modify: `specs/feature/205-smartaihub-runner-cross-platform/implementation/section-status.md`
- Modify: `specs/feature/205-smartaihub-runner-cross-platform/implementation/completion.md`
- Modify: `specs/feature/205-smartaihub-runner-cross-platform/implementation/review.md`
- Modify: `specs/feature/205-smartaihub-runner-cross-platform/implementation/evidence.json`
- Create: `specs/feature/205-smartaihub-runner-cross-platform/reviews/release-management-audit-2026-09-18.md`

- [ ] Run focused Rust, server, UI, workflow and diff checks; do not run the
  repository-wide TypeScript check.
- [ ] Perform ten explicit audits: spec/code, workflow/publish, catalog,
  auth, update idempotency, Rust version/update, Dashboard UX, Worker
  separation, Cloudflare boundary and rollback/evidence.
- [ ] Fix all concrete gaps found and rerun affected checks.
- [ ] Record browser, native host, GitHub secret and Cloudflare target-account
  gates as unverified when the environment cannot prove them.
- [ ] Review `git diff --stat` and stage only owned paths.
