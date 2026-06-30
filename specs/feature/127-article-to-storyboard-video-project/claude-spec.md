# Synthesized Spec: Feature 127 Article To Storyboard Video Project

## Objective

Add a new opt-in Presentation Builder output path that turns article pages into a Storyboard Review video project. Each article page becomes one video shot. The generated video provides motion/visual storytelling, while page title/key text remains editable CSS overlay on top of the video.

Existing Presentation Builder modes must remain unchanged.

## Primary User Value

Users who already create article/presentation content can convert the same page structure into a modern video workflow without manually rebuilding every shot in Storyboard Review. The user gets a reviewable video-shot project with prompts, references, overlay text, and audio strategy already prepared.

## In Scope

- New output mode: `article-storyboard-video`.
- Builder preview for shot count, duration, model/audio choices, references, credit/access warnings, and Storyboard Review handoff.
- One shot/task per article page.
- One 3x3 reference candidate sheet per page.
- 1-5 selected scene/reference frames per shot.
- Optional character reference images attached before 3x3 generation and carried through prompt generation.
- Seedance-oriented video prompts through `seedance-multishot-review`.
- Dedicated article storytelling voice script skill: `article-storytelling-voiceover-script`.
- Audio strategies:
  - `separate_tts_voiceover`
  - `native_video_audio`
  - `silent` only as internal fallback/advanced state.
- Separate TTS support for single narrator and two-speaker dialogue.
- UVoice premium first rollout, including `voiceID` mapping and segment-then-merge for two-speaker dialogue.
- ElevenLabs dialogue-capable route support when available.
- Native video audio prompt composition only when the selected model supports native audio and Thai speech.
- Storyboard Review metadata persistence for model selection, audio strategy, voice IDs, references, overlay, source page lineage, and timing.
- Storyboard Review UI separation between prompt, overlay, voiceover/audio, character references, and scene references.
- Tests and browser evidence for the user workflow.

## Out of Scope

- Replacing existing Presentation output behavior.
- Building a full podcast editor.
- Baking overlay text into generated video.
- Unlimited reference generation per page.
- Assuming provider model capabilities from hardcoded names.
- Automatically spending paid video/TTS credits without explicit user action.

## Key Contracts

### Article Page To Shot

Each article page creates:

- `shotId`
- `pageNumber`
- `title`
- `pageText`
- `overlay`
- `voiceover`
- `videoPrompt`
- `referenceCandidateSheet`
- `characterReferenceImages`
- `selectedReferenceImages`
- `audioStrategy`
- `modelSelection`
- `audioFirstTiming`

### Reference Model

- Character references are source identity references.
- 3x3 frames are scene/composition references.
- Character references do not count toward the selected 1-5 scene-frame limit.
- Changing character references stales both the 3x3 sheet and video prompt.
- Changing selected 3x3 frames stales the video prompt.

### Audio Model

- Separate TTS sends voice script segments to Media Studio TTS and keeps video prompt silent/no lip-sync.
- Native video audio embeds spoken lines in the video prompt only if capability metadata allows it.
- Missing concrete voice IDs block separate TTS handoff.
- UVoice two-speaker dialogue generates per-turn/per-group audio and merges or sequences it deterministically.
- ElevenLabs dialogue-capable providers may use a provider-native dialogue request.

### Handoff Model

Storyboard Review owns video review state after project creation. Presentation notes may store summary metadata but are not canonical.

## MVP Decisions Carried From Source Spec

- Default shot duration starts at 5 seconds per page, then stretches or warns based on audio/script timing.
- MVP overlay presets are lower third and center title; top caption needs safe-area evidence, and side panel is deferred until responsive evidence is strong.
- Overlay style inherits tenant/brand theme when available and otherwise uses safe defaults.
- Storyboard Review should show basic overlay preview/edit in MVP when existing surfaces are ready; otherwise preserve metadata and enable downstream composite first.
- Reference frames are auto-selected 1-5 first, with user adjustment in advanced/expanded controls.
- Successful handoff opens Storyboard Review immediately and provides a return/backlink path.
- UVoice premium unavailable must warn and require explicit fallback selection.
- Project creation can happen with estimated timing before TTS exists; Storyboard Review recomputes timing after measured audio exists.
- Default voice mode is single narrator.
- Two-speaker dialogue requires two distinct voice IDs by default.
- Default audio strategy is separate TTS voiceover.

## UI Requirements

The Builder preview must answer:

1. What will be created?
2. What text will appear on video?
3. What will cost credits?
4. Which model/audio/voice settings will be carried into Storyboard Review?
5. Which references are character identity references versus selected scene references?

The Storyboard Review UI must restore and display:

- video model
- requested/resolved audio strategy
- voice mode
- voice model and voice IDs when separate TTS is selected
- storytelling script
- character references
- scene references
- overlay text/style/timing
- timing warning if audio and video durations drift.

## Acceptance Summary

MVP is acceptable when:

- Feature is feature-flagged and opt-in.
- Existing Presentation modes behave unchanged.
- A 5-page article creates 5 ordered Storyboard Review video tasks.
- Each shot has one 3x3 sheet and 1-5 selected scene references.
- Character references can be attached before 3x3 generation and are preserved separately.
- Prompts are generated through `seedance-multishot-review`.
- Voice scripts are generated through `article-storytelling-voiceover-script`.
- Audio strategy, model selection, and speaker voice IDs persist through Storyboard Review.
- Overlay is editable CSS metadata, never baked into generated video.
- Paid video/TTS generation remains explicit and gated.
- Tests and browser evidence prove the workflow.
