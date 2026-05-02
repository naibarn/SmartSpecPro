# Research: Direct ElevenLabs Media Provider

## Codebase Findings

- Media model metadata is centralized around `media_models` plus static fallback registries.
- Existing provider utility patterns are in:
  - `apps/web/server/services/mediaProviderUtils.ts`
  - `apps/web/scripts/seed-media-providers.ts`
  - `apps/web/server/routers/mediaProviders.ts`
  - `apps/web/server/services/mediaGenerationService.ts`
  - `python-backend/app/llm_proxy/gateway_unified.py`
  - `python-backend/app/services/media_provider_service.py`
- Current audio generation supports multiple providers and can pass `extraParams` and `apiConfig` through the Node gateway to Python.
- WaveSpeed audio support is a good model for provider-specific routing, but ElevenLabs needs binary/multipart and JSON transcript handling, so it should not be squeezed into the WaveSpeed provider.
- Media Studio already has dynamic `inputFields`, upload support, `LibraryFilePicker`, and separate audio workflow UI for Voice Changer. This can be extended to additional audio operations.
- `speech-to-text` is currently more than a media generation output: it creates a text artifact. The plan should add a transcript result strategy instead of pretending the output is an MP3 URL.

## External Source Findings

Sources used:

- ElevenLabs overview: https://elevenlabs.io/docs/overview/intro
- ElevenLabs Voice Changer docs: https://elevenlabs.io/docs/capabilities/voice-changer
- Voice Changer API reference: https://elevenlabs.io/docs/api-reference/speech-to-speech/convert
- Text-to-Speech API reference: https://elevenlabs.io/docs/api-reference/text-to-speech
- Speech-to-Text docs: https://elevenlabs.io/docs/capabilities/speech-to-text
- Sound Effects API reference: https://elevenlabs.io/docs/api-reference/text-to-sound-effects/convert
- Voice Isolator docs/API: https://elevenlabs.io/docs/capabilities/voice-isolator and https://elevenlabs.io/docs/api-reference/audio-isolation
- ElevenAgents overview: https://elevenlabs.io/docs/agents-platform/overview
- ElevenLabs official skills repo:
  - https://github.com/elevenlabs/skills/tree/main/voice-changer
  - https://github.com/elevenlabs/skills/tree/main/text-to-speech
  - https://github.com/elevenlabs/skills/tree/main/speech-to-text
  - https://github.com/elevenlabs/skills/tree/main/sound-effects
  - https://github.com/elevenlabs/skills/tree/main/voice-isolator

Key API notes:

- Text-to-speech:
  - Endpoint: `POST /v1/text-to-speech/:voice_id`
  - Inputs include `text`, `model_id`, `voice_settings`, `language_code`, output format query.
  - Returns generated audio.
  - Relevant models include `eleven_v3`, `eleven_multilingual_v2`, `eleven_flash_v2_5`, `eleven_turbo_v2_5`.

- Voice changer:
  - Endpoint: `POST /v1/speech-to-speech/:voice_id`
  - Multipart input `audio` is required.
  - Recommended model: `eleven_multilingual_sts_v2`; English fallback: `eleven_english_sts_v2`.
  - Max input length: 5 minutes per request; split longer files.
  - Can set `remove_background_noise`.
  - Returns generated audio.

- Speech-to-text:
  - Endpoint: `POST /v1/speech-to-text`
  - Multipart `file` plus `model_id`.
  - Model `scribe_v2` for batch and `scribe_v2_realtime` for live transcription.
  - Supports diarization, word timestamps, keyterm prompting, language hints.
  - Returns JSON transcript with words/timestamps, not audio.

- Sound effects:
  - Endpoint: `POST /v1/sound-generation`
  - JSON input `text`.
  - Optional `duration_seconds`, `loop`, `prompt_influence`, `model_id`.
  - Duration range in current API reference is 0.5 to 30 seconds.
  - Returns generated audio.

- Voice isolator:
  - Endpoint: `POST /v1/audio-isolation`
  - Multipart input `audio`.
  - Supports audio and video source formats.
  - Docs say up to 500 MB and 1 hour in capability docs.
  - Returns isolated audio.

- ElevenAgents:
  - Coordinates STT, LLM, TTS, and turn-taking.
  - Provides configuration, widgets, React SDK, WebSocket API, tools, knowledge base, analytics.
  - This is not a one-shot media model. It should become a separate provider/capability surface for real-time or session-based voice agents.

## Skill Decision

Add matching SmartSpec skills, but keep them thin:

- Skills should describe intent, inputs, safety hints, and route to the model/provider flow.
- Skills should not call ElevenLabs directly from the frontend.
- Skills are useful for Chat/Agency/Team routing and prompt building:
  - `elevenlabs-text-to-speech`
  - `elevenlabs-voice-changer`
  - `elevenlabs-speech-to-text`
  - `elevenlabs-sound-effects`
  - `elevenlabs-voice-isolator`
- The implementation can seed skills after the provider/model path is working. Skills should reuse the same model IDs and `inputFields`.

## Open Questions

Resolved for MVP:

1. Speech-to-Text stores full transcript JSON and plain text in `media_tasks.resultData`; library/subtitle assets are a follow-up.
2. Direct ElevenLabs TTS starts with manual `voice_id` plus common defaults; dynamic `/v1/voices` search is phase 2.
3. Direct ElevenLabs should follow the existing Node-to-Python media gateway pattern so credit, audit, and task lifecycle behavior stays consistent.
4. Generated transcripts are rendered in Media Studio/history in the first implementation; Video Editor subtitle attachment is phase 2.

Remaining later questions:

1. Which ElevenLabs voice catalog fields should be cached and searched when `/v1/voices` is added?
2. Should STT word timestamps become subtitle clips automatically or require user confirmation?
