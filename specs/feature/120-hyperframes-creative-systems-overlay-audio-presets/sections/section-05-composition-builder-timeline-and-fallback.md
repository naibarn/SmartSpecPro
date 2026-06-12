# Section 05: Composition Builder, Timeline, and Fallback Adapter

## Goal

Create one canonical timeline and deterministic composition builder shared by
preview, render, audio mix, QA, status projection, and Library metadata.

## In Scope

- `HyperframesCreativeTimeline` normalization.
- creative plan to HTML/CSS/GSAP composition.
- deterministic `<audio>` elements for audio roles, with timing represented by
  attributes and the canonical timeline rather than JavaScript playback calls.
- local Thai font references and CSS variables.
- HyperFrames data attributes such as `data-composition-id`, `data-width`,
  `data-height`, timed `class="clip"` elements, `data-volume`, and
  `window.__timelines`.
- exact HyperFrames timing/preset attributes from the spec:
  `data-start`, `data-duration`, `data-media-start`, `data-track-index`,
  `data-overlay-preset`, and `data-subtitle-preset`;
- subtitle and audio event timing normalization.
- fallback capability report for FFmpeg/ASS.
- sanitizer and QA hooks for generated composition.

## Out of Scope

- Full tenant-authored arbitrary templates.
- Remote scripts or external stylesheets.
- Runtime LLM calls to repair claims or generate missing evidence.

## Existing Files To Review

- `apps/web/server/services/hyperframesCompositionService.ts`
- `apps/web/server/services/hyperframesCompositionSanitizer.ts`
- `apps/web/server/services/hyperframesAssetStagingService.ts`
- `apps/web/server/services/hyperframesQaService.ts`
- `apps/web/server/workers/hyperframesRenderWorker.ts`
- `apps/web/server/services/__tests__/hyperframesRenderService.test.ts`

## Test First

Add failing tests for:

- normalized shot order, contiguous indices, absolute start/end, duration, and
  final duration;
- canonical timeline entries include exact field names `shotId`, `shotIndex`,
  `absoluteStartSec`, `absoluteEndSec`, `durationSec`, source media ref/hash,
  `timelineHash`, and `timelineVersion`;
- legacy `HyperframesFinalCompositeConfig.shots[].startSec` must match the
  normalized timeline or fail with a stale timeline error;
- subtitle/overlay/audio/SFX events are bounded by timeline ranges;
- stale legacy `shot.startSec` mismatches reject render;
- timeline hash changes when source media, duration, cue, or event timing
  changes;
- generated HTML is deterministic for same creative plan;
- sanitizer blocks unsafe DOM, CSS, JS, remote network, localStorage, cookies,
  iframe, and fetch;
- all text escaped before becoming HTML, diagnostics, status copy, or operator
  output;
- generated compositions register deterministic paused timelines and reject
  async/fetch timeline setup;
- composition output uses required data attributes and `data-volume`;
- composition output registers `window.__timelines[compositionId] = tl` and
  uses deterministic paused GSAP timelines;
- composition code cannot manually play/pause/seek audio with JavaScript;
- composition HTML cannot access SmartSpecPro API calls, cookies, localStorage,
  raw signed URLs, or private URLs;
- Thai fonts resolve through allowed local/staged references;
- FFmpeg fallback reports partial or unsupported for rich GSAP presets;
- QA detects text overflow, subtitle overflow, blank frames, missing audio, and
  duration drift.
- QA detects clipped Thai glyphs and treats blocking clipping as render-failing.
- Word-level karaoke remains disabled or candidate-only until transcript, TTS,
  or manual cue timing source is selected and proven with fixtures.
- QA verifies mandatory disclosure placement, exact duration, output artifact
  consistency, thumbnail policy, and disclosure placement from the platform
  profile before final status is allowed.

## Implementation Notes

The fallback adapter should not pretend it can render kinetic typography,
per-word animation, rich CSS, GSAP timelines, shader transitions, or audio-reactive
animation when it cannot. Return a capability report and let API/UI block or warn
based on access policy.

Platform defaults should resolve from profile ids such as `generic_vertical_9_16`
and `tiktok_reels_shorts_9_16`. Manual dimension overrides must be explicit
metadata, not silent drift from the platform profile.

## Acceptance Criteria

- The same canonical timeline drives preview, render, subtitles, audio, and QA.
- Composition HTML is reproducible and hashable.
- Unsafe composition content is rejected before worker execution.
- FFmpeg fallback quality is explicit.
- Composition artifacts remain compatible with Feature 119 artifact/output kinds
  unless a migration is explicitly approved.

## Rollback Notes

Keep the legacy final composite builder active and disable new creative presets
that require the richer builder.
