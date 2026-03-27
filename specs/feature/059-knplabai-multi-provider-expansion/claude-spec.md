# KNPLabs AI Multi-Provider Expansion

## Summary

Add **KNPLabs AI** as a new provider across the SmartSpecPro stack:

- LLM chat completions in the web backend
- media generation in the Python backend
- text-to-speech in the internal audio pipeline
- embeddings as an explicit opt-in path

Use the normalized provider key `knplabai` in code and database records, with the display name `KNPLabs AI`.

## Functional Requirements

### 1. LLM chat completions

- Register KNPLabs as an LLM provider in the web backend.
- Point the provider at the OpenAI-compatible endpoint `https://api.knplabai.com/ai/v1`.
- Seed the KNPLabs LLM model catalog into `modelProviderMap`.
- Include the GPT, Claude, Gemini, Grok, DeepSeek, MiniMax, Qwen, KIMI, and MiMo model rows listed in the feature spec.
- Keep provider health, routing, and fallback behavior aligned with the existing `llmRouter.ts` flow.

### 2. Media generation

- Add a KNPLabs media provider configuration to the shared media provider registry.
- Seed KNPLabs image, video, audio/TTS, and embedding models into the media model catalog.
- Keep the new models disabled by default until an admin enables them.
- Expose the provider and its models in the admin media UI.

### 3. Python media provider

- Implement a KNPLabs Python provider class under `python-backend/app/llm_proxy/providers/`.
- The class should support:
  - OpenAI-compatible image generation
  - Gemini-native image generation for Nano Banana-style models
  - OpenAI-compatible video generation
  - async polling for long-running video tasks
  - TTS generation
  - embeddings generation
- Use security controls similar to the existing fal.ai provider:
  - allowlists
  - prompt sanitization
  - response size caps
  - redirect blocking
  - explicit client cleanup

### 4. TTS

- Extend the internal TTS pipeline so KNPLabs can be selected explicitly.
- Keep the existing max-character guard.
- Validate voice and output-format values before sending the request.
- Return raw audio bytes with the correct content type.

### 5. Embeddings

- Add KNPLabs embeddings as an explicit route.
- Do not make KNPLabs the implicit fallback for the existing embedding service.
- Validate returned vector dimensions before handing results back to callers.

### 6. Cost and credits

- Convert KNPLabs pricing from the provider’s credit sheet into the app’s internal credit system using Decimal-based arithmetic.
- Continue using the existing user credit ledger and pre-flight affordability checks.
- Do not change the user-facing credit unit conversion rules.

### 7. Admin UI

- Add KNPLabs to the media provider admin templates and provider cards.
- Add KNPLabs to any LLM provider admin template/icon mapping that is provider-name based.
- Keep the admin UI capable of creating, editing, testing, and enabling/disabling the new provider.

### 8. Validation and safety

- Preserve the existing SSRF protections for any remote image/video inputs.
- Validate model IDs before forwarding requests.
- Reject unsupported content formats and malformed upstream payloads.
- Keep KNPLabs traffic isolated from the existing Kie.ai/fal.ai/BytePlus/UVoice behavior.

## Non-Functional Constraints

- Existing provider behavior must remain unchanged for current models.
- KNPLabs should be additive, not a replacement.
- New models should not become selectable until they are seeded and explicitly enabled.
- Existing test harnesses must continue to work with `pytest` and `vitest`.

