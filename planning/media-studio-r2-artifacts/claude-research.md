# Research Notes

## Research decision

- Codebase research: yes. This is an existing git repository with Node/TypeScript, Python/FastAPI, Drizzle, PostgreSQL, R2/S3 storage, and Vitest/pytest tests.
- Web research: skipped. The implementation must follow repository-local storage, auth, tenant, provider, and cache contracts; no unstable external API behavior is required to choose the architecture.
- SocratiCode: unavailable in this session. Targeted `rg` and line-range reads were used instead and this fallback must be reported.

## Current architecture findings

- `apps/web/server/services/mediaGenerationService.ts` maps Python `media_tasks` to `MediaTask`, currently exposing one `resultUrl` from `result_url` or nested `result_data`.
- `apps/web/server/services/mediaTaskPollingService.ts` is the shared polling boundary. It currently durabilizes only Vertical Drama-tagged tasks and marketplace review tasks.
- `apps/web/server/routers/media.ts` merges Python provider tasks, deferred retries, MCP tasks, Hermes tasks, and HyperFrames projections in `listTasks`; tenant/user checks already exist in several source adapters but the result projection is not artifact-aware.
- `apps/web/drizzle/schema.ts` has `mediaAssets` with tenant/user ownership and protected storage keys, while `media_tasks` remains a Python-owned table with `result_url` and JSON `result_data`.
- `apps/web/server/services/verticalDramaMediaAssetService.ts` is the closest working R2 ingest example: validated redirects, byte limits, MIME inference, checksum/idempotency, R2 upload, and owner-scoped `media_assets` registration. Existing dirty-worktree edits in this file must be preserved and not overwritten.
- `apps/web/server/storage.ts` returns protected `/api/storage/files/...` URLs and supports `storageHeadFile`, ETag, conditional requests, and Range streaming. Authorization must remain before cache validation.
- `apps/web/client/src/pages/MediaStudio.tsx` polls `media.listTasks` and has a large `extractTaskResultUrl` fallback that prefers provider/nested URLs. It needs a normalized artifact projection and explicit states instead of URL guessing.

## Security findings

- Provider URLs can be signed/temporary and must not be logged with query strings.
- Provider downloads must validate every redirect and enforce media-type byte limits before R2 upload.
- Artifact lookup, ingest, and storage serving must require both tenant ID and user ID; legacy rows with no tenant must be quarantined rather than assigned a default.
- Provider URLs are not suitable as protected-media browser URLs. R2 playback must use the authenticated storage proxy.

## Performance findings

- Do not download all History rows inside `listTasks`; ingest belongs on completion polling and a bounded backfill worker/command.
- Idempotent artifact rows and existing-object checks prevent repeated provider downloads.
- Protected R2 delivery already supports browser revalidation and video Range requests; preserve those semantics.

## Testing findings

- Web tests use Vitest via `npm --prefix apps/web run test -- <paths>` or `npm --prefix apps/web test -- <paths>` with a test JWT when needed.
- Python tests use pytest under `python-backend/tests`, with focused files for media task/callback/storage services.
- Full TypeScript check is known to be baseline-noisy; use focused suites and report full-check diagnostics separately.
