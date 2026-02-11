# Section 03 - Library URL Policy Integration

## Objective
Apply the URL policy to all relevant write paths so unsafe URLs cannot enter library storage.

## Scope
- Integrate URL policy into `library.createItem`, `library.updateItem`, and media-to-library insertion path.
- Normalize accepted URL values before persistence.
- Return clear API errors and write audit context for rejects.

## Files to Add / Modify
- Modify: `apps/web/server/routers/library.ts`
- Modify: `apps/web/server/services/libraryService.ts`
- Modify: `apps/web/server/routers/media.ts`
- Modify: `apps/web/server/services/mediaLibraryService.ts`
- Modify: `apps/web/server/routers/library.test.ts`
- Modify: `apps/web/server/routers/media.addToLibrary.test.ts`

## TDD Stubs (Write First)
- Test: `library.createItem` rejects unsafe `sourceUrl`.
- Test: `library.updateItem` rejects unsafe `thumbnailUrl`.
- Test: valid external `https://` URLs still accepted.
- Test: media add-to-library path rejects policy violations.
- Test: reject response maps to stable client-safe message.

## Implementation Tasks
1. Add policy invocation at route/service boundaries.
2. Map reject reasons to `TRPCError`/BAD_REQUEST payloads.
3. Ensure successful paths persist normalized URLs.
4. Add audit log fields for reject reason (no sensitive URL leakage).

## Acceptance Criteria
- All relevant mutation paths enforce policy.
- Existing valid workflows keep working.
- Tests cover both allow and deny cases.

## Notes / Risks
- Keep error text stable enough for frontend UX handling.
- Avoid duplicate validation logic between route and service layers.

## As-Built Update
- Actual files changed:
  - `apps/web/server/services/libraryService.ts`
  - `apps/web/server/routers/library.ts`
  - `apps/web/server/routers/media.ts`
  - `apps/web/server/services/libraryService.test.ts`
  - `apps/web/server/services/mediaLibraryService.test.ts`
  - `apps/web/server/routers/library.test.ts`
  - `apps/web/server/routers/media.addToLibrary.test.ts`
- Deviations from plan:
  - Policy validation is centralized in `libraryService` and enforced for media add-to-library through shared service usage; `mediaLibraryService.ts` itself did not require code changes.
- Tests added/updated:
  - `apps/web/server/services/libraryService.test.ts`
  - `apps/web/server/services/mediaLibraryService.test.ts`
  - `apps/web/server/routers/library.test.ts`
  - `apps/web/server/routers/media.addToLibrary.test.ts`
- Test run:
  - `bash -lc 'export NVM_DIR="$HOME/.nvm" && [ -s "$NVM_DIR/nvm.sh" ] && source "$NVM_DIR/nvm.sh" && cd /home/dev/projects/SmartSpecPro/apps/web && npm test -- server/services/libraryUrlPolicy.test.ts server/services/libraryService.test.ts server/services/mediaLibraryService.test.ts server/routers/library.test.ts server/routers/media.addToLibrary.test.ts'`
  - Result: pass (43/43)
- Follow-ups:
  - Consider mapping `reason` codes into audit payloads in mutation paths for stronger security analytics.
