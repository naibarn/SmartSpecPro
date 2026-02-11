# Security Release Gate Checklist (2026-02-11)

## 1) Regression Test Gate (Must Pass)
- [ ] URL policy + migration safety
  - Command: `bash -lc 'cd apps/web && npm test -- server/services/libraryUrlPolicy.test.ts server/services/libraryUrlMigrationService.test.ts'`
- [ ] Library write-path enforcement + media add-to-library
  - Command: `bash -lc 'cd apps/web && npm test -- server/services/libraryService.test.ts server/services/mediaLibraryService.test.ts server/routers/library.test.ts server/routers/media.addToLibrary.test.ts'`
- [ ] Active-content upload hardening
  - Command: `bash -lc 'cd apps/web && npm test -- server/services/uploadContentSafety.test.ts'`
- [ ] Tenant allowlist fail-closed
  - Command: `bash -lc 'cd apps/web && npm test -- server/services/libraryFeatureFlags.test.ts'`
- [ ] Library ops tenant scope (phase 1 + phase 2)
  - Command: `bash -lc 'cd apps/web && npm test -- server/services/libraryOpsService.test.ts server/routers/libraryOps.test.ts server/services/libraryOpsTenantAttributionService.test.ts'`
- [ ] Office preview and image proxy hardening
  - Command: `bash -lc 'cd apps/web && npm test -- client/src/lib/previewHostSafety.test.ts server/services/imageProxySafety.test.ts'`
- [ ] Section-10 compatibility smoke
  - Command: `bash -lc 'cd apps/web && npm test -- server/services/securityRegressionReleaseGate.test.ts client/src/lib/securityCompatibility.test.ts'`

## 2) Compatibility Gate (Must Pass)
- [ ] External `https://` image URLs still preview in document workflows.
- [ ] Markdown documents still open/edit/save.
- [ ] Office files on public hosts still render through Office viewer.
- [ ] Existing media add-to-library flow still succeeds for completed tasks.

## 3) Migration + Backfill Gate (Must Pass)
- [ ] `library_items` URL policy migration verified (normalized/blocked rows reviewed).
- [ ] Callback tenant attribution migration applied (`0021_callback_tenant_attribution.sql`).
- [ ] Callback backfill dry-run report reviewed.
- [ ] Callback backfill apply report reviewed.
- [ ] Unresolved callback rows reviewed and accepted/quarantined with owner sign-off.

## 4) Ops/Security Gate (Must Pass)
- [ ] Private/local URL targets blocked for office-preview and image-proxy paths.
- [ ] Active-content uploads are served as attachment with restrictive headers.
- [ ] Tenant-scoped library ops cannot mutate cross-tenant callback rows.
- [ ] Global library ops are explicitly role-gated and audited.

## 5) Release Decision
- [ ] APPROVE release
- [ ] BLOCK release (attach reason + owner)

## Sign-off
- Release owner:
- Security reviewer:
- Date/time:
- Notes:
