# Section 01: Shared Contracts And Feature Flags

## Purpose

Create the shared contract layer that every later section depends on. This section must not activate the OpenAI Agents SDK runtime. It only introduces types, feature flags, runtime selection semantics, and import-boundary guard scaffolding.

## Depends On

- No prior section.

## Blocks

- All later sections.

## Files Owned By This Section

- `apps/web/shared/featureFlags.ts`
- `apps/web/shared/agentRuntime/types.ts`
- `apps/web/shared/agentRuntime/reviewVerdict.ts`
- `apps/web/shared/agentRuntime/runtimeEvents.ts`
- `apps/web/shared/agentRuntime/skillManifest.ts`
- `apps/web/server/services/agentRuntime/runtimeSelection.ts`
- `apps/web/server/services/agentRuntime/importBoundary.ts` or equivalent test helper
- `apps/web/shared/__tests__/openAiAgentsRuntimeFeatureFlags.test.ts`
- `apps/web/shared/__tests__/agentRuntimeTypes.test.ts`
- `apps/web/server/services/__tests__/agentRuntimeSelection.test.ts`

Do not modify Chat, Team, Python adapter, or database schema in this section except for imports needed by tests.

## Runtime Flags

Add these disabled-by-default tenant flags:

- `openAiAgentsRuntimeEnabled`
- `openAiAgentsRuntimeChatShadow`
- `openAiAgentsRuntimeTeamShadow`
- `openAiAgentsRuntimeChatActive`
- `openAiAgentsRuntimeTeamActive`
- `openAiAgentsRuntimeResponsesShadow`
- `openAiAgentsRuntimeResponsesActive`
- `openAiAgentsRuntimeSkillShadow`
- `openAiAgentsRuntimeSkillActive`
- `openAiAgentsRuntimeForceRollback`

Each flag must be added to:

- `TenantFeatureFlags`
- `ALLOWED_FEATURE_FLAGS`
- `FEATURE_FLAG_DEFAULTS`

All defaults must be `false`.

## Runtime Selection Contract

Create a runtime selection helper with stable outputs.

Inputs:

- surface: `chat`, `team`, `responses`, or `skill`
- `originSurface` when `surface = skill`, initially including `media_studio`
- `entryPoint` when `surface = skill`, initially including `enhance_prompt` and `execute_custom_skill`
- tenant feature flags
- existing frozen run decision, if present
- room override, if present or future-compatible
- requested operation mode, if any

Outputs:

- runtime engine: `legacy` or `openai_agents`
- runtime mode: `legacy`, `shadow`, or `active`
- selection reason
- flag snapshot
- frozen-at recommendation
- rollback reason when rollback wins

Precedence:

1. `openAiAgentsRuntimeForceRollback`
2. already-frozen run decision
3. room override, if available
4. tenant flags
5. platform defaults

Important behavior:

- Shadow mode is selected only when master enabled and the matching surface shadow flag is true.
- Active mode is selected only when master enabled and the matching surface active flag is true.
- Force rollback wins for new runtime choices.
- A frozen runtime decision must not switch because flags changed mid-flight.

## Shared DTOs

Create shared TypeScript DTOs for later sections. These should be plain shared types, enums, and lightweight schema helpers. They must not import server-only modules.

Minimum types:

- `AgentRuntimeSurface`
- `AgentRuntimeEngine`
- `AgentRuntimeMode`
- `AgentRuntimeRequest`
- `AgentRuntimeResponse`
- `AgentRuntimeEvent`
- `AgentRuntimeTraceEvent`
- `AgentRuntimeCheckpoint`
- `AgentExecutionEnvelope`
- `RuntimeModelConfig`
- `AgentContextEvidenceItem`
- `AgentRuntimePersonaSnapshot`
- `AgentRuntimeTeamMemberSnapshot`
- `AgentRuntimeStepAssignment`
- `AgentCapabilityManifest`
- `ReviewVerdict`
- `StepExecutionRecord`
- `RuntimeTerminalReason`
- `AgentRuntimeContractVersions`
- `AgentRuntimeStepLink`
- `AgentRuntimeOriginSurface`
- `AgentRuntimeEntryPoint`

`ReviewVerdict.status` values:

- `pass`
- `fail`
- `needs_repair`
- `blocked`

`RuntimeTerminalReason` values must include:

- `plan_completed`
- `step_failed_retry_exhausted`
- `review_failed_retry_exhausted`
- `approval_required`
- `approval_rejected`
- `budget_exhausted`
- `timeout_step`
- `timeout_run`
- `tool_denied`
- `permission_mismatch`
- `gateway_unavailable`
- `runtime_error`
- `rollback_forced`
- `plan_incomplete_cap_reached`

Context evidence trust levels:

- `trusted_platform`
- `tenant_authored`
- `retrieved_untrusted`
- `tool_generated_untrusted`
- `connector_generated_untrusted`

