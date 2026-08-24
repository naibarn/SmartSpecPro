# Task

Diagnose the reported tRPC failure for `verticalDramaEpisodes.getEpisodeCoverStatus` (ticket #422, user #24).

## Task Classification
- Scope: medium
- Risk: medium
- Affected domains: Backend tRPC, Vertical Drama data/storage, runtime/audit evidence
- Estimated file count: 4-8 read-only candidates; no edits authorized by the request
- Chosen route: direct-inline-waves / data-first-debug
- Bug route: true
- Dispatch preference: inline-standard-light
- Classification notes: This is an error-log investigation with a trace ID and a named route, but the authoritative failure may cross router, cover JSON parsing, storage lookup, and audit logging. The request asks for diagnosis only, so no implementation wave is planned.

## Evidence Ledger

source: ui-screenshot
identifier: traceId `ad5OgMuHcSFyj6zXJ0Txk`, ticket `422`, user `24`, time `2026-08-24 10:14:04 +07:00`
observed failure: tRPC `verticalDramaEpisodes.getEpisodeCoverStatus` returned `INTERNAL_SERVER_ERROR`; UI rendered `UnknownError`; one occurrence
data state: feedback ticket #422 contains an AWS SDK S3 protocol stack; audit at `2026-08-24T03:14:04.424Z` shows task `2f89fe49-0f3e-493b-afdf-7044bb4043d8` completed with a provider result URL for series 23 / episode 167; local DB has ready asset 4139 and episode cover slot 2 persisted
confidence: high for the failing boundary (R2 `HeadObject`), medium-high for the exact duplicate-ingest call site because the runtime log lacks operation-level instrumentation
next evidence needed: deployed-runtime retry/HeadObject metrics if exact R2 response code and transient cause must be proven

## Root-Cause Finding

`getUnifiedMediaTask()` now durabilizes completed Vertical Drama tasks and rewrites `task.resultUrl` to a managed `/api/storage/files/...` URL. The same procedure then calls `ingestVerticalDramaMediaAsset()` again. Its managed-URL branch performs an uncaught `storageExists()` check, which maps to S3 `HeadObject`; any R2 protocol/transport error other than 404 escapes as `INTERNAL_SERVER_ERROR`. This matches ticket #422's AWS SDK stack and the completed provider task. The generated cover was eventually persisted as asset 4139, so this incident is a settle/status read-path failure, not a failed generation or credit failure.

Relevant code path:
- `apps/web/server/routers/verticalDramaEpisodes.ts:15948-16061` — poll, then duplicate durable-ingest on completed result
- `apps/web/server/services/mediaTaskPollingService.ts:48-75` — already durabilizes Vertical Drama result before returning task
- `apps/web/server/services/verticalDramaMediaAssetService.ts:488-540` — managed URL path calls `storageExists()` without a retry/fail-soft boundary
- `apps/web/server/storage.ts:310-325` — S3 `HeadObject`, only 404 is converted to `false`
- `apps/web/server/services/verticalDramaEpisodeCover.ts:119-124` — projection path already catches storage probe errors, unlike the managed ingest branch

## Scope Boundary

- Read-only diagnosis in the current worktree.
- Preserve all unrelated dirty worktree changes.
- Do not query or mutate production data/services without an explicit live-access path and authorization.
- Do not infer the affected series/episode from the email or user ID alone.
