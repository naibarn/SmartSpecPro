# Worker App Content Protection Optional Windows Runtime Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish Content Protection as an optional Windows x64 runtime that users install from Worker App after the main installer, without increasing the main Worker App installer size.

**Architecture:** The main Tauri installer contains no VideoSeal provider or model. A Windows-host release job creates a separately signed Content Protection ZIP, publishes it through the existing Worker Runtime release policy with a dedicated runtime ID, and the Worker App downloads and atomically installs it under AppData. Rust discovers only an explicit operator override or a validated AppData runtime, then reuses the installed Worker runtime pack's FFmpeg/FFprobe.

**Tech Stack:** Rust/Tauri 2, React/TypeScript, Node.js release scripts, Python/PyInstaller, VideoSeal, existing Worker Runtime release APIs, Vitest, Node test runner, and Cargo tests.

**Spec:** `docs/portable-skill-pack/specs/2026-09-20-worker-app-content-protection-installer-design.md`

## Global Constraints

- The main Windows and macOS Worker App installers must not contain Content Protection provider files or checkpoints.
- The optional artifact target is `content-protection-windows-x64` and must be built on a Windows x64 host.
- Do not require end users to install Python, set environment variables, or run a shell script.
- Do not advertise `content-protection-v1` unless the provider executable, model, installed Worker runtime FFmpeg/FFprobe, checksum, signature, and provider health check all pass.
- Preserve an already active optional runtime when a later download, extraction, validation, or update fails.
- Preserve explicit operator provider configuration; automatic discovery must never overwrite it.
- Keep generated provider runtime, model checkpoints, archives, and signing secrets out of git.
- Do not run repository-wide TypeScript typecheck.

## Review Focus

- Main installer size and resource manifest: Tauri resources must not contain Content Protection files; covered by Tauri config and release-script tests.
- Unauthenticated or tampered archive: manifest policy, SHA-256, signature, and extraction path must be checked before activation; covered by server and Rust tests.
- Update failure with an existing active version: old runtime remains selected and capability state is unchanged; covered by atomic install tests.
- Missing Worker runtime pack: Content Protection stays blocked and does not download a duplicate FFmpeg; covered by readiness tests.
- Explicit provider override: optional install/discovery must not replace configured provider command; covered by Rust tests.
- Windows install paths containing spaces and provider `.exe` execution: install, health check, and job command construction must work without shell interpolation; covered by Windows-targeted command tests.

## File and interface map

- `apps/worker-app/content-protection/`: provider source and local-development documentation only; no generated release output.
- `apps/worker-app/scripts/package-content-protection-runtime.mjs`: Windows-host artifact builder and archive validation.
- `apps/worker-app/src-tauri/src/content_protection_runtime.rs`: manifest model, AppData paths, archive verification, atomic install, status, and discovery helpers.
- `apps/worker-app/src-tauri/src/commands.rs`: Tauri command adapters for status/check/install/repair.
- `apps/worker-app/src-tauri/src/worker_executor.rs`: capability readiness and provider environment resolution using the validated AppData runtime.
- `apps/worker-app/src-tauri/src/lib.rs`: module registration, setup discovery, and command registration.
- `apps/worker-app/src-tauri/tauri.conf.json`: keep only the normal Worker resources; remove Content Protection resource mapping.
- `apps/worker-app/src/main.tsx`: integrate the optional runtime card with the existing Runtime & agents state and install lifecycle.
- `apps/worker-app/src/screens/ContentProtectionRuntimeCard.tsx`: status/install/update/repair UI isolated from the large app shell.
- `apps/worker-app/src/screens/__tests__/ContentProtectionRuntimeCard.test.tsx`: UI state and command wiring tests.
- `apps/worker-app/src-tauri/tests/content_protection_runtime_tests.rs`: manifest, path, checksum, extraction, atomic swap, and readiness tests.
- `apps/web/shared/workerRuntimeReleases.ts`: add the `content-protection-windows-x64` runtime ID and Content Protection manifest contract.
- `apps/web/server/routes/workerRuntime.ts`: serve latest Content Protection manifest and authenticated archive download through the Worker runtime boundary.
- `apps/web/server/routes/workerRuntimeReleases.ts`: allow admin catalog upload/import/publish for the dedicated runtime ID with Content Protection validation.
- `apps/web/server/services/workerRuntimeReleaseService.ts`: implement Content Protection manifest validation without applying HyperFrames-specific checks.
- `apps/web/server/routes/__tests__/workerRuntime.test.ts` and `apps/web/server/routes/__tests__/workerRuntimeReleases.test.ts`: endpoint, policy, and validation coverage.
- `apps/worker-app/scripts/__tests__/packageContentProtectionRuntime.test.mjs`: archive manifest and release packaging checks without downloading the real model.
- `.github/workflows/worker-app-windows-content-protection-runtime.yml`: Windows x64 artifact build, smoke test, signing, and artifact publication.
- `apps/worker-app/scripts/package-windows-release.mjs` and `apps/worker-app/scripts/package-macos-release.mjs`: explicitly omit Content Protection packaging.
- `apps/worker-app/content-protection/README.md`: document local development and the optional in-app installation flow.

