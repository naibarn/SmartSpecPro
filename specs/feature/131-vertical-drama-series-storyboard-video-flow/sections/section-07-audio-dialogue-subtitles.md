# section-07-audio-dialogue-subtitles

## Goal

Plan dialogue, voice continuity, native audio, separate TTS, subtitle cues, timing, and repair metadata for each Vertical Drama episode before Storyboard Review handoff.

## Depends On

- section-01-skill-packages
- section-02-contracts-persistence-assets
- section-04-series-memory-and-episode-pipeline

## Files

Create:

- `apps/web/server/services/verticalDramaDialogueAudioService.ts`
- `apps/web/shared/verticalDramaSeries/audio.ts`
- `apps/web/shared/verticalDramaSeries/subtitles.ts`
- `apps/web/server/services/__tests__/verticalDramaDialogueAudioService.test.ts`

Modify only if needed:

- Storyboard Review audio metadata helpers
- existing TTS/provider model routing helpers

## Contracts

Define:

- `VerticalDramaDialogueAudioPlan`
- `VerticalDramaDialogueLine`
- `VerticalDramaSpeakerVoiceMap`
- `VerticalDramaSubtitleCue`
- `VerticalDramaNativeAudioPolicy`
- `VerticalDramaSeparateTtsPlan`
- `VerticalDramaAudioTimingSummary`

### `VerticalDramaDialogueAudioPlan` field pins (spec §14 / §6.8)

- `mode`: `"narrator" | "dialogue"` — explicit narration-vs-dialogue intent for the plan. `narrator` covers voiceover/monologue delivery; `dialogue` covers named-speaker exchange. This is distinct from `audioStrategy` (how audio is produced) and must be persisted alongside it.
- `audioStrategy`: pinned enum, exactly one of `"separate_tts_voiceover" | "native_video_audio" | "dialogue_tts" | "silent"`.
  - `separate_tts_voiceover` — dialogue/narration generated separately and mixed later (safe default).
  - `dialogue_tts` — provider-native multi-speaker TTS when available, otherwise segment-and-merge.
  - `native_video_audio` — speech/ambience is part of generated video, allowed only when the video model supports it and the user accepts regeneration cost.
  - `silent` — internal fallback or visual-only planning state.
- `mode` and `audioStrategy` are independent axes: e.g. `mode: "narrator"` may pair with `separate_tts_voiceover`, while `mode: "dialogue"` may pair with `dialogue_tts` or `native_video_audio`.

## Audio Strategy Rules

- Separate TTS is the safe default when video model native audio is missing or language support is uncertain.
- Native video audio is allowed only when the selected video model supports requested language/audio behavior and the user accepts regeneration cost.
- Speaker voice continuity is series-scoped, not episode-only.
- Missing voice IDs create warnings and block separate TTS generation, but should not block script planning.
- Subtitle cues are generated from dialogue/timing plan and include 9:16 safe-area metadata.

## Sub-Shot Dialogue/Subtitle Timing (feature-flagged, spec §7.4)

This is additive and gated by `verticalDramaSeriesSubShots` (default off, see §7.4 Sub-Shot
Decomposition). When enabled, a main shot may decompose into 2–5 ordered SUB-SHOT sub-clips
(quick cuts) whose durations SUM to the parent main-shot duration. Dialogue and subtitle
planning is authored per main shot; sub-shots only subdivide the parent shot's screen time and
must not change the number of dialogue lines, subtitle cues, or their combined timing.

- A dialogue line or subtitle cue MAY span multiple sub-shot cuts within one main shot. Its
  timing is continuous across sub-shot boundaries — a cut does NOT force a caption break or an
  audio break. The cue keeps a single `start`/`end` even when the visual angle changes mid-cue.
- Subtitle 9:16 safe-area rules apply per sub-shot: for a cue that overlaps N sub-shots, the
  safe-area metadata is validated against each overlapped sub-shot so the caption stays inside
  the vertical safe area through the cuts.
- Native-audio vs separate-TTS regeneration rules (existing Audio Strategy Rules and spec §14
  rules 6–7) still apply per MAIN shot, not per sub-shot. `audioStrategy` is a property of the
  main shot's audio plan; decomposing the shot does not re-derive strategy per sub-shot and does
  not change which regeneration-impact message applies.
- Subtitle/audio timing still sums within the parent main shot, and the episode still totals
  60 seconds — sub-shots never alter cue count, line count, per-shot timing sum, or episode
  duration.
- With `verticalDramaSeriesSubShots` off, none of the spanning logic runs and dialogue/subtitle
  timing behavior is exactly the non-decomposed baseline.

## UI/UX Contract

### Target User / JTBD

- Role: creator reviewing episode audio/readability before paid generation.
- Goal: confirm dialogue, voice mapping, audio strategy, and subtitles are safe and coherent.
- Entry point: episode audio stage and Storyboard Review metadata.
- Success outcome: audio/subtitle plan is visible, repairable, and carried into review.

### Surface Inventory

