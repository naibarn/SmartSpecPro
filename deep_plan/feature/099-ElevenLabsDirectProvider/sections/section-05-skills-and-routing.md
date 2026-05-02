# Section 05: Skills and Routing

## Goal

Add thin SmartSpec skills for discoverability and Chat/Team/Agency routing, without duplicating backend provider logic.

## Decision

Add skills after the direct provider path is working.

## Proposed Skills

- `elevenlabs-text-to-speech`
- `elevenlabs-voice-changer`
- `elevenlabs-speech-to-text`
- `elevenlabs-sound-effects`
- `elevenlabs-voice-isolator`

## Skill Contents

Each skill should include:

- clear intent metadata
- required provider env/key note
- model ID mapping
- UI schema matching `media_models.configJson.inputFields`
- safety/quality tips from ElevenLabs docs
- output artifact expectation

## Files

Likely file targets:

- `apps/web/skills/elevenlabs-text-to-speech/skill.md` or `SKILL.md`
- `apps/web/skills/elevenlabs-voice-changer/skill.md` or `SKILL.md`
- `apps/web/skills/elevenlabs-speech-to-text/skill.md` or `SKILL.md`
- `apps/web/skills/elevenlabs-sound-effects/skill.md` or `SKILL.md`
- `apps/web/skills/elevenlabs-voice-isolator/skill.md` or `SKILL.md`
- `apps/web/skills/**/schemas/input.schema.json`
- `apps/web/skills/**/schemas/ui.schema.json`
- `apps/web/server/services/skillExecutor.ts`
- `apps/web/server/services/skillExecutionPromptBuilder.ts`
- `apps/web/server/services/enabledMediaModelSelection.ts`
- relevant skill matching tests under `apps/web/server/services/__tests__`

Confirm exact skill folder conventions before implementation because this repo contains both `skill.md` and `SKILL.md` patterns.

## Capability Mapping

- Text-to-speech:
  - `capability`: `media.audio.text_to_speech`
  - model: `elevenlabs/text-to-speech`
- Voice changer:
  - `capability`: `media.audio.voice_changer`
  - model: `elevenlabs/voice-changer`
- Speech-to-text:
  - `capability`: `media.audio.speech_to_text`
  - model: `elevenlabs/speech-to-text`
- Sound effects:
  - `capability`: `media.audio.sound_effects`
  - model: `elevenlabs/sound-effects`
- Voice isolator:
  - `capability`: `media.audio.voice_isolator`
  - model: `elevenlabs/voice-isolator`

## Execution Rules

- Skills produce a media job request; they do not call ElevenLabs directly.
- Skills should reuse `media_models.configJson.inputFields` where possible to avoid schema drift.
- Skills that require source media must reject text-only execution with a clear missing-input message.
- STT skill output is transcript artifact, not audio artifact.

## Routing

- Chat/Team requests should classify to `media.audio` with a specific `capability`.
- The executor should call the existing media model path with the chosen model ID.
- Skills should not make direct HTTP calls.

## TDD

1. Skill matching detects "clean this noisy audio" -> voice-isolator.
2. Skill matching detects "transcribe this recording" -> speech-to-text.
3. Skill execution creates a media job payload using the direct ElevenLabs model ID.
4. Source-media skills fail gracefully when no attachment/source URL is supplied.
5. STT skill returns transcript artifact metadata.
