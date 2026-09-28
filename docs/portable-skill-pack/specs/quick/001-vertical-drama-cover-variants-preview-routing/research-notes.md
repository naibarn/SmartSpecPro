# Research Notes

## Runtime evidence

- Episode `140` belongs to tenant `tenant-ZCSKEM9s`, user `1`.
- Its uploaded clips are ready `media_assets` rows `2203`, `2204`, and `2205`, with storage keys under `media-jobs/assets/...`.
- Direct server-side `storageHeadFile`/`storageStreamFile` reads succeed for clip `2203`.
- The browser-facing protected storage URL returns 404 without a session, by design.
- The failed preview state records:
  `asset_stage_failed: Asset fetch failed (404)` for the protected clip URL.

## Relevant code paths

- `apps/web/shared/verticalDramaSeries/episodeCover.ts` contains prompt/reference selection and cover state projection.
- `apps/web/server/services/verticalDramaEpisodeCover.ts` resolves owned cover assets and logo references.
- `apps/web/server/routers/verticalDramaEpisodes.ts` owns cover generation, status polling, upload replacement, and `createEpisodePreview`.
- `apps/web/shared/verticalDramaSeries/episodePreview.ts` validates/persists four preview slots.
- `apps/web/server/services/verticalDramaEpisodePreview.ts` persists/reconciles preview state.
- `apps/web/server/services/verticalDramaRemotionRender.ts` stages assets server-side but currently writes protected absolute URLs into the worker template and manifest.
- `apps/web/server/services/verticalDramaEpisodeVideoAssembly.ts` already reads managed storage directly through `storageStreamFile`, which is the correct server-side staging behavior.
- `apps/web/server/services/mediaGenerationService.ts` and `mcpDownloadBrokerService.ts` provide the existing tenant-scoped signed broker URL boundary.
- `apps/web/client/src/components/verticalDramaSeries/VerticalDramaEpisodePreviewPanel.tsx` renders the single cover surface and preview slot cards.

## Constraints

- Preserve dirty unrelated worktree changes.
- Do not add a schema migration if the existing `coverImage` JSONB can carry a backward-compatible variant envelope.
- Do not send browser-session URLs to external workers/providers.
- Keep idempotency and per-slot task polling isolated.
- Existing UI uses four preview slots numbered 1–4 and existing cover status polling.

## Risks discovered

- The existing cover router assumes one generating/pending cover and writes `coverImage` directly.
- A variant envelope must preserve legacy `readEpisodeCoverState` callers and series-list projections.
- Preview render templates and asset manifests must use the same broker-resolved URLs; changing only the initial server-side probe is insufficient.
- Model reference capacity includes configured logos, so requested scene-image counts must be capped safely.