### Task 1: Freeze the optional runtime contract and remove main-installer bundling

**Files:**
- Modify: `apps/web/shared/workerRuntimeReleases.ts`
- Modify: `apps/worker-app/src-tauri/tauri.conf.json`
- Modify: `apps/worker-app/scripts/package-windows-release.mjs`
- Modify: `apps/worker-app/scripts/package-macos-release.mjs`
- Modify: `apps/worker-app/package.json`
- Modify: `.gitignore`
- Test: `apps/worker-app/scripts/__tests__/packageContentProtectionRuntime.test.mjs`

**Interfaces:**
- Produces runtime ID `content-protection-windows-x64`.
- Produces archive manifest fields `contractVersion`, `runtimeId`, `version`, `targetPlatform`, `provider`, `providerCommand`, `modelPath`, `videoSealCommit`, `requiresWorkerRuntimeVersion`, and per-file `files` checksums; the server release manifest carries archive SHA-256 and signature metadata.
- Produces archive naming contract `smart-ai-hub-content-protection-runtime-windows-x64-{version}.zip`.

- [ ] **Step 1: Write failing contract tests** asserting the new runtime ID, archive filename, Windows target, required manifest entries, and the absence of `content-protection-runtime` in the Tauri resource map.
- [ ] **Step 2: Run the focused Node test** with `npm --workspace apps/worker-app run content-protection:test`; verify the new contract assertions fail before implementation.
- [ ] **Step 3: Implement the shared contract and main-installer boundary** by adding the runtime ID/manifest schema, removing Content Protection from Tauri resources, and making both main release scripts skip Content Protection preparation.
- [ ] **Step 4: Run the focused contract test again** and verify the main installer configuration cannot include the optional runtime directory.
- [ ] **Step 5: Check generated-file policy** with `git check-ignore -v apps/worker-app/.content-protection-build apps/worker-app/src-tauri/resources/content-protection-runtime` and ensure release outputs are ignored rather than committed.

### Task 2: Build and validate the standalone Windows x64 artifact

**Files:**
- Create: `apps/worker-app/scripts/package-content-protection-runtime.mjs`
- Modify: `apps/worker-app/scripts/prepare-content-protection-runtime.mjs`
- Modify: `apps/worker-app/content-protection/videoseal-provider.py`
- Modify: `apps/worker-app/content-protection/README.md`
- Test: `apps/worker-app/scripts/__tests__/packageContentProtectionRuntime.test.mjs`

**Interfaces:**
- `npm --workspace apps/worker-app run content-protection:pack` builds a generated staging directory, not Tauri resources.
- `npm --workspace apps/worker-app run content-protection:release` creates the versioned Windows ZIP and manifest metadata.
- `npm --workspace apps/worker-app run content-protection:check -- --bundle-root <path>` validates the generated artifact before publication.

