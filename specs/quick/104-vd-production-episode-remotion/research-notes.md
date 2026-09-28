# Research Notes

## Current implementation

- `apps/web/client/src/components/verticalDramaSeries/VerticalDramaProductionEpisodesPanel.tsx` already provides a Production Episodes tab, 5/10 grouping, render option controls, polling, and play/fullscreen/download.
- `apps/web/server/services/verticalDramaProductionEpisodeAssembly.ts` currently groups compiled Sub-Episodes and routes to `vertical_drama_ffmpeg_assembly`; it has pure chunking and source-precondition helpers.
- `apps/web/shared/verticalDramaSeries/assembly.ts` persists `productionEpisodesManifest` as series-level JSONB and defines group status/output types.
- `apps/web/server/routers/verticalDramaSeries.ts` owns `assembleProductionEpisodes` and exposes the series detail projection.
- `packages/remotion-render/src/remotionRenderVideoSchema.ts` accepts `segmentTemplates`, `assetManifest`, and `GenericTemplate`; the worker renders each segment and concatenates them.
- `packages/remotion-render/src/layerTemplateSchemas.ts` supports video, image, text, and audio layers with bounded layer count and strict URL validation.
- `apps/web/server/services/verticalDramaRemotionRender.ts` is the existing VD adapter for `remotion_render_video`; it already builds VD layers, stages/probes assets, submits queued jobs, and reconciles completed output for a single Sub-Episode.
- `apps/web/shared/workerRuntime.ts` re-exports the Remotion contract; the existing worker/job monitor surfaces `remotion_render_video` jobs.
- Series watermark configuration is parsed by `@shared/verticalDramaSeries/textOverlay.ts` and edited in `VerticalDramaSettingsTab.tsx`.

## Existing pattern references

- Compiled player: `VerticalDramaSeriesDetailPage.tsx` and the production panel itself.
- Async durable artifact: `VerticalDramaSeriesTrailerPanel.tsx` and existing compiled-video manifest polling.
- Remotion segmented render: `packages/remotion-render/src/renderVideoJob.ts` and `remotionRenderVideoSchema.ts`.
- Tenant ownership: `verticalDramaSeries` router's `verticalDramaProcedure` and existing episode/series loaders.

## Key risks

1. Generic Remotion jobs currently target Video Studio metadata, while the VD adapter already provides a safe extension point; Production EP completion must be reconciled to the series manifest without weakening the generic contract.
2. Raw shot assembly can exceed a single-template layer budget; one Sub-Episode per segment keeps the global job bounded.
3. Persisted source URLs must be refreshed or staged through the existing asset manifest path; arbitrary browser URLs must not be trusted.
4. Existing FFmpeg Production Episode rows must remain readable while new Remotion rows use additive metadata.
5. Repository-wide TypeScript has known unrelated baseline noise; changed-file diagnostics and focused tests are required.

## Schema decision

No new database column is required. The existing series JSONB column is sufficient for additive render metadata; use the conductor as the only schema writer if a migration becomes unavoidable.

## Implementation boundary correction

The implementation should extend/reuse `verticalDramaRemotionRender.ts` rather than create a second generic Remotion builder. The existing Sub-Episode adapter's staging, watermark layer, output artifact lookup, and worker contract are the authoritative patterns. Production EP work adds group-level segment/template construction and series-manifest reconciliation beside the existing episode-level functions.
