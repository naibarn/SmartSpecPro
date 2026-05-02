# Feature 099: Direct ElevenLabs Media Provider

## Request

Add a direct ElevenLabs media provider, independent from Kie.ai and WaveSpeed, with these media AI models:

- `elevenlabs/voice-changer`
- `elevenlabs/text-to-speech`
- `elevenlabs/speech-to-text`
- `elevenlabs/sound-effects`
- `elevenlabs/voice-isolator`

Also evaluate whether matching SmartSpec skills should be added, and evaluate a future integration path for ElevenAgents.

## Product Goals

1. Users can configure ElevenLabs as a first-class provider in Admin > Media Providers.
2. Media Studio can expose the supported ElevenLabs workflows with clear UI:
   - Text-to-speech: text to audio.
   - Voice changer: source audio to transformed voice.
   - Speech-to-text: source audio/video to transcript/subtitles.
   - Sound effects: prompt to generated effect audio.
   - Voice isolator: source audio/video to cleaned speech audio.
3. The backend routes requests directly to ElevenLabs APIs using the configured provider API key.
4. Existing Kie.ai, WaveSpeed, UVoice, fal.ai, OmniVoice, and KNPLabs flows continue to work unchanged.
5. Skill support is added only where it improves routing, prompts, and workflow clarity without duplicating Media Studio forms.
6. ElevenAgents is planned as a separate conversational agent capability, not mixed into one-shot media generation.

## Constraints

- This feature touches provider config, model registry/seeds, backend media service routing, binary/multipart request handling, UI mode selection, tests, and potentially skills.
- Direct ElevenLabs APIs are heterogeneous:
  - TTS and sound effects use JSON and return binary audio.
  - Voice changer, STT, and voice isolator use multipart file uploads.
  - STT returns JSON transcript rather than an audio file.
- Media task result storage currently expects media URLs for most audio flows, so transcript artifacts need an explicit result strategy.
- Existing worktree has many dirty files. Implementation must be surgical and must not revert unrelated changes.

## Initial Decisions

- Write this deep-plan before implementation because the blast radius is high.
- Add skills metadata, but keep the runtime execution path model/provider-driven first.
- Treat ElevenAgents as a later feature area: agent configuration, real-time sessions, transcripts, and tool-calling need separate contracts.
- Speech-to-text MVP stores transcript data in the media task `resultData` contract and does not require an audio `resultUrl`.
- Direct ElevenLabs models should be seeded enabled in the model catalog but provider-gated: generation is blocked with a clear setup message until the `elevenlabs` provider has an API key and is enabled.
- Direct ElevenLabs TTS starts with manual/common `voice_id` options. Dynamic voice listing from `/v1/voices` is a follow-up after the provider is stable.

## Implementation Guardrails

- Do not expose ElevenLabs API keys to the frontend.
- Do not reuse WaveSpeed provider code for direct ElevenLabs calls; create a provider-specific execution path because request and response contracts differ.
- Source media URLs must be public-safe and must pass the same SSRF protections as other media providers.
- All binary audio results must be persisted through the existing media artifact upload path before task completion.
- STT transcript results must render in Media Studio and media history even when there is no audio player.