Contract version rules:

- `AgentRuntimeRequest`, `AgentRuntimeResponse`, `AgentRuntimeEvent`, and `AgentRuntimeCheckpoint` must all carry:
  - `runtimeContractVersion`
  - `traceSchemaVersion`
  - `checkpointSchemaVersion`
- the shared TypeScript contract layer must expose stable current-version constants and compatibility helpers
- the contract layer must define compatibility for `current` and `current - 1` versions during rolling deploy windows
- unsupported higher versions must fail closed with a structured `unsupported_contract_version` classification

Step-link schema rules:

- `AgentRuntimeStepLink` must include:
  - `linkType`
  - `stepKey`
  - `attemptId`
  - `traceId`
  - `checkpointId`
  - `messageId`
  - `anchorId`
  - `label`
  - `isPrimary`
- allowed `linkType` values must include:
  - `plan_summary`
  - `plan_step`
  - `owner_result`
  - `review_result`
  - `repair_result`
  - `checkpoint`
  - `terminal_result`
  - `execution_trace`

Persona snapshot rules:

- Chat requests must support `activePersonaId` plus a resolved `AgentRuntimePersonaSnapshot` when a conversation is persona-bound.
- Team requests must support a resolved roster of `AgentRuntimeTeamMemberSnapshot` entries for room members.
- Team step requests must support `AgentRuntimeStepAssignment` with `ownerMemberId`, `ownerPersonaId`, `reviewerMemberId`, and `reviewerPersonaId`.
- Persona snapshots must preserve both stable ids and user-facing display labels where available.
- The shared contract must describe persona provenance so replay/debug can tell whether the persona came from conversation override, user default, tenant default, platform default, or room member roster.
- The adapter may not require direct database lookups to re-resolve persona identity when the request already carries a valid snapshot.

## Import Boundary Guard Scaffolding

Create TypeScript-side test helper logic that can scan repository files for forbidden OpenAI Agents SDK imports.

Rules:

- Node/TypeScript must not import SDK package names.
- The cross-language Python import guard is implemented in section 03, where the Python adapter is introduced.

This section may add baseline tests before the adapter exists. It should fail any Node/TypeScript SDK import immediately.

## TDD Tests To Write First

Feature flag tests:

- Test all ten flags exist in `TenantFeatureFlags`.
- Test all ten flags exist in `ALLOWED_FEATURE_FLAGS`.
- Test all ten flags default to `false`.
- Test no flag typo is accepted by the allowlist.

Runtime selection tests:

- Test force rollback returns legacy for new Chat selection.
- Test force rollback returns legacy for new Team selection.
- Test force rollback returns legacy for new Responses selection.
- Test force rollback returns legacy for new shared skill selection.
- Test frozen legacy Team run remains legacy after active flags are enabled.
- Test frozen SDK Team run remains SDK after rollback is toggled, unless explicitly stopped.
- Test Chat shadow flag selects `openai_agents` + `shadow` only when master flag is true.
- Test Team active flag selects `openai_agents` + `active` only when master flag is true.
- Test Responses shadow flag selects `openai_agents` + `shadow` only when master flag is true.
- Test shared skill active flag selects `openai_agents` + `active` only when master flag is true.

DTO tests:

- Test valid Chat request fixture matches shared TypeScript types/schema.
- Test valid Chat request fixture with `activePersonaId` and resolved persona snapshot matches shared types/schema.
- Test valid Team step request fixture matches shared TypeScript types/schema.
- Test valid Team step request fixture with owner/reviewer member+persona assignments matches shared types/schema.
- Test valid Media Studio shared-skill request fixture with `originSurface = media_studio` matches shared types/schema.
- Test invalid review verdict status is rejected by schema helper if a schema helper is introduced.
- Test terminal reason enum includes `plan_incomplete_cap_reached`.
- Test current contract version fixture is accepted.
- Test `current - 1` contract version fixture is accepted for compatibility.
- Test future unsupported contract version fixture is rejected.
- Test valid step-link fixture accepts `owner_result` and `review_result` link types.

Import guard tests:

- Test Node/TypeScript SDK imports fail the guard.
- Test guard helper ignores markdown/spec files and only checks source files.

## Implementation Notes

- Keep this section low-risk and additive.
- Do not connect runtime selection to production surface paths yet.
- Do not add SDK dependency in this section.
- Do not add database schema fields in this section.
- Keep names stable because later sections will reference these types.
- Do not invent a second persona storage or resolution system in the shared contract layer.

## Acceptance Criteria

- Feature flags are registered safely and default disabled.
- Runtime selection helper has deterministic precedence.
- Shared DTOs exist and are importable from server-side code.
- Shared DTOs include contract versions, persona/member snapshots, Media Studio origin support, and explicit step-link schema.
- Import guard scaffolding exists.
- No user-visible behavior changes.
