# Section 07: Library, Media History, and Video Editor Handoff

## Goal

Make completed creative final composites behave like normal playable user media
across Media History, Library, Document Management, MediaStudio, and Video
Editor.

## In Scope

- reuse source `marketplace_auto_review_hyperframes_render`;
- creative metadata in Library finalize envelope;
- paired internal `artifactRefs` for Library save while normal UI uses sanitized
  playable `outputRefs`;
- idempotent Library save;
- Media History video filtering by product/run/source/type;
- open/download actions;
- Video Editor open-as-video behavior;
- duplicate save and refresh handling.

## Out of Scope

- New media source type.
- Replacing existing Media History retention policy.
- Showing raw composition HTML or worker logs to normal users.

## Existing Files To Review

- `apps/web/server/services/hyperframesLibraryFinalizeService.ts`
- `apps/web/server/services/hyperframesRuntimeApiService.ts`
- `apps/web/server/routers/media.ts`
- `apps/web/client/src/pages/MediaHistory.tsx`
- `apps/web/client/src/pages/DocumentManagement.tsx`
- `apps/web/client/src/pages/MediaStudio.tsx`
- `apps/web/client/src/lib/mediaStudioRenderLibrarySessions.test.ts`
- `apps/web/client/src/lib/videoEditorLibraryHandoff.test.ts`
- `apps/web/tests/e2e/marketplace-hyperframes-ui.spec.ts`

## Test First

Add failing tests for:

- finalized metadata includes creativePlanHash, preset ids, versions,
  audioEventMapHash, hasAudio, hasNativeAudio, fallbackQuality, and output hash;
- finalized metadata preserves exact creative fields `overlayPresetId`,
  `subtitlePresetId`, `audioPackPresetId`, `musicPresetId`, `sfxPresetIds`,
  `presetVersions`, `compositionHtmlHash`, `compositionMode`,
  `platformPresetVersion`, `templateContentHash`, `contentHash`,
  `storageRef`, and `libraryItemId` where applicable;
- Library finalize uses internal `artifactRefs`/metadata only after QA passes,
  while open/download buttons use safe `outputRefs`;
- idempotency key matches the existing Feature 119 format;
- duplicate finalize returns existing item;
- Media History card has playable video URL and download action;
- route filters for product id and run id find the output;
- Library/Document Management links work with existing source;
- Video Editor can open completed MP4;
- preview-only artifacts never become durable Library media after expiry.

## Implementation Notes

Do not create a new media source. Add creative metadata to the existing
HyperFrames source. Normal users should see ordinary playable media, not worker
artifacts.

## Acceptance Criteria

- Completed final composite is visible in Media History.
- Download link is present where the render completed.
- Library save is idempotent.
- Video Editor can reuse the MP4.

## Rollback Notes

Hide creative metadata while preserving media items already finalized under the
existing HyperFrames source.
