# Research Notes

## Runtime evidence

- Kie task `7140ae7420d24f6cda9867d2fc8ff854` returned a `.png`.
- Media asset `770` is the approved image for episode 108 shot 1.
- The matching motion clip has no `startFrameAssetId`.
- `previous_main` asset `769` points to a Hermes `.img` URL.
- Video task `b7c60663-7aa0-423a-862f-303cb052b40f` submitted asset `769`
  and failed with `File type not supported`.

## Web path

- `generateShotVideoPrompt` in
  `apps/web/server/routers/verticalDramaEpisodes.ts` constructs replacement
  clips without `startFrameAssetId`.
- The split-prompt persistence branch must be checked for the same invariant.
- `generateVideoClip` reads only `clip.startFrameAssetId`, then gives unused
  capacity to shot references.
- `syncStartFramesOntoMotionPromptClips` already encodes part of the desired
  mapping but only runs in the whole-stage episode pipeline.
- Focused suites exist:
  - `verticalDramaEpisodes.generateShotVideoPrompt.test.ts`
  - `verticalDramaEpisodes.generateAndPersistSplitShotVideoPrompt.test.ts`
  - `verticalDramaEpisodes.shotReferencesAndQualityReview.test.ts`
  - related `generateVideoClip` router suites found by targeted test search.

## Worker path

- `collect_hermes_outputs` in
  `apps/worker-app/src-tauri/src/hermes_executor.rs` writes every HTTPS image
  marker as `result-marker-{index}.img`.
- `validate_image_file` already detects content type from magic bytes.
- Unit tests for HTTPS result-marker images are colocated in the Rust module.
- The smallest safe change is a pure byte-signature-to-extension helper reused
  before writing the temporary file and by validation expectations.

## Python path

- `generate_video_task` already calls `_is_non_retryable_media_error`.
- The permanent-marker list lacks `file type not supported`.
- Focused tests live in
  `python-backend/tests/tasks/test_media_task_retry_state.py`.
- Adding a narrowly worded marker preserves retry behavior for timeouts,
  throttling, and provider availability errors.

## Boundaries

- Tenant/ownership checks already occur before resolving assets and are not
  changed.
- No new external input or endpoint is introduced.
- No data migration is needed because submission-time reconciliation repairs
  legacy/missing clip projections lazily.

