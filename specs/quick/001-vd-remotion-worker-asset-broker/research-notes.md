# Research Notes

## Evidence

1. `packages/remotion-render/src/renderVideoJob.ts` fetches each HTTP(S) asset manifest source during `stage_assets`; a non-2xx response becomes `asset_stage_failed`.
2. `apps/web/server/_core/index.ts` protects `/api/storage/files/*` with tenant/user authorization and intentionally returns `404` when authorization or the object is unavailable.
3. `apps/web/server/services/verticalDramaRemotionRender.ts` already stages assets server-side, but `submitVdRemotionAssembly` and `submitVdProductionEpisodeAssembly` send absolute browser storage URLs directly in the worker template/manifest.
4. `submitVdEpisodePreview` already resolves worker URLs through `resolveExternalMediaReferenceUrls`, proving the intended pattern.
5. `resolveExternalMediaReferenceUrls` converts managed storage references into `/api/mcp/downloads/<ref>/<filename>` URLs, preserves extensions, checks `{ tenantId, userId }`, and uses the provider-only 60-minute grant.
6. `apps/web/server/routers/verticalDramaEpisodes.ts` passes `tenantId`, `requestedByUserId`, and a public URL into the assembly submission, so the required actor context is available.

## Worktree risk

The target implementation and test files already contain unrelated user changes. Edits must be limited to the new worker URL resolution logic and adjacent regression tests.

## Proof boundary

Focused Vitest and syntax/diff checks are in scope. Authenticated browser, real worker, provider, deployment, and production storage checks remain separate evidence and are not implied by unit tests.
