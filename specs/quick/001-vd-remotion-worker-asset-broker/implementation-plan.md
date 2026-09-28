# Implementation Plan

## Objective

Ensure every managed media URL embedded in a Vertical Drama Remotion worker payload is externally fetchable by the worker while remaining tenant/user authorized.

## Files

- `apps/web/server/services/verticalDramaRemotionRender.ts`
- `apps/web/server/services/__tests__/verticalDramaRemotionRender.test.ts`

## Approach

1. Add a small internal helper that resolves an ordered URL list through the existing `resolveExternalMediaReferenceUrls` dependency, validates output length, and raises `VdRemotionRenderError` when worker URLs cannot be produced.
2. Apply it to `submitVdRemotionAssembly` for clips, banners, dialogue segments, and watermark images.
3. Apply it to `submitVdProductionEpisodeAssembly` for clips, watermark images, and BGM tracks.
4. Keep already-public CDN/provider URLs unchanged; only managed storage paths become broker URLs.
5. Use resolved URLs in both `remotionTemplate.layers[].src` and `assetManifest.sources[].url`; retain hashes returned by server-side staging.
6. Keep preview behavior intact and avoid changing storage authorization or broker TTL.

## Security and failure behavior

- Managed URLs require the submission actor `{ tenantId, requestedByUserId }`.
- A missing actor or broker failure fails submission before queueing rather than creating a job guaranteed to fail at `stage_assets`.
- Broker URLs retain filename extensions and use the existing provider-only 60-minute JWT/Redis grant.

## Acceptance criteria

- Assembly worker payload contains broker URLs for managed clip/banner/audio/watermark inputs.
- Production worker payload contains broker URLs for managed clip/watermark/BGM inputs.
- Template and manifest reference the same resolved URL for every asset.
- Public external URLs remain unchanged.
- Focused Remotion tests pass, including new assembly and production broker regressions.
- `git diff --check` passes for touched files.
