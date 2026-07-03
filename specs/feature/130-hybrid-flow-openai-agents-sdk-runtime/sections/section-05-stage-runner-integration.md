# Section 05: Stage Runner Integration

## Purpose

Wire the Node Hybrid coordinator to real SDK-backed stage execution and normalized durable results.

## Depends On

- `section-02-durable-persistence-migration`
- `section-03-neutral-router-runtime-coordinator`
- `section-04-python-sdk-hybrid-stage-support`

## Blocks

- workspace live stage UI
- commit executor
- replay/release gates

## Files Owned By This Section

- `apps/web/server/services/hybridStageRunner.ts` (new)
- `apps/web/server/services/hybridExecutorRegistry.ts` (new)
- `apps/web/server/services/hybridOrchestrationRuntime.ts`
- `apps/web/server/services/agentRuntime/client.ts` if additive Hybrid health/request helpers are needed
- `apps/web/server/services/__tests__/hybridStageRunner.test.ts`
- `apps/web/server/services/__tests__/hybridExecutorRegistry.test.ts`

## Runtime Behavior

The stage runner should:

- load execution and current stage from durable store
- validate stage executor definition
- build `HybridRuntimeStageRequest`
- call `AgentRuntimeClient.run` or `resume`
- validate adapter health and contract support before execution
- normalize result to `HybridStageResult`
- persist result, usage, trace refs, artifacts, and next action
- transition execution state idempotently

## Stage Handling

Initial supported stages:

- intake: deterministic or SDK-backed normalization
- explore: SDK-backed role graph
- validate: SDK-backed or deterministic verdict
- approval: no SDK call; durable pause
- commit: delegated to section 08 executor

## Failure Handling

Required failure states:

- adapter unavailable
- unsupported contract
- budget exceeded
- schema invalid
- retryable runtime error
- terminal runtime error
- cancelled

Every failure must have:

- stable reason code
- user-readable state
- operator trace metadata
- retry policy

## Billing, Budget, And SLO Requirements

The stage runner owns enforcement and persistence for runtime cost controls.

Each stage execution must record:

- estimated budget where available
- actual input/output token usage
- credits charged
- model/provider route
- executor cost where applicable
- runtime duration

Runtime gates:

- preflight validation should not charge credits
- per-stage and total run ceilings must be checked before each paid stage
- insufficient credit pauses or fails closed before the next billable stage
- stage result must preserve historical cost summary even if pricing changes later

Initial canary SLOs to expose through tests/logs where practical:

- intake p95 under 20 seconds
- explore/swarm p95 under 90 seconds for default budget
- validation p95 under 30 seconds
- approval resume p95 under 5 seconds after user action
- no duplicate commit side effect for retried idempotency keys

## TDD Expectations

Write tests first for:

- stage request construction
- health compatibility check
- successful explore stage persistence
- validation repair-required transition
- failed adapter response creates retryable failed stage
- unsupported contract fails closed
- usage/trace metadata persistence
- idempotent retry behavior
- budget exceeded pauses before the next billable stage
- no-charge preflight validation path

## Acceptance Checks

- Hybrid no longer auto-completes workflow/swarm stages.
- At least one real SDK-backed explore stage runs through `AgentRuntimeClient`.
- Stage result UI can read normalized persisted results.

## UI/UX Contract

### Target User / JTBD

N/A for direct UI implementation. This section produces stage state consumed by the workspace UI.

### Surface Inventory

| Surface | File/route | Change |
|---|---|---|
| Hybrid workspace | `/hybrid/:executionId` | no UI change here; supplies normalized state |

### Component Map

N/A. UI components are owned by section 07.

### State Matrix

N/A. Must produce machine-readable states for section 07 to render.

### Responsive Matrix

N/A. No layout work.

### Accessibility Acceptance

N/A. No direct UI.

### Copy Contract

N/A. Structured reason codes only; localized copy later.

### Browser Evidence Required

N/A. Browser evidence is required after workspace integration.
