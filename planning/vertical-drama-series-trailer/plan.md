# Vertical Drama: Series Trailer (Bible tab) + Pending-Approval Badge Fix

Date: 2026-07-07
Status: In progress

## Problem 1 — Stale "รออนุมัติ" badge

The series list page shows a red "รออนุมัติ (N)" badge driven by
`vertical_drama_approval_checkpoints.state = 'pending'` rows. The manual
approval step was removed from the real workflow (one-click generation
auto-approves via mutation), but:

- `verticalDramaEpisodePipeline.ts` (`ensurePendingCheckpoint`, ~line 2338)
  still creates checkpoints with `state: "pending"`.
- `verticalDramaAssembly.ts` (`recordAssemblyCompletion` ~744,
  `recordExportCompletion` ~832) create the final
  `summarize_episode_to_series_memory` checkpoint as pending — these are the
  rows that linger forever.

### Fix (minimal)
1. Create all new checkpoints as `state: "approved"` (auto-approved, keep the
   row as an audit record; note "auto-approved").
2. Verify nothing gates on transitioning pending→approved (approveCheckpoint
   mutation stays for backward compat; UI approval bar simply never appears).
3. Backfill: `UPDATE vertical_drama_approval_checkpoints SET state='approved'
   WHERE state='pending'` (backup table first per DB safety protocol).
4. Badge code stays — it renders only when count > 0.

## Problem 2 — Auto series trailer in Bible tab

Generate a narration voice-over from bible logline + mainPlot (sanitized, no
"โลจไลน์/โครงเรื่องหลัก" labels, CTA appended in series locale), then compile
episode images (Ken Burns zoom in/out) + video clip excerpts into a 1080x1920
MP4 matching the narration length, with player + download button.

### Architecture
- **Frontend** (`VerticalDramaSeriesTrailerPanel.tsx`, embedded in
  `StoryBibleTab`):
  - TTS model picker (audio models) + voice picker via
    `trpc.media.listModelFieldOptions(modelId, "voice")`; persisted in
    localStorage (`vertical-drama-trailer-voice`).
  - Builds narration text client-side: sanitize(logline) + sanitize(mainPlot)
    + locale CTA; strips markdown/special chars.
  - Calls existing `trpc.media.generateAudio` (same pattern as Media Studio)
    → `audioUrl` + `durationSeconds`.
  - Calls new `verticalDramaSeries.generateTrailer`; polls
    `getTrailerStatus` until completed; shows <video> + download.
- **Backend**:
  - New nullable JSONB column `trailer` on `vertical_drama_series`
    (low-risk ADD COLUMN; run `pnpm db:push`).
  - New router procs on `verticalDramaSeries`:
    - `generateTrailer({seriesId, audioUrl, audioDurationSeconds?,
      idempotencyKey})` → `{jobId, imageCount, videoClipCount}`.
      Gathers media server-side: episode-1 start-frame images first
      (approvedMediaAssetId → mediaAssets.originalUrl, else
      angleGrid.imageUrl), then other episodes; completed video clip URLs
      from `motionPromptPack.clips[].videoTask.videoUrl`. Requires ≥1 source.
    - `getTrailerStatus({seriesId})` → trailer JSONB
      `{status: processing|completed|failed, videoUrl?, durationSeconds?,
      error?, updatedAt}`.
  - New service `verticalDramaSeriesTrailerAssembly.ts` modeled on
    `verticalDramaEpisodeVideoAssembly.ts`:
    - Download audio + media to tmpdir.
    - Target video duration = audio duration + ~0.75s tail.
    - Segment plan: interleave video excerpts (≤3s each, `-ss 0 -t`) and
      images (3s each, ffmpeg `zoompan` alternating zoom-in/zoom-out;
      upscale→zoompan→downscale to avoid jitter). Reuse sources if short.
    - Normalize each segment 1080x1920@30fps h264 yuv420p (no audio),
      concat-demuxer join, trim to target, mux narration AAC (`-shortest`).
    - Upload via `storagePutFromPath` →
      `vertical-drama/trailer/{seriesId}/{uuid}-trailer.mp4`; persist status
      into `series.trailer`.

### Risk
- ADD COLUMN nullable = low risk; migration via drizzle.
- ffmpeg zoompan is new usage; validated by synthetic test pattern already in
  the assembly service.
- Approval auto-approve: must confirm pipeline stage progression does not
  require a pending→approved transition (checked in implementation).

### Verification
- `pnpm check` (typecheck) + targeted vitest.
- Manual: generate trailer on a series with episode-1 images; confirm audio
  length ≈ video length, zoom effect on images, download works.
- Series list shows no รออนุมัติ badge after backfill.