- [ ] **Step 1: Add failing packager tests** for Windows-only target rejection, missing executable/model/license rejection, manifest checksum mismatch, and acceptance of a valid fixture archive.
- [ ] **Step 2: Run the packager tests** with `node --test apps/worker-app/scripts/__tests__/packageContentProtectionRuntime.test.mjs`; verify the validation cases fail before implementation.
- [ ] **Step 3: Implement the packager** to build PyInstaller output on Windows x64, copy the pinned model/config/license files into a staging directory, write the manifest, calculate per-file and archive SHA-256 values, and create the exact ZIP filename.
- [ ] **Step 4: Add the provider health contract** so `videoseal-provider.exe --health` checks the pinned model and reports a machine-readable success/failure result without requiring user environment setup.
- [ ] **Step 5: Run the fixture tests and a Windows-host smoke test** that checks the provider executable is PE/MZ, the model is above the minimum size, the manifest target is `windows-x64`, and a real image/video watermark plus redecode succeeds.
- [ ] **Step 6: Update the README** with the distinction between local development setup and the in-app optional runtime installation; do not document a user-run Python setup as the production path.

### Task 3: Add server release catalog and authenticated delivery

**Files:**
- Modify: `apps/web/shared/workerRuntimeReleases.ts`
- Modify: `apps/web/server/routes/workerRuntime.ts`
- Modify: `apps/web/server/routes/workerRuntimeReleases.ts`
- Modify: `apps/web/server/services/workerRuntimeReleaseService.ts`
- Test: `apps/web/server/routes/__tests__/workerRuntime.test.ts`
- Test: `apps/web/server/routes/__tests__/workerRuntimeReleases.test.ts`

**Interfaces:**
- `GET /api/workers/runtime-pack/manifest?runtimeId=content-protection-windows-x64&channel=stable` returns the latest allowed Content Protection manifest.
- `GET /api/workers/runtime-pack/download/:fileName` streams only a published, allowed Content Protection archive.
- Existing admin upload/import/publish endpoints accept the new runtime ID and route it through the Content Protection validator.

- [ ] **Step 1: Write failing route tests** for latest-manifest response, unpublished/withdrawn release rejection, wrong platform/provider rejection, archive URL generation, and admin-only publication.
- [ ] **Step 2: Run the focused server tests** with the repository's existing web test command for the two route test files and verify the new cases fail.
- [ ] **Step 3: Implement the runtime ID and validator branch** without applying HyperFrames-only manifest requirements; require the pinned VideoSeal revision, Windows x64 target, provider executable, model, license notice, checksums, signature, and `requiresWorkerRuntimeVersion`.
- [ ] **Step 4: Implement delivery through the existing authenticated worker runtime boundary** with no new unauthenticated storage bypass and with the existing range/download behavior preserved.
- [ ] **Step 5: Run the focused route tests** and verify both admin publication policy and worker download policy pass.
- [ ] **Step 6: Verify schema impact**; reuse the existing runtime release table if it accepts the new runtime ID as data, otherwise add the smallest migration plus schema-parity test and document rollback impact.

### Task 4: Implement native AppData installation and discovery

**Files:**
- Create: `apps/worker-app/src-tauri/src/content_protection_runtime.rs`
- Modify: `apps/worker-app/src-tauri/src/commands.rs`
- Modify: `apps/worker-app/src-tauri/src/worker_executor.rs`
- Modify: `apps/worker-app/src-tauri/src/lib.rs`
- Modify: `apps/worker-app/src-tauri/tauri.conf.json`
- Test: `apps/worker-app/src-tauri/tests/content_protection_runtime_tests.rs`

**Interfaces:**
- `check_content_protection_runtime(app, state) -> ContentProtectionRuntimeStatus` reports `not_installed`, `installing`, `ready`, `blocked`, or `failed`, plus version and actionable reason.
- `install_content_protection_runtime(app, state, force) -> ContentProtectionRuntimeInstallResult` downloads, validates, atomically activates, and health-checks the optional runtime.
- `configure_content_protection_runtime(app_data_dir, runtime_pack_root)` resolves explicit override first, then validated `content-protection-runtime/current`, and returns no provider when either is invalid.

