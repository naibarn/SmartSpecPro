# Section 07 - Media Studio and History UI

## Objective

Deliver user-facing Add-to-Library and Search Library experiences in Media Studio and Media History.

## Implemented Scope

- Added shared Library UI utility helpers for:
  - add eligibility checks
  - mutation result -> UI state mapping
  - status badge mapping (`indexing|ready|failed`)
  - toast messages and search-result selection helper
- Added reusable Media Studio search panel:
  - query input, loading/error/empty states
  - result list with index-status badges and select callback
- Added Add-to-Library flow in Media Studio History Gallery:
  - action button on eligible completed tasks only
  - optimistic state (`adding`) with polling refresh to server-confirmed item status
  - persistent per-task library status badges after refetch
- Added Add-to-Library flow in Media History table + details dialog:
  - action button for eligible completed tasks
  - dedicated `Library` status column (`Not Added|Indexing|Ready|Failed`)
  - already-added indication retained after list refetch

## Actual Files Added

- `apps/web/client/src/lib/libraryUi.ts`
- `apps/web/client/src/lib/libraryUi.test.ts`
- `apps/web/client/src/components/media/LibrarySearchPanel.tsx`
- `apps/web/client/src/components/media/LibrarySearchPanel.test.ts`
- `specs/reviews/section-07-review.md`
- `specs/reviews/section-07-interview.md`

## Actual Files Modified

- `apps/web/client/src/pages/MediaStudio.tsx`
- `apps/web/client/src/pages/MediaHistory.tsx`

## Tests Added (TDD)

- `libraryUi` helper tests:
  - eligibility only for completed tasks with result URLs
  - success/error state + toast message mapping
  - status metadata mapping
  - search selection callback behavior
- `LibrarySearchPanel` tests:
  - empty-query helper state
  - result rendering with indexing/failed status labels

Run command used:
- `npm run -w @smartspec/web test -- client/src/lib/libraryUi.test.ts client/src/components/media/LibrarySearchPanel.test.ts server/services/libraryService.test.ts server/services/librarySearchService.test.ts server/services/mediaLibraryService.test.ts server/routers/library.test.ts server/routers/media.addToLibrary.test.ts`

Result:
- `27 passed`

## Verification

- `npm run -w @smartspec/web build` passed.

## Deviations from Initial Plan

1. Library readiness in history views is tracked via local per-task state + `library.getItem` polling for known `itemId`.
- Rationale: current media task list API does not expose direct library linkage for pre-existing records.

2. Search panel select action highlights and previews library item rather than attaching into generation payload.
- Rationale: explicit attach contract is planned in later chat/library integration sections.
