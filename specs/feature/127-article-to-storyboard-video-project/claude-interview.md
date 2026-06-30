# Interview Transcript: Feature 127 Article To Storyboard Video Project

## Interview Outcome

No blocking stakeholder questions remain for planning. The user already clarified the key product decisions in the spec conversation:

1. The new mode is optional and must not affect existing Presentation outputs.
2. One article page maps to one Storyboard Review video shot by default.
3. A page should have one 3x3 reference candidate sheet, with repair/regenerate if the sheet is unusable.
4. The primary output is a Storyboard Review Project, not a Presentation deck.
5. Generated video should carry the motion/background; text remains CSS overlay above video.
6. Video prompt generation uses `seedance-multishot-review` and 1-5 selected references from the 3x3 sheet.
7. 3x3 candidate generation and video prompt generation may also use separate character reference images.
8. Voiceover/script generation needs a dedicated new article storytelling skill.
9. Audio supports separate TTS voiceover and native video audio/speech when model capability allows.
10. UI must expose video model, audio strategy, voice mode, voice model, and concrete voice IDs when separate TTS is selected.

## Auto-Decisions

### A1. Default Audio Strategy

Default to `separate_tts_voiceover`.

Reason: It is easier to edit, time, regenerate, and render deterministically. Native video audio remains available only when model capability explicitly confirms native audio and Thai speech support.

### A2. Timing Mode

Use audio-first timing when separate TTS is selected.

Reason: The user explicitly wants all shots combined to match generated TTS duration as much as possible. Initial planning should estimate from script length, then update with measured audio durations.

### A3. Character References

Store character reference images separately from selected 3x3 scene frames.

Reason: Character references lock identity and should not count against the selected 1-5 scene reference frame limit.

### A4. MVP Overlay Presets

Plan MVP around lower third, center title, and top caption. Treat side panel as enabled only if responsive/safe-area evidence passes.

Reason: This balances usefulness with lower overflow risk.

### A5. Provider Capability Strategy

Use capability metadata/resolvers, not string matching, for:

- native video audio support
- Thai speech support
- max reference image counts
- TTS dialogue native support
- UVoice segment-and-merge strategy

Reason: Provider/model capabilities change and must be centrally configurable.

### A6. No DB Migration Assumption In Plan

Prefer existing Storyboard Review persistence and JSON metadata first. Add DB migration only if implementation research proves current storage cannot preserve required metadata.

Reason: The spec's product goal is compatible with current `extraParams`, draft metadata, and review data patterns. Avoiding a migration reduces risk.
