# Section 10: Render Library Finalize

## Purpose

Preserve the existing Video Editor, render, and Media Library finalize behavior while adding final QA, warning/disclosure verification, credit summary, and trace metadata.

## Depends On

- section-06-direct-media-execution.
- section-07-visual-audio-continuity-qa.
- section-08-credit-billing-idempotency.

## Blocks

- rollout/resume finalization.

## Files Owned By This Section

- `apps/web/server/services/marketplaceAutoReviewService.ts`
- existing render/library integration points.
- focused tests for render/library finalization.

## Tests First

- Test Video Editor projection uses only accepted clip/audio outputs.
- Test incomplete clip set blocks Video Editor creation.
- Test render preflight blocks failed QA or missing required warning text.
- Test render polling handles queued/running/error/stale/completed states.
- Test final Library item includes evidence, QA, and credit metadata.
- Test Storyboard Review, Video Editor, render job, and Library item include canonical artifact lineage refs.
- Test user-visible output refs never expose raw provider task IDs as media URLs or long-lived signed URLs.
- Test final QA failure prevents `library_finalize` completion.
- Test storage quota and output byte limits block before render or Library finalize.
- Test final output codec/container/duration/resolution validation blocks unplayable output.
- Test failed re-host/transcode/partial upload records cleanup refs and credit release/refund behavior.
- Test final render output matches declared distribution profile aspect ratio, duration, safe areas, captions, warning placement, CTA placement, and loudness.
- Test final Library metadata includes privacy envelope, audio rights/mix envelope, distribution profile, and export variant refs.
- Test final render blocks when required synthetic disclosure/provenance/platform flag is missing.
- Test final render blocks when CTA/landing integrity fails for link, product, variant, redirect, offer, or tracking policy.
- Test final Library item includes post-publish governance and blocks reuse after invalidation trigger.

## Implementation Requirements

Before Video Editor projection:

- verify every expected clip exists;
- verify audio strategy is resolved;
- verify separate TTS URL exists when required;
- verify native video audio status is acceptable;
- verify storyboard/video QA passed or warnings are explicitly allowed.

Before render:

- verify timeline completeness;
- verify warning/disclosure overlay plan has renderable assets or instructions;
- verify credit reservation for render;
- verify final duration and dimensions.
- verify `MarketplaceAutoReviewStorageQuotaPlan` is ok or has an approved cleanup/retry path;
- verify output profile limits for container, codec, max duration, max resolution, and max bytes.
- verify distribution profile fit for aspect ratio, dimensions, frame rate, duration range, safe areas, subtitles/captions, warning text, CTA, and loudness.
- verify audio rights/mix envelope passed for every audio ref that reaches render.
- verify synthetic disclosure/provenance envelope passed when output includes AI-generated or materially synthetic content.
- verify CTA/landing integrity envelope passed when output includes CTA, source URL, affiliate URL, offer language, or shop link.

After render:

- fetch render artifact;
- run final QA:
  - video file exists and is playable;
  - duration matches expected tolerance;
  - no missing clips/audio gaps;
  - warning/disclosure text is present/readable;
  - product/story/ad/privacy/audio-rights/distribution/synthetic-disclosure/CTA QA status is carried forward.
- verify browser-compatible playback after re-host/transcode;
- verify partial upload/temp artifacts have cleanup refs if finalization fails.
- create Library item with:
  - source type;
  - marketplace product ID;
  - selected variant hash/snapshot ref when present;
  - production run ID;
  - auto review run ID;
  - concept ID;
  - output mode;
  - frame/audio strategy;
  - QA summary;
  - credit summary;
  - provider/render refs;
  - storage quota/transcode profile summary;
  - privacy envelope refs;
  - audio rights/mix refs;
  - distribution profile/export variant refs;
  - synthetic disclosure/provenance refs;
  - CTA/landing integrity refs;
  - post-publish governance refs;
  - artifact lineage refs.

Artifact lineage requirements:

- every final output ref must link back to product evidence, selected variant snapshot, storyboard contract, shot payloads, provider tasks, QA verdicts, approvals, and credit events;
- incomplete lineage blocks Storyboard Review handoff, Video Editor projection, render completion, or Library finalize depending on where it is detected;
- provider temporary URLs can be internal-only trace data but must not become user-visible output refs;
- re-host/proxy failures must block or fail with refund/release behavior rather than marking final output complete.
- quota, byte-size, codec, transcode, or playability failures must block `library_finalize` and remain timeline-visible.
- privacy, audio-rights, attribution, profile-safe-area, caption, warning, CTA, loudness, or export-variant failures must block `library_finalize` and remain timeline-visible.
- synthetic disclosure/provenance, CTA/landing integrity, or post-publish governance metadata failures must block `library_finalize` and remain timeline-visible.

## UI/UX Contract

### Target User / JTBD
N/A - backend render/library finalize section only. Output-link UI is planned in section-09.

### Surface Inventory
N/A - no browser-visible app surface is modified in this section.

### Component Map
N/A - no UI component ownership in this section.

### State Matrix
N/A - finalization statuses are persisted for UI consumption; rendering is covered in section-09.

### Responsive Matrix
N/A - no responsive UI work in this section.

### Accessibility Acceptance
N/A - no interactive UI created in this section.

### Copy Contract
N/A - no direct UI copy created here; final status copy is rendered in section-09.

### Browser Evidence Required
N/A - browser evidence belongs to section-09.

## Acceptance Criteria

- Full-video run completes to Media Library only after final QA passes.
- Existing render/library behavior is preserved for successful runs.
- Final artifact has enough metadata for audit and user trust.
- Final artifacts can be traced through canonical lineage without exposing raw provider/private refs to users.
- Final artifacts satisfy quota, re-hosting, transcode, codec, duration, resolution, and max-byte gates before Media Library persistence.
- Final artifacts satisfy declared distribution, privacy, audio rights, attribution, and mix gates before Media Library persistence.
- Final artifacts include disclosure, CTA integrity, and post-publish governance metadata needed for safe future reuse or publication.
