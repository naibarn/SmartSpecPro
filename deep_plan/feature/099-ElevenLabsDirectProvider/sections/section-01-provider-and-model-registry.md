# Section 01: Provider and Model Registry

## Goal

Add ElevenLabs as a direct first-class media provider and seed the requested models.

## Files

- `apps/web/server/routers/mediaProviders.ts`
- `apps/web/scripts/seed-media-providers.ts`
- `apps/web/scripts/__tests__/seed-media-providers.test.ts`
- `apps/web/server/routers/mediaProviders.test.ts`
- `apps/web/server/services/mediaProviderUtils.ts`
- `apps/web/server/services/mediaProviderUtils.test.ts`
- `apps/web/scripts/seed-media-models-elevenlabs.ts` (new)
- `apps/web/server/services/modelRegistry.ts`

## Model IDs

Use stable direct-provider IDs:

- `elevenlabs/voice-changer`
- `elevenlabs/text-to-speech`
- `elevenlabs/speech-to-text`
- `elevenlabs/sound-effects`
- `elevenlabs/voice-isolator`

## Provider Template

Add provider:

- `providerName`: `elevenlabs`
- `displayName`: `ElevenLabs`
- `providerType`: `audio`
- `baseUrl`: `https://api.elevenlabs.io`
- `defaultModel`: `elevenlabs/text-to-speech`
- Auth header: `xi-api-key`

Add provider test helper:

- Function: `testElevenLabs(apiKey, baseUrl)`
- Preferred validation endpoint: `GET /v1/user/subscription`
- Fallback validation endpoint if subscription endpoint is unavailable: `GET /v1/voices`
- Must send `xi-api-key` header only server-side.
- Must return structured status with a friendly setup message and provider response detail trimmed to a safe length.

## Model Config Shape

Each seed should include:

- `apiPayloadFormat: "elevenlabs"`
- `providerModelId`
- `elevenlabsCapability`
- `apiEndpoint`
- `apiMethod`
- `requestContentType`: `json` or `multipart`
- `responseType`: `audio` or `json`
- `inputFields`
- `pricingFormula`
- `pricingTiers` or explicit estimate notes

## Model Config Details

### `elevenlabs/text-to-speech`

- `apiEndpoint`: `/v1/text-to-speech/{voice_id}`
- `requestContentType`: `json`
- `responseType`: `audio`
- `elevenlabsCapability`: `text_to_speech`
- Required fields:
  - `text` synced with prompt
  - `voice_id` default/manual select
- Optional fields:
  - `model_id` default `eleven_multilingual_v2`
  - `output_format`
  - `language_code`
  - `stability`
  - `similarity_boost`
  - `style`
  - `use_speaker_boost`

### `elevenlabs/voice-changer`

- `apiEndpoint`: `/v1/speech-to-speech/{voice_id}`
- `requestContentType`: `multipart`
- `responseType`: `audio`
- `elevenlabsCapability`: `voice_changer`
- Required fields:
  - `audio` as one source file URL
  - `voice_id`
- Optional fields:
  - `model_id` default `eleven_multilingual_sts_v2`
  - `remove_background_noise`
  - voice settings fields

### `elevenlabs/speech-to-text`

- `apiEndpoint`: `/v1/speech-to-text`
- `requestContentType`: `multipart`
- `responseType`: `json`
- `elevenlabsCapability`: `speech_to_text`
- Required fields:
  - `file` as one source audio/video URL
  - `model_id` default `scribe_v2`
- Optional fields:
  - `language_code`
  - `diarize`
  - `timestamps_granularity`
  - `tag_audio_events`
  - `keyterms`

### `elevenlabs/sound-effects`

- `apiEndpoint`: `/v1/sound-generation`
- `requestContentType`: `json`
- `responseType`: `audio`
- `elevenlabsCapability`: `sound_effects`
- Required fields:
  - `text` synced with prompt
- Optional fields:
  - `duration_seconds`
  - `loop`
  - `prompt_influence`
  - `output_format`

### `elevenlabs/voice-isolator`

- `apiEndpoint`: `/v1/audio-isolation`
- `requestContentType`: `multipart`
- `responseType`: `audio`
- `elevenlabsCapability`: `voice_isolator`
- Required fields:
  - `audio` as one source audio/video URL
- Optional fields:
  - `output_format`

## Pricing and Credit Strategy

Use conservative local estimates until usage reconciliation is available:

- `text_to_speech`: `per_unit` by characters, unit size 1000.
- `sound_effects`: `per_unit` by seconds, unit size 1 second, with a minimum unit.
- `voice_changer`: `per_unit` by estimated input duration minutes, with a minimum unit. If duration is unknown, charge a safe flat default.
- `voice_isolator`: `per_unit` by estimated input duration minutes, with a minimum unit. If duration is unknown, charge a safe flat default.
- `speech_to_text`: `per_unit` by estimated input duration minutes, with a minimum unit. If duration is unknown, charge a safe flat default.

Include `pricingUnitField`, `pricingUnitMetric`, `pricingUnitSize`, and `pricingMinUnits` in `configJson` wherever possible.

## Seed Defaults

- Models should be present in the catalog and provider templates.
- Provider should be disabled until an admin adds an API key.
- Model rows can be `isEnabled: true`; actual execution remains provider-gated by provider config.
- If the codebase convention prefers disabled-by-default external models, keep the models disabled and document the admin enable step in the seed output.

## TDD

1. Test provider template includes ElevenLabs with base URL and all 5 available models.
2. Test `buildElevenLabsModelSeeds()` returns all 5 requested models.
3. Test model configs include correct endpoint/content type/response type.
4. Test provider normalization maps `elevenlabs`, `eleven_labs`, and `elevenlabs_ai` to `elevenlabs`.
5. Test provider validation calls ElevenLabs with `xi-api-key`, never `Authorization`.
6. Test pricing metadata exists for all 5 model configs.
