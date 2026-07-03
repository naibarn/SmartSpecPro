# Section 01: Contracts, Flags, And Routing Fixtures

## Purpose

Create the shared contracts and safety rails that every later section depends on.

This section must land before runtime, UI, Python adapter, or persistence work begins.

## Depends On

- Feature 130 `spec.md`
- Feature 101 agent runtime contract patterns

## Blocks

- durable persistence
- neutral Hybrid router
- Python Hybrid adapter support
- Chat UI wiring
- release fixture suite

## Files Owned By This Section

- `apps/web/shared/orchestration/hybridOrchestration.ts`
- `apps/web/shared/agentRuntime/types`
- `apps/web/shared/chatSkillRouting.ts`
- `apps/web/client/src/components/chat/chatLocalRouting.ts`
- `apps/web/client/src/components/chat/chatLocalRouting.test.ts`
- `apps/web/shared/featureFlags.ts`
- `apps/web/shared/featureFlags.js`
- feature-scoped routing/replay fixture file under existing test fixture conventions

Do not edit router, database schema, or Python adapter implementation in this section except where a compile-time type export requires import adjustment.

## Required Contract Additions

Add additive shared contract types for:

- Hybrid runtime surface and entry points
- Hybrid execution state machine
- Hybrid stage owner and stage type
- `HybridRuntimeStageRequest`
- `HybridStageResult`
- `HybridStageExecutorDefinition`
- role template version
- executor registry version
- Hybrid plan/result schema versions

Keep the contract versioning independent from the `openai-agents` package version.

## Feature Flags

Add or verify these flags:

- `hybridFlow.enabled`
- `hybridFlow.chatEntryEnabled`
- `hybridFlow.openAiAgentsRuntimeEnabled`
- `hybridFlow.openAiAgentsRuntimeShadow`
- `hybridFlow.neutralWorkspaceEnabled`
- `hybridFlow.agencyLegacyFallbackEnabled`
- `hybridFlow.commitStageEnabled`

Missing flags must fail closed.

## Routing Fixtures

Create fixture groups for:

- direct image negative
- direct video negative
- prompt enhancement negative
- direct skill negative
- Hybrid-positive Thai
- Hybrid-positive English
- ambiguous prompt confirmation

Each fixture should include:

- prompt
- locale
- expected route
- expected reason codes
- expected selected skill when applicable
- expected Hybrid confirmation requirement

## TDD Expectations

Write tests first for:

- direct image/video commands never route to Hybrid
- prompt enhance/edit commands never route to Hybrid
- single article writer requests stay direct
- tool/model questions stay chat
- Thai/English multi-stage review/approval prompts offer Hybrid
- unsupported contract/schema versions fail validation
- executor registry definitions reject unknown stage/owner/side-effect classes

## Acceptance Checks

- Shared contracts compile.
- Existing direct routing tests still pass.
- New fixture tests fail before routing logic is implemented and pass after.
- Feature flags are available to both backend and frontend surfaces.

## UI/UX Contract

### Target User / JTBD

N/A for direct UI implementation. This section provides contracts and fixtures consumed by later Chat and workspace UI sections.

### Surface Inventory

| Surface | File/route | Change |
|---|---|---|
| Chat routing | shared/client routing helpers | contract and fixture support only |

### Component Map

N/A. No React component should be edited in this section except routing helper imports if required.

### State Matrix

N/A. UI states are implemented in sections 06 and 07.

### Responsive Matrix

N/A. Responsive behavior is implemented in sections 06 and 07.

### Accessibility Acceptance

N/A. Accessibility verification is owned by sections 06 and 07.

### Copy Contract

N/A. User-facing copy is owned by sections 06 and 07.

### Browser Evidence Required

N/A for this section. Browser evidence is required after UI sections consume these contracts.
