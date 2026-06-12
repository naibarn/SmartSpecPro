# Section 06: Render Worker and Output Projection

## Goal

Render final creative composites into complete, playable MP4 outputs with
accurate status, audio behavior, manifests, and user-visible actions.

## In Scope

- final render payload using creative plan, timeline, preset versions, source
  media hashes, and audio event map hash;
- Feature 119 outbox compatibility fields: `compositionInputHash`,
  `compositionHtmlHash`, `templateId`, `templateVersion`,
  `templateContentHash`, `platformPresetId`, `platformPresetVersion`,
  `renderIntent`, `compositionMode`, and `runtimeProfileHash`;
- Feature 120 optional outbox fields: `creativePlanHash`,
  `presetManifestHash`, `audioEventMapHash`, and `fallbackQuality`;
- preserve native audio by default when configured plus explicit mute/replace
  policies;
- `preserveNativeAudio` remains an explicit render input, manifest field, and QA
  assertion when native clip audio should survive the composite;
- music/SFX/ambience/VO mix report;
- sound effects and audio beds from staged assets only;
- audio asset source/license/checksum validation before use;
- SFX visual trigger, timing offset, volume, and ducking policy validation;
- staged-manifest ownership, MIME, duration/size, and checksum validation;
- runtime profile hash, `runtimeCapabilityHash`, and runtime version diagnostics;
- FFmpeg fallback hardening and producer capability path;
- playable output probe before completion;
- sanitized output refs for open/download actions;
- refresh/resume status recovery.

## Out of Scope

- Arbitrary cloud render provider replacement.
- Media Library UI changes beyond output metadata needed by Section 07.

## Existing Files To Review

- `apps/web/server/workers/hyperframesRenderWorker.ts`
- `apps/web/server/services/hyperframesRenderService.ts`
- `apps/web/server/services/hyperframesRuntimeApiService.ts`
- `apps/web/server/services/hyperframesQaService.ts`
- `apps/web/shared/hyperframes/contracts.ts`
- `apps/web/server/services/__tests__/hyperframesRenderService.test.ts`
- `apps/web/server/services/__tests__/hyperframesWorkerPolicy.test.ts`

## Test First

Add failing tests for:

- final render does not complete without safe `final_video` URL and content
  hash;
- completed projection exposes `outputRefs.final_video.url`, `outputRefs[].url`,
  `progressPercent`, `renderJobId`, `updatedAt`, and content hash from sanitized
  projection data only;
- progress reaches 100 only after playable probe passes;
- output refs redact storage keys and signed URLs for normal users;
- native audio is preserved unless disabled;
- music/SFX mix creates an audio report and does not clip;
- missing or unlicensed audio/SFX assets block final render with safe copy;
- whoosh, click, notification, cash register, riser, and impact SFX timing
  policies are validated;
- SFX policies avoid excessive repeated SFX;
- voiceover/music ducking and default volume ranges are represented in the mix
  report;
- runtime manifest records Chrome/Playwright, FFmpeg/FFprobe, libass/fontconfig,
  Node, and HyperFrames package/CLI versions;
- raw signed URLs and private URLs are redacted from normal user projections;
- audio clipping probes and exact duration checks must pass before completed
  projection;
- missing audio asset, missing video clip, unsupported preset, font failure,
  overflow QA, and storage failure produce distinct safe statuses;
- completed jobs reload after route refresh by render job id plus product/run
  verification;
- duplicate final render idempotency returns existing active/completed job.

## Implementation Notes

The current worker already has FFmpeg/ASS behavior. Preserve it as an explicit
fallback path, but make rich creative output depend on the capability report from
Section 05.

Do not mark a manifest-only job as completed.

Sidecars must stay compatible with current Feature 119 artifact/output kinds:
`hyperframes_input_json`, `hyperframes_composition_html`,
`hyperframes_snapshot`, `hyperframes_render_mp4`, `hyperframes_render_webm`,
`hyperframes_subtitle_vtt`, `hyperframes_manifest`,
`hyperframes_sanitized_log`, `preview_video`, `final_video`, `snapshot`, and
`library_item`.

## Acceptance Criteria

- User gets open video and download MP4 buttons after completion.
- Media History receives a playable video, not only manifest metadata.
- Audio state is visible and accurate.
- QA results and output artifacts are stored or referenced through existing
  Feature 119 artifacts.
- Failed renders are diagnosable without exposing private internals.

## Rollback Notes

Disable final creative renders while preserving completed Feature 119 renders
and existing Library media.
