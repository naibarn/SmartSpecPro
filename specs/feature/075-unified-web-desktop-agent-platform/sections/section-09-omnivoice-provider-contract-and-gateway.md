# Section 09: OmniVoice Provider Contract and Gateway

## Ownership

This section owns the first-class OmniVoice integration into the existing SmartAIHub TTS gateway and provider contracts.

## Target files and modules

- `apps/web/server/services/ttsService.ts`
- `python-backend/app/api/stt.py`
- `python-backend/app/llm_proxy/unified_client.py`
- `python-backend/app/core/media_models.py`
- `python-backend/app/services/generation/models.py`
- `apps/web/server/services/__tests__/ttsService.test.ts`
- `python-backend/tests/*tts*`

## Scope

- add `omnivoice` as a supported TTS provider through the internal gateway
- define request validation for:
  - plain TTS
  - voice design prompts
  - optional voice-cloning inputs
- define provider capability reporting and stable error handling
- ensure provider selection does not break existing OpenAI, ElevenLabs, or UVoice paths

## Implementation notes

- reuse the current `/api/internal/tts` contract rather than introducing a parallel voice gateway
- keep provider arguments explicit and machine-readable so UI, billing, and audit can remain truthful
- if OmniVoice deployment requires a sidecar or worker process, hide that behind the backend provider adapter rather than exposing a new public product abstraction
- split cloning-specific validation from plain TTS validation so policy can treat them differently

## TDD expectations

- write request-validation tests before provider wiring
- write unsupported-provider tests before happy-path OmniVoice calls
- write fallback-preservation tests for existing providers before enabling OmniVoice by default anywhere
- write contract tests for provider capability metadata before UI consumption

## Acceptance checks

- `omnivoice` is a supported provider in the internal TTS route
- the gateway can distinguish plain TTS from voice-cloning-capable requests
- existing providers continue to behave unchanged
- provider errors are actionable and do not leak raw runtime internals

## Risks and coordination notes

- avoid letting cloning-only fields pollute every generic TTS use case
- do not make backend sync latency assumptions until real runtime timings are measured
