# OmniVoice Implementation Plan

## Objective

Turn the OmniVoice follow-on spec for Feature 075 into a practical delivery path that starts with the safest shared abstraction and grows outward to media and desktop surfaces.

The implementation order in this plan intentionally matches the architecture decisions in `spec-omnivoice-follow-on.md`:

1. provider contract and gateway
2. media narration and voice assets
3. optional desktop premium readback
4. governance, rollout, and regression closure

## Current-codebase fit

Primary integration points:

- internal TTS gateway
  - `apps/web/server/services/ttsService.ts`
  - `python-backend/app/api/stt.py`
  - `python-backend/app/llm_proxy/unified_client.py`
- provider initialization and configuration
  - `python-backend/app/services/media_provider_service.py`
  - `python-backend/app/core/config.py`
- audio model metadata and media generation contracts
  - `python-backend/app/core/media_models.py`
  - `python-backend/app/services/generation/models.py`
  - `apps/web/server/services/mediaGenerationService.ts`
- desktop spoken readback
  - `apps/tauri-shell/src-tauri/src/local_skill_runtime.rs`
  - `apps/web/client/src/features/local-ai/voice/localVoiceReadback.ts`

## Implementation phases

### 1. Gateway and provider contract

- add `omnivoice` to the internal TTS request vocabulary
- add backend validation and explicit unsupported/unconfigured failure modes
- introduce an OmniVoice provider adapter so `UnifiedLLMClient` does not accumulate inline provider-specific HTTP logic
- keep the initial OmniVoice adapter self-hosted/service-oriented rather than bundling model runtime assumptions into the Python API surface
- expose a stable request envelope that can later support:
  - plain TTS
  - voice design
  - optional cloning inputs

### 2. Shared model metadata

- add OmniVoice entries to audio model metadata so UI and server code can reason about it consistently
- keep the first model family intentionally narrow and narration-oriented
- distinguish standard TTS capability from cloning-capable capability in metadata rather than relying on UI heuristics

### 3. Media and narration productization

- add OmniVoice-backed model entries for narration and voice assets
- connect the provider to presentation narration and reusable audio generation flows
- add provenance metadata for reference audio and cloned outputs
- preserve fallback to existing ElevenLabs and UVoice paths

### 4. Desktop premium readback

- add an optional Desktop Host OmniVoice runtime path
- keep current native TTS fallback as the default safety net
- expose capability state in Settings and runtime availability contracts
- gate all local OmniVoice runtime use behind:
  - package trust
  - policy approval
  - device capability
  - rollout flags

### 5. Governance and rollout closure

- add policy switches for plain OmniVoice TTS vs cloning
- add run and asset metadata for provider, locality, and cloning provenance
- add rollout phases for:
  - backend-only support
  - narration/media enablement
  - desktop premium readback pilot
- add regression coverage that proves fallback paths remain truthful and functional

## Recommended file additions

- `python-backend/app/llm_proxy/providers/omnivoice_provider.py`
- optional future runtime/packaging additions under:
  - `apps/tauri-shell/src-tauri/src/*`
  - Desktop Host package materialization artifacts

## Risks and mitigations

### Risk: OmniVoice introduces a parallel, ad hoc voice path

Mitigation:

- force all first-stage integration through `/api/internal/tts` and `UnifiedLLMClient`
- add a provider adapter instead of bespoke endpoint logic in every layer

### Risk: provider contract is too generic for cloning later

Mitigation:

- add request vocabulary that can evolve cleanly for cloning and voice design
- keep cloning policy and validation separate from plain TTS

### Risk: desktop packaging pressure arrives too early

Mitigation:

- do not block backend and media value on desktop-local runtime work
- keep desktop premium readback as an explicit later slice

### Risk: locality and trust labels drift

Mitigation:

- record provider and locality explicitly in run and asset metadata
- keep native/browser fallback labeling separate from OmniVoice provider labeling

## Deliverable quality bar

Before broad rollout, the team should be able to answer:

- which spoken outputs came from OmniVoice?
- whether cloning was involved
- whether the result was server-side or desktop-local
- why a device was allowed or not allowed to run local OmniVoice
- which fallback path was used when OmniVoice was unavailable
