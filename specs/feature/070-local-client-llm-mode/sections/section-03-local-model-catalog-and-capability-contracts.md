# Section 03: Local Model Catalog and Capability Contracts

## Purpose

Create the dedicated local model catalog, capability contract, and revocation rules that decide whether a device can even attempt local execution.

## Ownership

- authenticated Local AI catalog/policy endpoint
- tenant-filtered local profile registry
- capability result contract
- revocation and supersession behavior

## Target files

- `apps/web/server/routers/localAi.ts`
- `apps/web/server/services/localAiCatalog.ts`
- `apps/web/server/services/localAiPolicy.ts`
- `apps/web/client/src/features/local-ai/model-registry/models.ts`
- `apps/web/client/src/features/local-ai/types/capability.ts`
- `packages/local-ai-core/capability/`

## Implementation notes

1. Create a dedicated authenticated Local AI router or equivalent endpoint group.
   Required server operations:
   - `localAi.getPolicyAndCatalog`
   - optional `localAi.recordCapabilitySnapshot` only if the team needs advisory device metrics

2. Keep the local model catalog separate from `llmProviders.availableModels`.
   The catalog must not leak into:
   - translation model pickers
   - generic cloud model selection
   - provider auto-selection surfaces
   - team `defaultModelId` or member `preferredModelId` selectors used by orchestration flows

3. Each catalog entry should carry enough data for routing and downloads:
   - profile ID
   - family
   - exact Gemma 4 variant such as `E2B` or `E4B`
   - supported platforms
   - runtime family
   - minimum runtime requirements such as required WebGPU limits/features for browser-local profiles
   - approximate size
   - whether download is required
   - modality support including whether short local audio/voice input is supported
   - short-audio contract metadata such as `maxClipSeconds` and `expectedAudioFormat`
   - integrity manifest metadata
   - rollout maturity such as `validated`, `experimental`, or `disabled`
   - revoked / denied / allowed state

   The initial Gemma 4 profile matrix should be explicit:
   - browser validated profile: `gemma4-e2b-web-fast`
   - browser experimental candidate: `gemma4-e4b-web-balanced`
   - desktop primary profile: `gemma4-e4b-tauri-balanced`
   - desktop fallback profile: `gemma4-e2b-tauri-fast`
   - Gemma 4 26B / 31B profiles remain out of v1 scope

4. Filter the catalog through tenant policy before it reaches the client.
   - force-cloud-only tenants should still be able to receive a disabled policy object if the UI needs to explain the lockout
   - local profile allowlists must be enforced on the server, not only hidden in the client

5. Define a typed capability result that later browser and Tauri adapters consume.
   The contract should include:
   - `supported`
   - `platform`
   - `secureContext`
   - `webgpu`
   - `webgpuAdapterAvailable`
   - `webgpuProfileRequirementsMet`
   - `eligibleProfiles`
   - `eligibleVoiceProfiles`
   - `reasons`
   - storage estimate if known

   Web-specific expectation:
   - do not treat `navigator.gpu` presence alone as runtime-ready
   - the contract should be able to distinguish "browser exposes WebGPU" from "selected profile can actually initialize on this adapter/device"
   - the contract should also distinguish "device is theoretically capable" from "SmartSpecPro build includes the approved Gemma 4 browser runtime stack for this profile"

6. Make revocation behavior explicit.
   - Refresh policy/catalog when Local AI settings open.
   - Refresh before install attempts.
   - Refresh at Tauri startup when installed profiles exist.
   - If a stored default profile is revoked or no longer allowlisted, later sections must route cloud and show the profile as unavailable.

7. Keep this section limited to contracts and registry logic.
   - Do not implement browser worker code here.
   - Do not implement chat save-path behavior here.
   - Do not repurpose team-service model policy fields as Local AI profile storage in v1.
   - Do not let voice-capable local profiles silently replace the existing legacy STT provider path without an explicit user/provider selection contract.

## TDD expectations

- Add server tests proving local profiles are filtered by tenant allowlist and force-cloud-only policy.
- Add tests proving local profiles do not appear in team orchestration model pickers by default.
- Add tests proving revoked profiles do not appear as routable even if they were previously selected.
- Add contract tests for capability results so unknown fields do not silently change routing semantics.
- Add contract tests covering `navigator.gpu` present but adapter/device/profile requirement checks failing.

## Acceptance checks

- The app has a dedicated Local AI catalog surface separate from cloud model lists.
- Team-service model selectors remain separate from the Local AI catalog in v1.
- Tenant policy can hide or disable local profiles authoritatively.
- Revoked profiles are marked unusable on refresh.
- Shared capability types are stable enough for browser and Tauri adapters to consume.

## Coordination notes

- Section 04 consumes the router inputs and catalog output.
- Section 05 consumes capability types and catalog install metadata.
- Section 06 consumes the same contract for Tauri storage/runtime decisions.
- Section 08 consumes the same contract for Team Room and workflow-surface parity.
