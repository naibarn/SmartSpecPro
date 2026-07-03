# Feature 130 Rollout Gates

## Default State

- Production flags remain disabled by default.
- Chat-origin Hybrid starts require `hybridFlowEnabled`, `hybridFlowChatEntryEnabled`, and `hybridFlowOpenAiAgentsRuntimeEnabled`.
- Commit stages additionally require `hybridFlowCommitStageEnabled`.
- Legacy Agency-origin preview routes remain readable, but Chat-origin Hybrid must not silently fall back to Agency execution.

## Shadow To Canary Gate

- `openai-agents` is pinned to the latest reviewed stable version.
- Routing replay fixtures pass for direct media, prompt enhancement, direct skill, Thai Hybrid-positive, English Hybrid-positive, and ambiguous prompts.
- Adapter health advertises `surface=hybrid`, `hybrid-runtime-v1`, supported Hybrid stage types, and role template version.
- Durable migration smoke tests pass for execution/stage inserts, idempotent preview start, and tenant/user mismatch.
- Stage runner tests pass for success, unsupported contract, repair-required, budget exceeded, approval pause, and retryable failure states.
- Commit executor tests pass for approval requirement, idempotency, cross-tenant rejection, and failed side-effect audit result.
- Browser evidence is collected for desktop `/hybrid/:executionId`, mobile awaiting approval, expired preview, and legacy route compatibility before external canary.

## Promotion Thresholds

- Hybrid-positive fixture precision is at least 90%.
- Direct-skill-negative fixture precision is at least 95%.
- Every failed stage has a stable reason code and visible recovery state.
- No duplicate commit side effect occurs for retried idempotency keys.
- Manual golden review passes for complex Thai and English staged prompts.

## Rollback

- Disable `hybridFlowChatEntryEnabled` to stop new Chat-origin Hybrid offers.
- Disable `hybridFlowOpenAiAgentsRuntimeEnabled` to stop new SDK-backed starts while keeping direct chat and direct skills alive.
- Disable `hybridFlowCommitStageEnabled` to pause mutating commit only.
- Existing durable executions remain readable through `/hybrid/:executionId`.
