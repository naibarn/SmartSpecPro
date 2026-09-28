> Historical v1 planning evidence, retained unchanged below. Not v2 completion evidence; see `reviews/v2-readiness-review.md`.

# Feature 180 Interview Decisions

This file records decisions confirmed during the planning conversation. The user approved the complete approach and requested continuation without another confirmation pause.

## Product intent

- Add a new feature specification for a Worker panel that shows speakers and supports localized dubbing/export.
- Support ordinary videos that are not attached to a Series.
- Preserve the existing Silence Cut/manual editing workflow.
- Keep the workflow user-directed: subtitle-first 16:9 editing may happen before speaker scan; crop/reframe and speaker-aware coverage can happen later.

## Identity and matching

- Standalone videos: user can name anonymous speaker IDs and optionally capture a representative frame/audio sample.
- Series videos: resolve the character roster, name and portrait/reference asset from the Series, but require user approval for uncertain mapping.
- Support more than one speaker, including speakers who are not in the same frame and people seen from behind using body/person evidence where possible.
- Do not treat face/voice detection as proof of real-world identity.

## Localization and voice

- Use subtitle/transcript content as an input to editing and condensation.
- Allow source language, target language/region, glossary, style and optional short-form condensation settings.
- Allow an approved voice preset or an explicitly consented voice clone per speaker.
- User specifically approved using licensed/consented clones. Rights/consent evidence is mandatory before use.
- UVoice clone API capability is not yet confirmed. Do not call private UVoice website actions; keep UVoice clone automation gated until the official server API is verified. UVoice ordinary TTS can continue through the existing gateway.
- ElevenLabs or another provider may be the first automated clone adapter, but provider choice must remain explicit and no silent substitution is allowed.

## Audio and export

- If source dialogue can be separated, retain music/SFX and replace dialogue.
- If separation cannot be trusted, ask the user to remove all original audio and rebuild dialogue/music/SFX, or stop for manual DAW work. Never leave original dialogue under the new dub silently.
- TTS should fit original cue timing through text adaptation, provider speed and bounded time-stretch; extreme stretch is not acceptable.
- FFmpeg and Remotion must use the same composed edit map and both need post-encode QC.

## Gateway, skills and billing

- Worker App must call SmartAIHub Server only. Worker must never call external UVoice, ElevenLabs or LLM endpoints directly.
- SmartAIHub applies authentication, tenant scope, skill-first semantic processing, provider gateway, credit reserve/reconcile and managed artifact storage.
- Credit usage must reflect actual provider usage and be idempotent; no duplicate charge or generation on retry.
- Use Skills for semantic translation/localization and linguistic review; do not disguise deterministic VAD, diarization, tracking, separation, TTS transport or encoding as a Skill.
- Source/derived cuts must carry timeline lineage, local Worker sources must be handed off as managed artifacts, and cancellation/worker-version compatibility must be explicit.

## UX priorities

- Add a visible, scrollable, dockable Speakers & Dubbing panel inside the existing Media Studio.
- Do not hide primary actions behind nested scroll containers.
- Show loading, empty, partial, error, needs-review, consent-blocked and successful states.
- Preserve existing timeline, subtitles, Silence Cut, crop/reframe and render controls.
