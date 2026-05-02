# Section 02: Backend ElevenLabs Client

## Goal

Add direct ElevenLabs execution without routing through Kie.ai or WaveSpeed.

## Files

- `python-backend/app/llm_proxy/providers/elevenlabs_media_provider.py` (new)
- `python-backend/app/llm_proxy/gateway_unified.py`
- `python-backend/app/services/media_provider_service.py`
- `apps/web/server/services/mediaGenerationService.ts`
- `apps/web/server/routers/media.ts`

## Client Responsibilities

Implement provider methods:

- `generate_text_to_speech(payload) -> audio bytes`
- `generate_sound_effect(payload) -> audio bytes`
- `convert_voice(audio source, options) -> audio bytes`
- `isolate_voice(audio source, options) -> audio bytes`
- `transcribe(audio/video source, options) -> JSON transcript`

Provider class contract:

- Constructor accepts `api_key`, `base_url`, and optional `timeout`.
- Public methods must not know about SmartSpec credits or DB models.
- Request-building helpers should be individually unit-testable.
- HTTP errors should preserve ElevenLabs status code and a short provider message.
- API key must never be included in logs, exceptions, debug snapshots, or task metadata.

## Request Handling

- Resolve relative `/uploads` or library URLs into fetchable public URLs in Node before Python submission.
- Python provider downloads source media server-side for multipart requests.
- Validate public URLs before downloading to avoid SSRF.
- Support direct uploaded file URL, not raw browser file object.
- Stream or buffer binary responses and upload them to existing R2/media artifact storage.

## Binary Artifact Storage Contract

For audio-producing capabilities:

1. Python receives or fetches the source media if required.
2. Python calls ElevenLabs and receives binary audio.
3. Python determines output content type and extension:
   - Prefer `Content-Type` header.
   - Else infer from requested `output_format`.
   - Else fallback to `audio/mpeg` and `.mp3`.
4. Python uploads bytes with the existing media storage helper used by other binary providers.
5. Gateway returns `AudioGenerationResponse.data[0].url`.
6. The media task stores:
   - `result_url`
   - `result_data.provider = "elevenlabs"`
   - `result_data.capability`
   - `result_data.content_type`
   - `result_data.output_format`

If upload fails, the task fails and reserved credits are refunded through the existing async failure path.

## Source Media Download Contract

- Download only `http` or `https` public-safe URLs.
- Reject private IPs, localhost, `.local`, `.internal`, and traversal-like paths.
- Enforce maximum download size where practical:
  - Voice changer: 5 minutes or configured byte limit.
  - Voice isolator: configurable byte limit aligned with docs.
  - STT: configurable byte limit.
- Preserve original filename/content type when building multipart payloads.

## Routing

In gateway routing:

- Route `provider == "elevenlabs"` to the new provider.
- For audio outputs, upload bytes and return `AudioGenerationResponse` with URL.
- For STT, do not pretend the response is an audio file. Return a structured result payload consumed by the media task layer; see Section 03.

Preferred implementation:

- Add a provider capability dispatch function, for example `execute_elevenlabs_media(request, user)`.
- `generate_audio` can call it for audio-producing capabilities.
- STT branch can use the same dispatch function but must return transcript-specific response data.
- Keep Node router input as `media.generateAudioAsync` for MVP only if response handling is updated to accept `artifactKind: "transcript"`.

## Request Mapping

- `extraParams.text` or top-level `text` maps to ElevenLabs `text`.
- `extraParams.voice_id` maps to path parameter for TTS/voice-changer.
- `extraParams.audio` maps to multipart `audio`.
- `extraParams.file` maps to multipart `file` for STT.
- `extraParams.model_id` passes through as ElevenLabs `model_id`.
- Boolean and numeric fields must be normalized to the type expected by ElevenLabs before request submission.

## TDD

1. Unit test TTS builds `POST /v1/text-to-speech/:voice_id`.
2. Unit test voice changer builds multipart `POST /v1/speech-to-speech/:voice_id`.
3. Unit test sound effects builds `POST /v1/sound-generation`.
4. Unit test voice isolator builds multipart `POST /v1/audio-isolation`.
5. Unit test STT builds multipart `POST /v1/speech-to-text`.
6. Unit test errors preserve provider response details without leaking API keys.
7. Unit test binary response upload returns a media URL and metadata.
8. Unit test private source URLs are rejected before provider call.
9. Unit test STT JSON returns transcript payload without requiring `resultUrl`.
