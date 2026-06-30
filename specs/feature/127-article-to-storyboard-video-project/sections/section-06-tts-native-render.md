# section-06-tts-native-render

## Goal

Wire separate TTS, native video audio gating, measured timing, and final render behavior so Storyboard Review can produce video with CSS overlay and the correct audio strategy.

## Depends On

- section-04-storyboard-handoff

## Files

- Media Studio TTS integration points discovered during implementation
- Storyboard Review audio helpers in `StoryboardReviewPage.tsx` and shared workspace utilities
- shared `apps/web/shared/articleStoryboardVideo/audio.ts`
- shared `apps/web/shared/articleStoryboardVideo/timing.ts`
- relevant render/final composite handoff paths
- focused tests

## Test First

Write tests for:

- UVoice single narrator sends provider parameter `voiceID`
- UVoice two-speaker dialogue creates ordered per-turn/per-group audio jobs
- UVoice premium unavailable blocks automatic fallback and requires explicit user-selected fallback
- segment merge/sequence preserves `sequenceIndex`, start time, and measured duration
- ElevenLabs dialogue-capable provider uses `single_request_dialogue` when capability allows
- separate TTS generated output attaches as one logical voiceover track
- native video audio render does not add duplicate external narration
- switching native audio to separate TTS stales video prompt/generated video
- changing a voice ID stales only affected TTS audio
- final render includes video + CSS overlay + correct audio
- final composite maps generated video to `V1`, CSS overlay to `T1`, separate TTS voiceover to `A1`, and static images only as fallback/reference assets

## Implementation Tasks

1. Add capability-driven TTS render strategy resolution.
2. Add UVoice provider param mapping from app `voiceId` to provider `voiceID`.
3. Add UVoice two-speaker segment generation plan.
4. Add deterministic merge/sequence metadata.
5. Add explicit fallback selection requirement when UVoice premium is unavailable.
6. Add ElevenLabs dialogue-capable strategy hook without assuming all ElevenLabs models support it.
7. Add native video audio capability gate using model registry metadata.
8. Update measured duration after audio generation and recompute Storyboard Review timing.
9. Feed timing warning into Storyboard Review UI.
10. Ensure final render does not duplicate audio when native audio is already inside the video.
11. Preserve downstream composition track separation: generated video on `V1`, CSS overlay on `T1`, separate TTS on `A1`, native clip audio inside `V1`, and static slide image only as fallback/reference.

## Acceptance

- Separate TTS and native video audio are explicit, persisted, and capability-gated.
- UVoice two-speaker output remains coherent after retries.
- Final render uses exactly the intended narration source.
- Downstream composition keeps video, overlay, and audio as separate tracks.

## UI/UX Contract

### Target User / JTBD

Indirect UI. Users need clear recoverable audio strategy, voice ID, timing, and render states surfaced by section-05.

### Surface Inventory

| Surface | File/route | Change |
|---|---|---|
| Storyboard Review audio/render | existing Storyboard Review route | consumes audio/timing states |
| Media Studio TTS paths | existing Media Studio flows | generates voiceover assets |

### Component Map

| Component | File | Owns | Consumes |
|---|---|---|---|
| Audio helpers | shared/audio files | strategy and provider mapping | model/voice config |
| Render handoff | existing render paths | final audio source selection | Storyboard Review draft |

### State Matrix

| State | Expected UI | Verification |
|---|---|---|
| loading | audio generation/render progress | section-05/browser evidence |
| empty | no audio generated yet | section-05 UI |
| error | missing voice ID/provider failure recoverable | tests/UI |
| success | one logical voiceover/native audio path shown | tests/UI |
| disabled/focus/hover | owned by UI sections | section-05 evidence |

### Responsive Matrix

| Viewport | Expected behavior | Evidence |
|---|---|---|
| mobile 390x844 | no direct layout ownership | section-05 evidence |
| tablet 768x1024 | no direct layout ownership | section-05 evidence |
| desktop 1440x900 | no direct layout ownership | section-05 evidence |

### Accessibility Acceptance

Provide clear state/reason metadata for UI sections to announce audio errors and timing warnings.

### Copy Contract

Expose stable reason codes for provider capability mismatch, missing voice ID, timing mismatch, and duplicate-audio prevention.
Also expose reason codes for unavailable UVoice premium and explicit fallback requirement.

### Browser Evidence Required

Indirect. Verify through section-05 and final workflow evidence.

## Verification

- focused audio helper tests
- Storyboard Review workspace tests
- render metadata tests where available
- `cd apps/web && pnpm check`

## Implementation Notes

- Added `audioRender` shared helpers for UVoice provider parameter mapping, two-speaker segment sequencing, measured duration updates, timing warnings, and final render track planning.
- UVoice maps app `voiceId` to provider `voiceID`.
- UVoice two-speaker dialogue uses ordered `segment_then_merge` jobs with deterministic `sequenceIndex` and `startTimeSeconds`.
- ElevenLabs dialogue-capable models resolve to `single_request_dialogue` only when capability metadata allows it.
- Storyboard Review final project build now avoids attaching duplicate external voiceover for `native_video_audio`; separate TTS still maps to A1 and mutes clip audio.
- Focused verification: `npm run test -- shared/articleStoryboardVideo/__tests__/section06.test.ts` passed.
