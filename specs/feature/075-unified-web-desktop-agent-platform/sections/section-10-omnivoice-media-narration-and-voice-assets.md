# Section 10: OmniVoice Media Narration and Voice Assets

## Ownership

This section owns the productization of OmniVoice in the media stack, with narration and multilingual voice assets as the first high-value user-facing surface.

## Target files and modules

- `python-backend/app/core/media_models.py`
- `python-backend/app/services/generation/models.py`
- `apps/web/server/services/mediaGenerationService.ts`
- `apps/web/server/services/presentationService.ts`
- `apps/web/client/src/components/presentation/*`
- media provider/model admin surfaces under `apps/web/server/routers/*` and `apps/web/client/src/pages/*`

## Scope

- add OmniVoice-backed audio model entries for narration-focused flows
- support multilingual narration and optional voice-cloning-backed audio assets
- define provenance metadata for reference audio and generated outputs
- expose the capability in presentation and media workflows before general chat readback expansion

## Implementation notes

- prefer narration, presentation audio, and reusable voice assets before general-purpose arbitrary TTS UI expansion
- voice cloning must require an explicit approved reference asset instead of raw pasted file blobs with no provenance
- generated audio should preserve enough metadata to support later audit, filtering, and rerender decisions
- model naming should be product-readable rather than exposing low-level runtime details to end users

## TDD expectations

- write model-registry tests before UI wiring
- write narration-validation tests before generation execution changes
- write provenance tests for cloning flows before enabling save/share/export behavior
- write downgrade-path tests for when OmniVoice is configured but unavailable

## Acceptance checks

- narration-capable audio models backed by OmniVoice appear through the normal media model surfaces
- presentation generation can choose OmniVoice without bypassing current provider contracts
- cloned-voice outputs record provenance and remain policy-governable
- users can still fall back to existing audio models

## Risks and coordination notes

- do not couple narration UX to desktop-local runtime assumptions
- avoid exposing cloning to tenants that have not enabled it contractually or by policy