- [ ] **Step 1: Write failing Rust tests** for AppData path resolution, missing runtime, explicit override preservation, zip traversal rejection, checksum/signature failure, missing Worker FFmpeg/FFprobe, valid runtime discovery, and failed update preserving the old active directory.
- [ ] **Step 2: Run the focused Cargo tests** with `cargo test --manifest-path apps/worker-app/src-tauri/Cargo.toml content_protection_runtime`; verify the new tests fail.
- [ ] **Step 3: Implement the runtime module** with the manifest structs, path validation, bounded download retry, SHA-256/signature checks, staging extraction, provider `--health`, and atomic directory activation under AppData.
- [ ] **Step 4: Add the Tauri commands** and register them in `lib.rs`; return structured status/error values that the UI can display without parsing log strings.
- [ ] **Step 5: Change worker discovery** to remove the bundled-resource path, use the validated AppData runtime after explicit overrides, and resolve FFmpeg/FFprobe from the installed Worker runtime pack.
- [ ] **Step 6: Keep capability fail-closed** by requiring provider, model, media tools, manifest, checksum, signature, and health readiness before setting `CONTENT_PROTECTION_WORKER_CAPABILITY=true`.
- [ ] **Step 7: Run the focused Cargo suite** and verify all install/discovery tests pass, including paths with spaces and repeated install/repair calls.

### Task 5: Add the Worker App install/update/repair UI

**Files:**
- Create: `apps/worker-app/src/screens/ContentProtectionRuntimeCard.tsx`
- Create: `apps/worker-app/src/screens/__tests__/ContentProtectionRuntimeCard.test.tsx`
- Modify: `apps/worker-app/src/main.tsx` for the existing inline English/Thai Worker App copy and Runtime & agents integration

**Interfaces:**
- The card invokes `worker_app_check_content_protection_runtime` on load and after installation.
- Install and update invoke `worker_app_install_content_protection_runtime` with `force=false`; Repair invokes it with `force=true`.
- The existing Worker runtime install card remains independent; installing one must not imply that the other is installed.

- [ ] **Step 1: Write failing component tests** for not-installed, ready, blocked-by-Worker-runtime, installing, failed-with-retry, and update-available states.
- [ ] **Step 2: Run the focused Worker App UI tests** with the existing Worker App test command and verify the new card assertions fail.
- [ ] **Step 3: Implement the isolated card** with status, version, dependency message, install/update/repair/retry actions, busy-state protection, and accessible localized labels.
- [ ] **Step 4: Mount the card in Runtime & agents** without changing the existing Worker runtime installation behavior.
- [ ] **Step 5: Run the focused UI tests** and verify the card never claims ready before the native status command returns a validated state.

### Task 6: Add Windows release workflow and end-to-end gates

**Files:**
- Create: `.github/workflows/worker-app-windows-content-protection-runtime.yml`
- Modify: `.github/workflows/desktop-release.yml` only if the existing release dispatch needs an explicit optional-runtime job
- Modify: `apps/worker-app/scripts/package-windows-release.mjs`
- Test: `apps/worker-app/scripts/__tests__/packageContentProtectionRuntime.test.mjs`
- Test: `apps/worker-app/src-tauri/tests/content_protection_runtime_tests.rs`
- Test: `apps/web/server/routes/__tests__/workerRuntime.test.ts`

- [ ] **Step 1: Add a Windows x64 workflow** that installs the pinned Python, Node, Rust/Tauri and release dependencies, runs the standalone packager, performs provider health and watermark/redecode smoke tests, and uploads only the optional runtime archive plus manifest.
- [ ] **Step 2: Add publication gates** that fail when the archive is not Windows PE, the model/checksum/license is missing, the manifest is unhealth-checked, or the artifact is not signed.
- [ ] **Step 3: Verify the main Windows release path** with `npm --workspace apps/worker-app run release:windows -- --dry-run` and a config assertion that no Content Protection build step or Tauri resource is included.
- [ ] **Step 4: Run focused validation**: Node packager tests, Rust runtime tests, server route tests, Worker App card tests, `git diff --check` on owned files, and archive checksum/manifest verification.
- [ ] **Step 5: Document proof boundaries**: Linux cross-build can validate the main installer path only; Windows-host artifact, signed runtime, authenticated download, and Windows install/health proof must be reported separately.

## Completion checklist

- [ ] Main Worker App installer contains no Content Protection provider/model files.
- [ ] Separate signed Windows x64 runtime archive is buildable and publishable.
- [ ] Worker App exposes independent install/update/repair actions.
- [ ] Failed installation never destroys a working active runtime.
- [ ] Capability advertisement is fail-closed and uses installed Worker FFmpeg/FFprobe.
- [ ] Focused tests cover release validation, server policy, native install, UI states, and Windows path handling.
- [ ] Documentation distinguishes optional runtime installation from the main Worker App installation.
