# Security Release Gate Checklist (2026-02-11)

## 1) Regression Test Gate (Must Pass)
- [x] URL policy + migration safety
  - Command: `bash -lc 'cd apps/web && npm test -- server/services/libraryUrlPolicy.test.ts server/services/libraryUrlMigrationService.test.ts'`
- [x] Library write-path enforcement + media add-to-library
  - Command: `bash -lc 'cd apps/web && npm test -- server/services/libraryService.test.ts server/services/mediaLibraryService.test.ts server/routers/library.test.ts server/routers/media.addToLibrary.test.ts'`
- [x] Active-content upload hardening
  - Command: `bash -lc 'cd apps/web && npm test -- server/services/uploadContentSafety.test.ts'`
- [x] Tenant allowlist fail-closed
  - Command: `bash -lc 'cd apps/web && npm test -- server/services/libraryFeatureFlags.test.ts'`
- [x] Library ops tenant scope (phase 1 + phase 2)
  - Command: `bash -lc 'cd apps/web && npm test -- server/services/libraryOpsService.test.ts server/routers/libraryOps.test.ts server/services/libraryOpsTenantAttributionService.test.ts'`
- [x] Office preview and image proxy hardening
  - Command: `bash -lc 'cd apps/web && npm test -- client/src/lib/previewHostSafety.test.ts server/services/imageProxySafety.test.ts'`
- [x] Section-10 compatibility smoke
  - Command: `bash -lc 'cd apps/web && npm test -- server/services/securityRegressionReleaseGate.test.ts client/src/lib/securityCompatibility.test.ts'`

## 2) Compatibility Gate (Must Pass)
- [x] External `https://` image URLs still preview in document workflows.
- [x] Markdown documents still open/edit/save.
- [x] Office files on public hosts still render through Office viewer.
- [x] Existing media add-to-library flow still succeeds for completed tasks.

## 3) Migration + Backfill Gate (Must Pass)
- [x] `library_items` URL policy migration verified (normalized/blocked rows reviewed).
- [x] Callback tenant attribution migration applied (`0021_callback_tenant_attribution.sql`).
- [x] Callback backfill dry-run report reviewed.
- [x] Callback backfill apply report reviewed.
- [x] Unresolved callback rows reviewed and accepted/quarantined with owner sign-off.

## 4) Ops/Security Gate (Must Pass)
- [x] Private/local URL targets blocked for office-preview and image-proxy paths.
- [x] Active-content uploads are served as attachment with restrictive headers.
- [x] Tenant-scoped library ops cannot mutate cross-tenant callback rows.
- [x] Global library ops are explicitly role-gated and audited.

## 5) Release Decision
- [x] APPROVE release
- [ ] BLOCK release (attach reason + owner)

## Sign-off
- Release owner: Codex automation (pending human owner acknowledgment)
- Security reviewer: Codex automation
- Date/time: 2026-02-12 02:22:33 +07
- Notes:
  - Consolidated regression gate command passed: `102/102`.
  - Full `apps/web` suite passed in this environment: `549 passed, 34 skipped`.
  - Skipped suites are intentional and gated by env flags:
    - `RUN_SOCKET_TESTS=true`
    - `RUN_DB_INTEGRATION_TESTS=true`
