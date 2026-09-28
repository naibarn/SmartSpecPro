# Implementation Plan

## Objective

Make Presentation Builder image/video output durable on R2 before persistence/display, fix the server runtime error boundary, and process media slots sequentially with truthful text-only recovery states.

## Work packages

### 1. Durable presentation media service

- Add a server-only presentation media asset service with managed URL detection, scoped R2 keys, streamed provider download, MIME/size limits, idempotent task identity, and cleanup.
- Accept completed `MediaTask` output and return a task projection with a managed `resultUrl`.
- Reject new image/video completion persistence when R2 is inactive; never fall back to provider URLs.

### 2. Presentation generation and pending-task integration

- Route `generateFullSlideMediaAssetForRelayout`, `generateAIDraft`, and `resolvePendingMediaForDeck` through the shared task poll/durability boundary.
- Make `pollMediaTask` return a durable URL for image/video callers while leaving audio behavior unchanged.
- Set the media batch concurrency to one (or a validated presentation-specific setting) so provider jobs are not all submitted at once.
- Preserve `pendingMediaJobs` and per-slot failure metadata when a task fails or its provider URL is expired.

### 3. Runtime and UI error handling

- Replace any presentation server path logic that relies on implicit CommonJS globals with ESM-safe path resolution.
- Normalize `__dirname is not defined` and similar errors at the router/service boundary so the builder receives a useful message.
- Add text-only slot state and retry/regenerate copy in the builder for failed, expired, unavailable, and uploading states. Keep the existing Thai/English localization pattern.

### 4. Legacy backfill and verification

- Add a dry-run-by-default presentation media backfill command for reachable provider URLs in saved slide content/jobs.
- Add focused unit/service/router/client tests for R2-only completion, idempotency, expired output, sequential scheduling, and error rendering.

## Acceptance criteria

- No newly completed Presentation Builder image/video is persisted or returned as a provider URL.
- R2-managed URLs render in the editor and survive provider-link expiration.
- A batch processes one media slot at a time and keeps successful slots when another fails.
- `__dirname is not defined` no longer appears for the Presentation Builder flow.
- Expired/unreachable legacy media is represented by a clear text-only slot with recovery action.
- Focused tests pass and `git diff --check` is clean for owned changes.

## Rollout

Deploy code first, run backfill dry-run, inspect counts, then run `--apply` only in an environment with `DATABASE_URL` and active R2 configuration. Do not modify unrelated dirty files.
