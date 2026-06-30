<!-- PROJECT_CONFIG
runtime: typescript-pnpm
test_command: cd apps/web && pnpm test
END_PROJECT_CONFIG -->

<!-- SECTION_MANIFEST
section-01-contracts-flags
section-02-builder-preview
section-03-references-prompts-scripts
section-04-storyboard-handoff
section-05-storyboard-ui-overlay-audio
section-06-tts-native-render
section-07-verification-hardening
END_MANIFEST -->

# Implementation Sections Index

## Dependency Graph

| Section | Depends On | Blocks | Parallelizable |
|---|---|---|---|
| section-01-contracts-flags | - | 02, 03, 04, 05, 06, 07 | No |
| section-02-builder-preview | 01 | 03, 04, 07 | Partly |
| section-03-references-prompts-scripts | 01, 02 | 04, 07 | Partly |
| section-04-storyboard-handoff | 01, 02, 03 | 05, 06, 07 | No |
| section-05-storyboard-ui-overlay-audio | 04 | 07 | Partly |
| section-06-tts-native-render | 04 | 07 | Partly |
| section-07-verification-hardening | 01, 02, 03, 04, 05, 06 | - | No |

## Execution Order

1. section-01-contracts-flags
2. section-02-builder-preview
3. section-03-references-prompts-scripts
4. section-04-storyboard-handoff
5. section-05-storyboard-ui-overlay-audio and section-06-tts-native-render may proceed in parallel after section-04 if they do not edit the same files.
6. section-07-verification-hardening

## Section Summaries

### section-01-contracts-flags

Add feature flags, shared types, validation, audio strategy resolution, timing helpers, and unit tests.

### section-02-builder-preview

Add the opt-in Builder output mode, preview UI, model/audio/voice/reference controls, localization, and mode-isolation tests.

### section-03-references-prompts-scripts

Implement 3x3 reference candidate state, character reference flow, Seedance prompt adapter, and the new article storytelling skill.

### section-04-storyboard-handoff

Map shot plans into Storyboard Review draft/tasks and persist model, references, overlay, audio, voice, source lineage, and timing metadata.

### section-05-storyboard-ui-overlay-audio

Extend Storyboard Review UI to display/edit overlay metadata and clearly separate prompt, overlay, voiceover, character references, and scene references.

### section-06-tts-native-render

Wire separate TTS, UVoice/ElevenLabs dialogue strategy, native audio capability gating, audio-first measured timing, and final render audio behavior.

### section-07-verification-hardening

Run focused tests, typecheck, browser evidence, final consistency checks, and gap closure.
