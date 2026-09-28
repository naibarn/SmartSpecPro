# Deep-Plan Research: Vertical Drama Episode Cover Generation

## Research decision

- Codebase research: required and completed. This feature spans the Vertical Drama episode schema, tRPC routers, media generation task lifecycle, episode-list projection, and the Episodes tab UI.
- Testing research: required and completed. Existing Vitest router tests cover Vertical Drama model selection, ad-banner async generation, media-task status reconciliation, and shared contract helpers; these are the nearest regression patterns.
- Web research: not required. The implementation uses the repository's existing media model catalog, async media transport, upload resolver, and UI primitives. No new provider/API contract or unstable external dependency is being selected.

## Discovery constraint

SocratiCode MCP was not available in the current tool surface. Discovery therefore used bounded `rg`, `sed`, package metadata, and exact symbol searches after reading the repository instructions. No broad rewrite or unrelated file cleanup was performed. The worktree is already heavily dirty, so all later implementation must remain file-scoped.

## Current architecture and governing paths

### Episode data and migration

- `apps/web/drizzle/schema.ts` defines `verticalDramaEpisodes` around the `vertical_drama_episodes` table. It already contains nullable JSONB siblings such as `startFramePlan`, `adBannerPlan`, and `textOverlayPlan`.
- The repository uses hand-authored idempotent migrations for this Vertical Drama lineage because drizzle-kit generation is blocked by a pre-existing meta-journal collision. `apps/web/drizzle/manual_vertical_drama_episode_ad_banner_plan.sql` is the closest column precedent and uses `ALTER TABLE ... ADD COLUMN IF NOT EXISTS ... jsonb`.
- The new durable value should therefore be a nullable `coverImage` JSONB column, added in `schema.ts` and a new manual migration. Existing rows remain `NULL`.

### Series detail projection

- `apps/web/server/routers/verticalDramaSeries.ts` procedure `get` loads owned series data, selects a light episode projection, derives the current thumbnail with `resolveEpisodeThumbnailUrls`, and deliberately strips raw `assemblyManifest` before returning the DTO.
- The same projection is the correct place to expose a display-safe `coverImage` summary and to keep raw prompt/task/provider details out of the client.
- Episode narrative editing already lives in this router. `loadEpisodeSynopsisEditTarget` resolves the active breakdown item, and `updateEpisodeDraftSynopsis` synchronizes the materialized episode's `script._draftSummary.logline` when that copy exists. This establishes the source-of-truth rule: cover generation must read the current active breakdown item, with the materialized episode draft only as a compatible fallback where the existing application already uses one.

### Episode and media generation lifecycle

- `apps/web/server/routers/verticalDramaEpisodes.ts` owns the existing image-generation routes and uses `mediaGenerationService.generateImageAsync`, model capability/transport resolution, credit reservation/refund, and idempotency keys.
- The existing `generateStartFrameImage` flow returns a task id and expects the caller to poll `media.getTask`; the completed URL is then imported into a canonical media asset through the existing `verticalDramaCharacters.resolveMediaAssetForImport` path and linked back to episode state.
- `apps/web/server/routers/verticalDramaSeries.ts` ad-banner procedures `generateAdBannerImage` and `getAdBannerImageStatus` provide a particularly close persisted async pattern: write `pendingTaskId`, poll/reconcile, import completed result, clear pending state, preserve stale-task guards, and refund on terminal failure when appropriate.
- The cover flow should reuse the same media transport and credit services, but persist its own state so a page refresh can resume status discovery and so a manual upload can supersede an older generation task.

### Start-frame references

- `startFramePlan.frames[].approvedMediaAssetId` is the authoritative approved Start Frame reference for a shot.
- `resolveEpisodeThumbnailUrls` already reads this shape for the episode list. Cover reference selection must use only approved Start Frame assets, resolve their URLs server-side, and never send raw unapproved frame candidates.
- Existing shared contracts are under `apps/web/shared/verticalDramaSeries/contracts.ts`; the new cover state and deterministic selector should be isolated in a small shared module so router and tests do not duplicate JSONB parsing rules.

### Upload and preview UI

- `apps/web/client/src/services/webAssetResolver.ts` provides `WebAssetResolver.uploadAsset(file)` for browser uploads, including image extension validation, presigned/multipart fallback, progress, and canonical asset ids/URIs.
- `apps/web/client/src/components/chat/media/ImageLightbox.tsx` already provides image fullscreen viewing and download behavior. The Episodes tab should reuse it instead of creating a second lightbox implementation.
- `apps/web/client/src/pages/VerticalDramaSeriesDetailPage.tsx` contains the `EpisodesTab`, episode cards, compiled-video fullscreen/download affordances, synopsis/key-beat display, and the current responsive two-column card grid. The cover controls belong on those cards and must not interfere with the existing episode navigation link.
- `apps/web/client/src/pages/VerticalDramaEpisodePage.tsx` contains the established per-series model-memory convention: `smartspec_vd_series_${seriesId}_${kind}_model`, `safeLocalStorage`, and live catalog validation. The cover model preference should follow this convention with a distinct `cover` kind.

## Package and verification facts

- Root `package.json` declares npm, but `apps/web/package.json` declares pnpm 10.4.1 and is the web package that owns the relevant scripts. Use the existing web package command style, preferably `pnpm --dir apps/web ...` where supported.
- `apps/web/package.json` has `test: JWT_SECRET=... vitest run`, `check/typecheck: ... tsc --noEmit`, and the relevant router tests run directly through Vitest.
- Focused verification should include the new shared selector/prompt tests, new server lifecycle/router tests, and a focused UI test if the page test harness supports the card interactions. A full repository typecheck may contain pre-existing unrelated failures and must be reported separately rather than used as the sole signal.

## Relevant test precedents

- `apps/web/server/routers/__tests__/verticalDramaSeries.adBanner.test.ts` covers async image submit/status behavior, idempotent replay, transport/model failures, and terminal reconciliation.
- `apps/web/server/routers/__tests__/verticalDramaEpisodes.modelSelection.test.ts` covers model catalog selection validation.
- `apps/web/server/routers/__tests__/verticalDramaEpisodes.shotReferencesAndQualityReview.test.ts` contains idempotency and media transport assertions for `generateStartFrameImage`.
- `apps/web/shared/verticalDramaSeries/contracts.test.ts` and neighboring shared tests establish the repository's pure-function contract test style.
- `apps/web/server/__tests__/verticalDramaEpisodeStageJobsWiring.test.ts` is a nearby server wiring regression surface, but the cover feature should prefer small focused tests over broad pipeline tests.

## Implementation implications

1. Add one nullable JSONB state column and one idempotent manual migration; do not overload `startFramePlan` or `assemblyManifest`.
2. Keep prompt construction and reference selection server-side so the prompt always reflects current episode data and the four references cannot be tampered with by the browser.
3. Reuse existing model catalog/transport/credit/task/media-asset infrastructure, but give the cover lifecycle a durable task id and stale-task protection.
4. Project only display-safe cover state through `verticalDramaSeries.get`.
5. Treat upload as a separate explicit mutation with tenant/user/asset-type ownership checks and manual-upload precedence over an older generated task.
6. Preserve the existing episode-card link and card layout while adding accessible cover actions and responsive controls.
