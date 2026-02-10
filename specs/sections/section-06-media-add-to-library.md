# Section 06 - Media Add-to-Library

## Objective

Integrate media task assets into the library domain via explicit Add-to-Library APIs and optional auto-add hooks.

## Implemented Scope

- Added explicit media add-to-library API in media router:
  - `media.addTaskToLibrary`
- Added service-level media-to-library mapping helper:
  - task eligibility validation
  - canonical library item mapping
  - source-link traceability
  - index-job enqueue integration
- Added idempotent behavior by relying on existing library source-link dedupe path.
- Added optional auto-add helper with feature-flag gate:
  - `MEDIA_LIBRARY_AUTO_ADD_ENABLED`

## Actual Files Added

- `apps/web/server/services/mediaLibraryService.ts`
- `apps/web/server/services/mediaLibraryService.test.ts`
- `apps/web/server/routers/media.addToLibrary.test.ts`
- `specs/reviews/section-06-review.md`
- `specs/reviews/section-06-interview.md`

## Actual Files Modified

- `apps/web/server/routers/media.ts`
- `apps/web/server/services/libraryService.ts` (index-job enqueue helper)

## Key Implementation Notes

1. Add-to-library flow:
- Fetch task from Python backend using authenticated user token.
- Validate ownership/admin access and completed status.
- Map task fields (`mediaType`, `model`, `prompt`, `resultUrl`, task IDs) to `library_items` + metadata.
- Persist source linkage as `library_links(link_type=media_task, link_id=task.id)`.
- Enqueue `library_index_jobs` (`pending`) and set item status `indexing`.

2. Idempotency:
- Repeated add requests for same media task reuse existing item via link dedupe.
- Index enqueue helper reuses active pending/processing/retry job if present.

3. Auto-add feature flag:
- `autoAddMediaTaskToLibrary` short-circuits with `skipped` when `MEDIA_LIBRARY_AUTO_ADD_ENABLED` is false.

## Tests Added (TDD)

Service tests:
- completed task creates item + link + index job
- repeated add reports idempotent `created=false`
- non-completed/unauthorized task rejection
- auto-add flag OFF returns `skipped`

Router tests:
- `addTaskToLibrary` success path and actor propagation
- missing-tenant rejection

Run command used:
- `npm run -w @smartspec/web test -- server/services/libraryService.test.ts server/services/librarySearchService.test.ts server/services/mediaLibraryService.test.ts server/routers/library.test.ts server/routers/media.addToLibrary.test.ts`

Result:
- 19 passed

## Deviations from Initial Plan

1. Endpoint is exposed as tRPC procedure (`media.addTaskToLibrary`) rather than standalone REST path.
- Rationale: aligns with existing server architecture and keeps auth/context handling consistent.

2. Auto-add is implemented as service hook helper (feature-flag gated), not yet wired to callback completion trigger.
- Rationale: keeps explicit API stable now while deferring implicit ingestion orchestration to later integration section.

## Remaining Follow-ups

- Wire `autoAddMediaTaskToLibrary` to completion event path once rollout gating is finalized.
- Add integration test with real Python task endpoint + DB transaction fixtures.
