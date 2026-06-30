# TDD Plan: Feature 127 Article To Storyboard Video Project

Write tests before implementation in each wave. Use Vitest-style tests matching existing `apps/web` conventions and add browser/Playwright evidence for UI workflows when available.

## Wave 1: Contracts, Flags, And Pure Planning

Test stubs:

- Feature flags include all `presentationArticleStoryboardVideo*` keys and default to false.
- `buildArticleStoryboardVideoShotPlans` creates exactly one shot per article page.
- Empty page list returns a blocked preview reason.
- Overlay extraction uses page title/key text and does not include full body by default.
- Selected scene references validate minimum 1 and maximum 5.
- Character references validate durable URL, supported source, consent, safety, and count limit.
- Character references do not count toward selected scene reference limit.
- Changing character references marks candidate sheet and video prompt stale.
- Changing selected 3x3 frames marks only video prompt stale.
- Audio strategy resolver defaults to `separate_tts_voiceover`.
- Audio strategy resolver returns stable `requested`, `resolved`, `reasonCode`, `message`, `nativeAudioAllowed`, `separateTtsAllowed`, and `fallbackOffered` fields.
- `silent` is treated as an internal fallback/advanced state and is not offered as a primary MVP Builder choice.
- Default shot timing starts at 5 seconds per page before audio exists.
- Native video audio is blocked when model capability lacks native audio or Thai speech.
- Separate TTS is blocked when voice model or voice ID is missing.
- Two-speaker separate TTS requires two distinct voice IDs by default.
- UVoice two-speaker mode resolves to `segment_then_merge`.

## Wave 2: Builder Preview UI

Test stubs:

- Existing `editable` and `full-slide-image` modes render and submit unchanged.
- `article-storyboard-video` option is hidden when flag is off.
- Option appears when flag is on.
- Preview shows shot count, duration estimate, selected video model, audio strategy, voice mode, and credit/access summary.
- Preview exposes stable `accessDecision`, `audioEstimate`, per-page `warningCodes`, `nativeSpeechLineCount`, and `speakerSegmentCount` data for UI rendering and tests.
- Preview lists missing feature flags through `accessDecision.missingFeatureFlags`.
- Preview credit estimate separates reference generation, character reference processing, video generation, native video audio, TTS, audio merge, and render categories where available.
- Preview blocks unsupported voice mode, disabled native-audio prompt composer, unavailable required skills, unavailable provider access, and provider credential/signed URL leakage.
- Preview defaults to single narrator, separate TTS, and 5-second-per-page estimated timing.
- Separate TTS mode shows voice model and per-speaker voice ID fields.
- Native video audio mode hides separate TTS voice ID fields and shows capability warning/fallback when unsupported.
- Missing voice ID blocks create-project action.
- Unavailable UVoice premium requires explicit fallback selection and never silently switches providers.
- Handoff success opens Storyboard Review and exposes a return/backlink path.
- Character reference attachment is visible before 3x3 generation.
- Preview copy clearly says the output is a Storyboard Review Project.

## Wave 3: References And Prompt/Script Preparation

Test stubs:

- Candidate sheet starts empty and transitions through generating/ready/failed/stale.
- 3x3 sheet split produces 9 frame records with durable URLs.
- Auto-selection returns 1-5 frames and marks the first selected frame primary.
- Users can adjust auto-selected references before prompt generation when advanced controls are exposed.
- Repair/regenerate preserves character references unless user removes them.
- Seedance prompt adapter receives selected scene references and character references separately.
- Separate TTS prompt policy produces silent/no speech/no lip-sync guidance.
- Native video audio prompt policy includes speech lines only when allowed.
- Prompt adapter never asks the model to draw readable overlay text.
- `article-storytelling-voiceover-script` fixtures cover single narrator and two-speaker dialogue.
- Script output rejects video directions, CSS copy, unsupported claims, and meta commentary.

## Wave 4: Storyboard Review Handoff

Test stubs:

- A 5-page article creates 5 ordered `StoryboardGenerationTask` records.
- Each task is `type = "video"` and stores selected video model.
- `task.prompt` contains video prompt only and excludes overlay text for separate TTS.
- Native video audio tasks include spoken lines only when allowed.
- `storyboardContext.referenceImages` stores selected scene references.
- Character references are stored separately in `extraParams`.
- Static slide image fallback metadata is preserved only as fallback/reference data, not primary output.
- `extraParams` preserves source draft ID, page number, shot ID, overlay ID, prompt skill ID, script skill ID, audio strategy, voice config, and timing.
- `videoSegmentState.videoSegmentPlan` restores selected video model and audio strategy.
- Existing `companionAudio`, `companionAudioUpdatedAt`, and `voiceoverFullScript` conventions are preserved.
- Optional Presentation Note writes are secondary and do not become canonical video state.
- Duplicate handoff with same source draft/mode returns existing project or blocks duplicate creation.
- Handoff may proceed with estimated timing before TTS exists, and Storyboard Review recomputes timing after measured audio exists.
- Old Storyboard Review projects without Feature 127 metadata load with defaults and recoverable warnings.
- Old separate-TTS drafts with missing voice IDs remain viewable and keep existing generated audio, but block new TTS generation.
- Migration/normalization does not rewrite existing generated video or audio assets unless the user explicitly regenerates them.

## Wave 5: Storyboard Review UI And Overlay/Audio Display

Test stubs:

- Storyboard Review displays separate sections for Video prompt, Text on video, Voiceover/audio, Character references, and Scene references.
- Overlay editor loads persisted metadata and saves text/style/timing.
- Overlay presets include lower third and center title in MVP; top caption requires safe-area evidence; side panel remains deferred unless responsive evidence passes.
- Overlay styling inherits tenant/brand theme when available and falls back to safe defaults.
- Editing overlay does not mutate task prompt.
- Prompt-like overlay text triggers warning.
- Missing voice ID shows recoverable configuration warning.
- Timing mismatch warning appears when audio/video drift exceeds tolerance.
- Character references and selected scene references render as separate lists.
- Keyboard navigation reaches edit overlay, regenerate prompt, attach/replace references, and audio settings controls.
- Browser evidence covers mobile, tablet, and desktop.

## Wave 6: TTS, Native Audio, And Final Render Integration

Test stubs:

- UVoice single-speaker sends provider param `voiceID`.
- UVoice two-speaker dialogue creates deterministic per-turn/per-group audio segments.
- UVoice segment merge/sequence preserves `sequenceIndex`, start time, and measured duration.
- UVoice premium unavailable blocks automatic fallback and requires explicit user-selected fallback.
- ElevenLabs dialogue-capable strategy creates one structured provider-native dialogue request when capability allows.
- Separate TTS generated audio attaches as one logical voiceover track.
- Native video audio final render does not add duplicate external voiceover.
- Switching native audio to separate TTS stales video prompt/generated video.
- Changing a voice ID stales only affected TTS audio.
- Final render combines video, CSS overlay, and correct audio track.
- Final composite maps generated video to `V1`, CSS overlay to `T1`, separate TTS to `A1`, and keeps native video audio inside `V1` unless explicitly replaced.

## Gate Plan

Run after relevant waves:

- `cd apps/web && pnpm check`
- focused Vitest tests for changed shared helpers/components
- Storyboard Review workspace tests
- feature flag tests
- skill fixture tests if existing harness supports them
- browser/Playwright/manual evidence for Builder preview and Storyboard Review metadata UI
