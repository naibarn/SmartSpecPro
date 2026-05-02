# Section 04: Media Studio UI

## Goal

Make direct ElevenLabs workflows understandable without overloading a single "Audio" form.

## UI Decision

Use an Audio workspace with workflow sub-tabs:

- Text to Speech
- Voice Changer
- Speech to Text
- Sound Effects
- Voice Isolator

Reason: all are audio-related, but input/output mental models differ. A top-level tab per operation would crowd the app-level media tabs; hiding all workflows under one generic Audio form would be confusing.

## UI Requirements

- Text to Speech:
  - text prompt
  - voice ID selector/manual input
  - model ID select
  - output format select
  - voice settings advanced fields

- Voice Changer:
  - source audio upload/library picker
  - target voice ID selector/manual input
  - model select
  - remove background noise toggle
  - output format select

- Speech to Text:
  - audio/video upload/library picker
  - model select (`scribe_v2` first)
  - language code optional
  - diarization toggle
  - timestamps granularity select
  - keyterms array
  - transcript preview

- Sound Effects:
  - prompt textarea
  - duration seconds number
  - loop toggle
  - prompt influence slider/number
  - output format select

- Voice Isolator:
  - source audio/video upload/library picker
  - file format select
  - preview/compare source vs cleaned result

## Model Filtering

- When Audio workspace workflow is `Text to Speech`, show `elevenlabs/text-to-speech` plus existing non-ElevenLabs TTS models where appropriate.
- When workflow is `Voice Changer`, show `elevenlabs/voice-changer` plus the existing WaveSpeed voice changer if still enabled, but label providers clearly.
- When workflow is `Speech to Text`, show only STT/transcription models.
- When workflow is `Sound Effects`, show only sound effect/music effect models.
- When workflow is `Voice Isolator`, show only voice cleanup/isolation models.

## Empty and Setup States

- If ElevenLabs provider is not configured, show model rows but generate should fail early with a setup message, or show a provider setup warning near the model selector when provider readiness data is available.
- If a workflow has no enabled model, show a compact empty state with "Enable ElevenLabs in Admin > Media Providers".
- Source upload controls must show accepted formats and max size/duration hints.

## Accessibility and UX Details

- Workflow sub-tabs should use stable dimensions and not shift the settings panel.
- Upload controls need labels, helper text, disabled state while uploading, and clear/reset.
- Transcript output needs copy button feedback and keyboard focus.
- Avoid a giant top-level tab explosion; keep operation-level switching inside Audio.

## TDD / UI Tests

1. Audio workflow switching filters model list to relevant ElevenLabs model.
2. Required source media disables generate until present.
3. Speech-to-text result renders transcript text.
4. Existing TTS/audio flows still render and generate.
5. Provider setup/empty state appears when no ElevenLabs model is enabled for a workflow.
