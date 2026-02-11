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
