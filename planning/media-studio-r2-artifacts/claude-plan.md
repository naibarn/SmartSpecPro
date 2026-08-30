# Implementation Plan: Media Studio R2 Artifact Durability

## Outcome

Every Media Studio generated image, video, and audio output has a durable R2-backed artifact projection. Media History uses R2 for playback/download, preserves the original provider URL and its health state, and clearly tells the user when neither source is viewable.

## Contract

Introduce normalized artifact fields on the shared `MediaTask` projection:

- `artifactId`, `outputIndex`, `r2Url`, `r2StorageKey`, `r2Status`
- `providerOriginalUrl`, `providerStatus`, `providerCheckedAt`
- `playbackUrl`, `fallbackUrl`, `availabilityStatus`, `availabilityReason`

Status values are stable strings: `pending`, `ready`, `failed`, `missing`, `available`, `expired`, `unavailable`, `storage_pending`, `provider_fallback`, `provider_expired`, and `r2_missing`. Keep `resultUrl` backward compatible as the selected playback URL for older callers, but make new Media Studio code use `playbackUrl`.

## Wave 1 — Schema and shared artifact service

Add `mediaTaskArtifacts` to `apps/web/drizzle/schema.ts` and an idempotent Drizzle migration. Fields include source kind/task ID/output index, tenant/user, media type, provider/model, provider URL/status/check time/error, media asset ID, R2 key/status/error, retry metadata, timestamps, and unique/indexed ownership/task constraints. Add the corresponding SQL migration without touching existing unrelated journal files.

Create `apps/web/server/services/mediaTaskArtifactService.ts`. Reuse the Vertical Drama download/storage patterns through a shared helper or carefully bounded import, but do not alter the user's concurrent Vertical Drama edits. The service must extract multiple output URLs, validate redirects with the existing SSRF validator, enforce image/video/audio size limits, infer MIME/extensions, upload using `storagePutFromPath`, register `mediaAssets` with tenant/user, and reconcile duplicate races. It must never log raw URLs.

Provide functions for `ensureTaskArtifactsDurable`, `projectTaskArtifact`, `checkProviderAvailability`, and bounded `backfillTaskArtifacts`. Existing managed `/api/storage/files` URLs must be owner-verified and registered without downloading; external URLs must be downloaded once and copied to R2.

## Wave 2 — Transport and history integration

Update `mediaTaskPollingService.ts` so completed tasks from every source pass through the artifact service, not only Vertical Drama-tagged tasks. Keep existing Vertical Drama and marketplace domain adapters intact, and merge the artifact projection after each adapter. For MCP/Hermes, use their existing tenant/user-owned IDs and result data as source identity.

Update the task list composition in `apps/web/server/routers/media.ts` to return persisted artifact projections without downloading on every list call. Ensure all source list/read paths include both tenant and user ownership. Add an explicit retry/fetch-result path for a pending artifact if the current task is completed but R2 ingest failed.

Keep Python `media_tasks.result_url` as the provider source of truth for legacy compatibility. Do not require a Python schema change unless the focused implementation proves Node cannot persist source identity safely; the Node ledger is the canonical cross-transport registry.

## Wave 3 — Historical backfill

Add `apps/web/scripts/backfill-media-task-artifacts.ts` and an npm script. It scans supported task sources in bounded pages, supports dry-run/source/time/limit/cursor options, writes a resumable checkpoint, and records per-row outcomes. It must quarantine missing-tenant rows, skip non-completed rows, preserve provider URLs, and be safe to rerun after partial failure.

Use the same service as live completion so backfill and new tasks cannot diverge. Do not delete tasks or provider records. Backfill must distinguish provider expiry from transient failure and must not automatically regenerate paid media.

## Wave 4 — Media History UI

Extend `MediaHistoryTaskLite` and the history card/preview helpers in `MediaStudio.tsx` to prefer the artifact projection. Add localized Thai/English labels for saving, R2 ready, provider fallback, provider expired, and R2 missing. Use R2 `playbackUrl` for image/video/audio elements; only use `fallbackUrl` when status explicitly permits it and show a warning. Never render the original provider URL as the normal source when R2 is ready.

The UI contract covers desktop and narrow mobile history cards, loading/empty/error/success states, keyboard-accessible retry/details controls, visible status text and icon semantics, and no autoplay or layout shift regressions. Browser verification should confirm R2-first source selection and expired-state copy; authenticated browser/R2 proof is separate from unit tests.

## Wave 5 — Tests and gates

Add focused tests for artifact URL extraction, MIME/size/redirect safety, owner isolation, idempotency, provider status classification, storage failure, missing R2 object, list projection, all transport adapters, backfill checkpoint behavior, and Media Studio rendering/status selection. Run migration/static checks, focused Vitest suites, Python tests for any changed Python boundary, `git diff --check`, and the existing storage cache/range tests.

## Risks and mitigations

- Provider result formats vary: retain the existing recursive extractor and add fixtures for image/video/audio arrays.
- Multiple outputs can race: unique source/output constraints plus read-after-conflict.
- List latency can regress: list only reads ledger rows; download occurs on completion/backfill.
- Tenant leakage: every ledger query and storage registration includes tenant and user predicates; missing identity fails closed.
- Existing dirty edits: avoid broad formatting and inspect changed hunks before each edit.
- R2 not configured in test environments: mock the storage adapter and keep production fail-closed.

## Acceptance criteria

1. New image/video/audio tasks return R2-first artifact projections across all supported transports.
2. Provider URL remains stored and is classified without exposing secrets.
3. Historical completed tasks can be backfilled safely and resumed.
4. Tenant A/user A cannot resolve or stream tenant B/user B artifacts.
5. Expired provider links are visibly marked and not silently treated as playable.
6. R2 playback uses protected cache-aware URLs and video Range requests remain functional.
7. Focused proof passes, with unperformed live/deployment/browser/target-DB checks explicitly reported.