| Surface | File/route | Change |
|---|---|---|
| Episode workspace audio stage | Dashboard episode route | audio strategy and warnings |
| Storyboard Review metadata | existing review route | dialogue/subtitle/timing display |

### Component Map

| Component | File | Owns | Consumes |
|---|---|---|---|
| `verticalDramaDialogueAudioService` | server service | audio plan | skills/model policy |
| Audio summary panel | section 03/06 UI | display | audio plan |

### State Matrix

| State | Expected UI | Verification |
|---|---|---|
| loading | audio plan generation state | UI test |
| empty | no dialogue plan shows create/regenerate CTA | service/UI test |
| error | missing voice/model capability warning | unit/UI test |
| success | voice map and subtitle summary visible | integration test |
| disabled/focus/hover | TTS/native audio actions disabled until policy passes | UI/accessibility test |

### Responsive Matrix

| Viewport | Expected behavior | Evidence |
|---|---|---|
| mobile 390x844 | dialogue lines stack without overflow | screenshot |
| tablet 768x1024 | voice map and subtitle summary readable | screenshot |
| desktop 1440x900 | audio plan fits with stage details | screenshot |

### Accessibility Acceptance

- Dialogue lines include speaker labels.
- Warnings are text-visible and not color-only.
- Audio controls have accessible names.

### Copy Contract

- Copy must distinguish separate TTS from native video audio.
- Missing voice IDs and unsupported native audio must have localizable reason codes.
- Regeneration-impact copy (spec §14 rules 6–7) must be localizable and strategy-specific: for `native_video_audio`, a script change message states VIDEO regeneration is required; for `separate_tts_voiceover`, a script change message states audio can be regenerated without touching video prompts or frame references.

### Browser Evidence Required

Capture separate TTS, native audio blocked, and subtitle summary states where UI is implemented.

## Tests First

- Test: dialogue planner maps speakers to characters and stable voice IDs.
- Test: missing voice ID creates warning and blocks TTS generation only.
- Test: native audio snippets are omitted when model capability does not support native audio.
- Test: separate TTS plan never injects speech/lip-sync instructions into visual video prompts.
- Test: subtitle cues include start/end timing, text, speaker, and safe-area metadata.
- Test: overlong speech creates repair action.
- Test: changing selected video model revalidates native audio policy.
- Test: Storyboard Review extra params preserve audio strategy, voice IDs, subtitle cue IDs, and timing.
- Test (display, spec §14 rule 6): when `audioStrategy` is `native_video_audio`, a script/dialogue change surfaces a Storyboard Review message stating that the change requires VIDEO regeneration (audio is baked into the generated video).
- Test (display, spec §14 rule 7): when `audioStrategy` is `separate_tts_voiceover`, a script/dialogue change surfaces a Storyboard Review message stating that audio can be regenerated WITHOUT changing video prompts or frame references.
- Test (sub-shots, spec §7.4): when `verticalDramaSeriesSubShots` is enabled and a main shot is decomposed, a subtitle cue that spans two or more sub-shot cuts keeps a single continuous `start`/`end` timing across the sub-shot boundaries (a cut does not split the cue into separate caption breaks).
- Test (sub-shots, spec §7.4): a dialogue line spanning sub-shot cuts keeps continuous audio timing across the cuts; a sub-shot boundary alone does not force an audio break within the parent main shot.
- Test (sub-shots, spec §7.4): subtitle 9:16 safe-area metadata is validated per sub-shot for a spanning cue, so each sub-shot the cue overlaps still satisfies the safe-area rules.
- Test (sub-shots, spec §7.4): native-audio vs separate-TTS regeneration rules (spec §14 rules 6–7) are evaluated per main shot, not per sub-shot — decomposing a shot does not change which regeneration message applies.
- Test (sub-shots, spec §7.4): audio/subtitle timing still sums within the parent main shot and the episode still totals 60 seconds when sub-shots are enabled.
- Test (sub-shots off, spec §7.4): with `verticalDramaSeriesSubShots` disabled, dialogue/subtitle timing behavior is unchanged (no sub-shot spanning logic runs; cues and audio timing match the non-decomposed baseline).

## Implementation Tasks

1. Add dialogue/audio shared contracts.
2. Add dialogue/audio planner service that invokes `vertical-drama-dialogue-audio-planner`.
3. Add voice continuity lookup from series memory and character state.
4. Add native audio capability checks from model/provider routing.
5. Add separate TTS plan with provider/model/voice ID mapping.
6. Add subtitle cue plan and safe-area metadata.
7. Add repair actions for overlong dialogue, missing voice IDs, unsupported native audio, and timing mismatch.
8. Expose plan summary for Dashboard and Storyboard Review metadata.

## Acceptance

- Episode can carry dialogue/audio metadata into Storyboard Review without triggering paid TTS/video generation.
- Separate TTS and native audio policy are visibly different and auditable.
- Subtitle cues and voice continuity survive save/load.
- Audio timing warnings are repairable before final assembly.

## Verification

```bash
cd apps/web && pnpm test -- verticalDramaDialogueAudio
cd apps/web && pnpm check
```
