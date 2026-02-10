# Code Review - Section 06 (Media Add-to-Library)

## Scope Reviewed

- `apps/web/server/services/mediaLibraryService.ts`
- `apps/web/server/services/mediaLibraryService.test.ts`
- `apps/web/server/routers/media.ts`
- `apps/web/server/routers/media.addToLibrary.test.ts`
- `apps/web/server/services/libraryService.ts` (enqueue helper additions)

## Findings

1. `MEDIUM`: Unauthorized task promotion risk if task ownership check is omitted.
- Mitigation applied: service validates task owner/admin before ingestion.

2. `LOW`: Duplicate library items risk on repeated add requests.
- Mitigation applied: source-link idempotency + active-job reuse for enqueue path.

3. `LOW`: Implicit ingestion safety risk without rollout gate.
- Mitigation applied: auto-add helper gated behind `MEDIA_LIBRARY_AUTO_ADD_ENABLED`.

## Test Coverage Added

- add-to-library success + idempotent repeat
- rejection for non-completed and unauthorized tasks
- auto-add disabled behavior
- router-level tenant-context validation

## Residual Risks

- Auto-add helper is not yet wired to real completion event flow.
- End-to-end integration test with live Python task fetch and DB fixtures remains pending.
