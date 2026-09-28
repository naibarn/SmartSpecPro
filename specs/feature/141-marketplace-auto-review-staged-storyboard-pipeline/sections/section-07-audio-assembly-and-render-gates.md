# Section 07 — audio/TTS, final assembly, render, and library-finalize gates

## Purpose and scope

This section closes the remaining credit-bearing boundaries. Separate TTS/audio
requires an audio-plan approval before the audio provider. Final ordered assembly
requires a final-assembly approval before paid render and library-finalize work.
Native video audio does not create a duplicate TTS checkpoint or charge.

Dependencies: Sections 01–03, 05, and 06.

## Tests first

Write tests before implementation:

- `apps/web/server/services/__tests__/marketplaceAutoReview.stagedAudioAssemblyGate.test.ts`
  proves no separate TTS task/reservation exists before `audio_plan` approval;
- transcript timing, language, voice/model availability, cost drift, timeout,
  callback mismatch, and retry fixtures return safe audio correction states;
- native video-audio fixture proves no duplicate TTS checkpoint/charge;
- final assembly hash fixtures cover ordered shots, selected images/clips,
  dialogue/audio, subtitles/overlays, warnings, model/provider, and render cost;
- no paid render or library-finalize task exists before matching final-assembly
  approval and immediate worker recheck;
- final hash drift, missing shot/video/audio, failed QA, render-probe failure,
  package-manifest failure, and library-linkage failure prevent `completed`;
- render/provider callback replay and retry are idempotent and retain approval
  history;
- existing legacy render/finalization tests remain green.

## Implementation contract

### Files

- modify audio/render/finalize branches in
  `apps/web/server/services/marketplaceAutoReviewService.ts`;
- reuse `apps/web/server/services/ttsService.ts` for separate TTS/audio;
- reuse `apps/web/server/services/hyperframesRenderService.ts` and the existing
  video-project/render handoff in `apps/web/server/routers/videoProjects.ts`;
- retain existing video-edit and library-finalize helpers inside
  `marketplaceAutoReviewService.ts`;
- add the focused audio/assembly gate test file and preserve legacy finalization
  suites.

### Separate audio/TTS gate

When `separate_tts_voiceover` is selected, build a reviewable audio plan with
approved dialogue transcript, language, voice/model, timing, pronunciation/
warnings, and estimated audio cost. Create `audio_plan` in `awaiting`. Approval
must bind transcript hash, timing, voice/model, safety, cost, and revision; the
worker rechecks them immediately before the TTS provider task.

Audio timeout, unavailable voice, timing overrun, callback mismatch, or provider
rejection stops at a durable correction/retry state. It preserves accepted shot
and video evidence and never renders an incomplete assembly. A retry that changes
the audio plan supersedes the old approval and requires a new one.

When native audio is part of the selected video capability, do not create a
duplicate audio provider request. The final assembly must still show the audio
source and cost evidence to the user.

### Final assembly gate

After all required shot media and audio evidence are available, build a typed
final assembly projection containing ordered shots, selected images/clips,
dialogue/audio, subtitles/overlays, warnings, QA status, and estimated
render/publish cost. Compute a final assembly content hash over every input that
affects the paid output and create `final_assembly` in `awaiting`.

The user reviews and approves this exact ordered package. Before paid render or
library-finalize, the worker checks final assembly hash plus every required
per-shot prompt/result/video approval, audio approval when applicable, safety,
cost, and artifact readiness. Any drift returns only the affected shot/audio/
assembly state to review; it must not silently render another revision.

Retain existing render probe, media QA, package manifest, credit references,
provider events, and library linkage completion evidence. `completed` requires
all nine shots, required audio/transcript, final QA, successful render probe,
package manifest, and library linkage.

## Acceptance criteria

- Separate TTS/audio and final render/publish spend each have an explicit durable
  approval immediately before provider submission.
- Native video audio is not double-charged.
- Final assembly approval is hash-bound and invalidated by any input drift.
- Incomplete or failed media never reaches `completed`.
- Existing legacy render and library-finalize behavior remains compatible.

## Handoff

Section 08 displays audio/final checkpoint states and safe actions. Section 09
records paid-call evidence, reconciliation, live smoke, and rollback proof.

## Implementation record

Added separate-TTS `audio_plan` creation/approval, audio task submission and
polling, native-audio no-duplicate behavior, and hash-bound `final_assembly`
approval. Final assembly approval is consumed before the existing render/library
finalizer is entered for full video; image-only runs complete without a video or
render charge after final image assembly approval. Audio/provider failures retain
prior accepted evidence and expose an idempotent audio retry path.

Proof: `marketplaceAutoReviewStagedAudioAssemblyGate.test.ts`, staged pipeline
tests, and legacy render/plan-review regression suites.
