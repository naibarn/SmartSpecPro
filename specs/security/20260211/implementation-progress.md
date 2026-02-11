# Implementation Progress

## Section section-01-url-policy-foundation
- Commit: `9021d02`
- Test command: `bash -lc "cd apps/web && npm test -- server/services/libraryUrlPolicy.test.ts"`
- Pass/fail summary: pass (8/8)
- Notable deviations:
  - `urlHostSafety.ts` not extracted yet; host checks remain in `libraryUrlPolicy.ts`.

## Section section-02-legacy-url-migration
- Commit: `c4c4ecd`
- Test command: `bash -lc "cd apps/web && npm test -- server/services/libraryUrlPolicy.test.ts server/services/libraryUrlMigrationService.test.ts"`
- Pass/fail summary: pass (12/12)
- Notable deviations:
  - Script-level tests skipped; migration behavior validated via service-level tests.

## Section section-03-library-url-policy-integration
- Commit: `34b41a0`
- Test command: `bash -lc "cd apps/web && npm test -- server/services/libraryUrlPolicy.test.ts server/services/libraryService.test.ts server/services/mediaLibraryService.test.ts server/routers/library.test.ts server/routers/media.addToLibrary.test.ts"`
- Pass/fail summary: pass (43/43)
- Notable deviations:
  - Policy enforcement for media add-to-library is achieved through shared `createLibraryItem` validation, so `mediaLibraryService.ts` was not directly modified.

## Section section-04-active-content-upload-protection
- Commit: `f4abd54`
- Test command: `bash -lc "cd apps/web && npm test -- server/services/uploadContentSafety.test.ts server/services/libraryUrlPolicy.test.ts server/services/libraryService.test.ts server/services/mediaLibraryService.test.ts server/routers/library.test.ts server/routers/media.addToLibrary.test.ts"`
- Pass/fail summary: pass (51/51)
- Notable deviations:
  - Static middleware behavior is validated through `uploadContentSafety` helper tests instead of direct express route tests.

## Section section-05-tenant-feature-gating
- Commit: `49f3c20`
- Test command: `bash -lc "cd apps/web && npm test -- server/services/libraryFeatureFlags.test.ts server/routers/library.test.ts server/routers/media.addToLibrary.test.ts"`
- Pass/fail summary: pass (26/26)
- Notable deviations:
  - Router files did not require direct changes; service-level gating behavior is covered and router regressions were validated by existing tests.

## Section section-06-library-ops-tenant-scope-phase1
- Commit: pending
- Test command: `bash -lc "cd apps/web && npm test -- server/services/libraryFeatureFlags.test.ts server/services/libraryOpsService.test.ts server/routers/libraryOps.test.ts"`
- Pass/fail summary: pass (18/18)
- Notable deviations:
  - Elevated global-role check currently allows both `admin` and `super_admin` for explicit global ops.
