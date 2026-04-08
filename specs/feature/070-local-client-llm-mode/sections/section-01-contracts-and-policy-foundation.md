# Section 01: Contracts and Policy Foundation

## Purpose

Lay down the shared contracts and rollout controls that make Local / Client LLM Mode safe to add without destabilizing the existing cloud-only product.

## Ownership

- tenant feature-flag and rollout policy plumbing
- shared Local AI runtime types
- database and schema contract changes
- durable message metadata foundation
- Team Room runtime disclosure and policy-boundary contracts

## Target files

- `apps/web/shared/featureFlags.ts`
- `apps/web/server/services/featureFlags.ts`
- `apps/web/server/services/tenantFeatureFlagService.ts`
- `apps/web/drizzle/schema.ts`
- `apps/web/drizzle/migrations/*` for `messages.runtimeMetadata`
- `apps/web/server/services/teamService.ts`
- `packages/local-ai-core/runtime-types/`
- `packages/local-ai-core/routing/`

## Implementation notes

1. Add the new tenant feature flag `localClientLlmMode` with default `false`.
   - Update `TenantFeatureFlags`.
   - Update `ALLOWED_FEATURE_FLAGS`.
   - Update `FEATURE_FLAG_DEFAULTS`.
   - Keep unknown-key stripping behavior intact so rollout remains closed-world.

2. Define the shared runtime vocabulary in `packages/local-ai-core`.
   - `LocalAiExecutionMode`
- `LocalAiTaskClass`
- `CapabilityResult`
- `RuntimeDecisionEnvelope`
- `MessageRuntimeMetadata`
- `TeamRoomRuntimeMetadata`
- `LocalAiConversationOverride`
   Use one authoritative naming set so later sections do not invent mismatched field names.

3. Extend the Drizzle schema for two persistence needs:
   - `users.userPreferences.localAi` as a typed JSON extension with safe defaults at read time
   - `messages.runtimeMetadata` as a nullable JSON column or equivalent side-table contract
   - typed use of `team_room_messages.metadataJson.runtimeDisclosure` without forcing a first-pass table redesign
   - preserve any executor/debug metadata under a separate key so it does not collide with UI disclosure

4. Keep the migration conservative.
   - Do not create a new table for synced preferences in v1.
   - Add only the durable runtime metadata storage needed for reload-safe badges and audit-safe routing context.
   - Existing rows must continue to behave as legacy cloud records when `runtimeMetadata` is `null`.

5. Define the `localAiConversation` subdocument contract that later chat mutations will write into `conversations.skillSettings`.
   - The contract must be namespaced so it cannot clobber `llmSelection` or unrelated skill settings.

6. Preserve the orchestration policy boundary.
   - `assistantTeams.defaultModelId`, `assistantTeams.memoryPolicyJson`, member `preferredModelId`, `modelSelectionPolicy`, and member `memoryPolicyJson` remain server-orchestrator contracts in v1.
   - This section should document that Local AI profiles do not silently reuse those fields.

7. Document authoritative vs advisory data in the shared types.
   - Client runtime claims are advisory.
   - Server-authored metadata is authoritative.
   - `source` is restricted to `hybrid` or `cloud` for v1 durable records.

8. Keep this section as the single owner of shared contract changes.
   - Later sections may consume these types and fields.
   - Later sections should not redefine them.

## TDD expectations

- Start with tenant flag validation tests so the new flag fails until typed allowlists are updated.
- Add schema-level or service-level tests proving legacy messages with `runtimeMetadata = null` still read safely.
- Add contract tests for runtime metadata shape stability so later sections cannot drift field names.
- Add contract tests proving team orchestration policy fields remain distinct from Local AI profile types.

## Acceptance checks

- `localClientLlmMode` exists and defaults to `false`.
- Unknown local-AI tenant flags are still rejected or stripped.
- Shared runtime types exist in `packages/local-ai-core` and are importable from server and client code.
- `messages.runtimeMetadata` can persist `hybrid` and `cloud` data without breaking old message reads.
- Team Room runtime disclosure has one shared type vocabulary and does not require later sections to invent new field names.
- The plan keeps Local AI profiles separate from team orchestration policy fields.
- No section after this one needs to invent new core naming for modes, task classes, or runtime metadata fields.

## Coordination notes

- Section 02 consumes the `localAi` synced preference contract.
- Section 03 consumes capability and routing type names.
- Section 04 consumes `MessageRuntimeMetadata` and `LocalAiConversationOverride`.
- Do not put Settings UI, browser runtime code, or OCR services into this section.
