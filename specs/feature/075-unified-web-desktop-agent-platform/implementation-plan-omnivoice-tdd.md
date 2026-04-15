# OmniVoice Implementation Plan TDD

## Test-first strategy

Lock the highest-risk OmniVoice boundaries first:

1. provider contract and request validation
2. gateway/provider routing and unconfigured behavior
3. shared audio model metadata
4. media narration integration
5. desktop capability and fallback behavior
6. governance, provenance, and rollout flags

## 1. Gateway contract tests first

Add tests that prove:

- `omnivoice` is accepted by the internal TTS route
- unsupported providers still fail with `400`
- text length limits remain unchanged
- the internal route forwards OmniVoice requests into `UnifiedLLMClient`
- unconfigured OmniVoice returns a stable actionable failure

Expected initial failing condition:

- `/api/internal/tts` does not accept `omnivoice`

## 2. Provider adapter tests

Add tests for:

- required base URL validation
- request payload construction for plain TTS
- optional voice design field forwarding
- optional cloning field forwarding
- response parsing for direct audio bytes and URL-based audio fetches
- upstream error mapping

Expected initial failing condition:

- no OmniVoice provider adapter exists

## 3. Web service contract tests

Add tests for:

- `apps/web/server/services/ttsService.ts` forwarding `provider: "omnivoice"`
- default provider behavior remains unchanged
- OmniVoice requests preserve text, voice, speed, and future-safe extension fields

Expected initial failing condition:

- the web service provider union does not include OmniVoice

## 4. Shared model metadata tests

Add tests for:

- OmniVoice audio model presence in shared audio registries
- provider/type metadata consistency
- fallback/default behavior when OmniVoice is disabled or absent

Expected initial failing condition:

- no OmniVoice model metadata exists

## 5. Media and narration tests

Add tests for:

- narration model selection and validation when OmniVoice is enabled
- provenance handling for cloning-capable requests
- fallback to existing audio providers when OmniVoice generation is unavailable

Expected initial failing condition:

- media flows do not yet understand OmniVoice-backed narration models

## 6. Desktop capability and fallback tests

Add tests for:

- OmniVoice desktop capability unavailable -> native TTS fallback
- package trust or policy invalid -> fail closed
- truthful capability labels in Settings/runtime status

Expected initial failing condition:

- desktop runtime does not have an OmniVoice capability contract

## 7. Governance and rollout tests

Add tests for:

- separate policy control for cloning vs plain TTS
- run/asset provenance persistence
- rollout flags for backend-only, media, and desktop-local phases
- regression coverage that preserves native/browser fallback

Expected initial failing condition:

- OmniVoice rollout and provenance are not yet represented
