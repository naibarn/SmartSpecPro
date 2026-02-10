# Section 06 - Media Add-to-Library

## Objective

Integrate media task assets into the library domain via explicit Add-to-Library APIs and optional auto-add hooks.

## Scope

- Add-to-library endpoint for media tasks.
- Item + source-link creation from media task metadata.
- Index-job enqueue integration.
- Duplicate detection and idempotency.

## Primary Files

- `apps/web/server/routers/media.ts`
- `apps/web/server/routers/` (new library endpoints)
- `apps/web/server/services/` (media-to-library mapping helpers)

## Implementation Steps

1. Add `POST /api/media/tasks/:id/add-to-library` handler.
2. Map media task fields to `library_items` canonical schema.
3. Create `library_links` rows for source traceability.
4. Enqueue `library_index_jobs` for async indexing.
5. Add optional auto-add hook gated by feature flag/config.
6. Return status payload indicating existing/newly-added/index-state.

## Test-First Checklist

- Test: add-to-library on completed task creates item + link + index job.
- Test: repeated add-to-library for same task is idempotent.
- Test: non-completed or unauthorized tasks are rejected.
- Test: auto-add flag OFF prevents implicit ingestion.

## Verification

- Run API and service integration tests for media-to-library flow.

## Exit Criteria

- Media tasks can be reliably promoted to library items without duplicates.
