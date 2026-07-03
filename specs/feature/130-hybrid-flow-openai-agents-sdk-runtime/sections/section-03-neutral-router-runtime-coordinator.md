# Section 03: Neutral Hybrid Router And Runtime Coordinator

## Purpose

Make server-side Hybrid routing and orchestration neutral, durable, and independent from Chat-origin Agency.

## Depends On

- `section-01-contracts-flags-routing-fixtures`
- `section-02-durable-persistence-migration`

## Blocks

- stage runner integration
- Chat card neutral navigation
- workspace execution UI
- commit executor behavior

## Files Owned By This Section

- `apps/web/server/routers/hybridOrchestration.ts`
- `apps/web/server/services/hybridOrchestrationRuntime.ts`
- `apps/web/server/services/hybridStageStateMachine.ts` (new or equivalent)
- `apps/web/server/services/__tests__/hybridOrchestrationRuntime.test.ts`
- router tests if existing conventions support them

## Router Contract

Expose or adapt these operations:

- `createPreviewToken`
- `getPreview`
- `startExecution`
- `getExecution`
- `resumeExecution`
- `cancelExecution`
- `retryStage`
- `getRuntimeHealth`

`createPreviewToken` must accept:

- Chat-origin payload without `agencyId`
- Agency-origin payload with `agencyId`

## State Machine

Implement server-owned transitions:

```text
draft_preview -> ready_to_start -> running_stage -> awaiting_approval
running_stage -> repairing -> running_stage
running_stage -> committing -> completed
any non-terminal -> failed | cancelled
draft_preview -> expired
```

The client may request an action but must not set the next state directly.

## Compatibility

- Existing Agency route can redirect or wrap neutral runtime.
- Chat-origin flow cannot call `trpc.agency.list`.
- Legacy Agency fallback is allowed only for explicit Agency-origin legacy flows behind `hybridFlow.agencyLegacyFallbackEnabled`.

## TDD Expectations

Write tests first for:

- Chat-origin preview without `agencyId`
- Agency-origin preview with `agencyId`
- preview ownership mismatch rejection
- start creates durable execution and does not auto-complete stages
- resume from approval
- cancel from running/awaiting approval
- retry failed retryable stage
- runtime health reports SDK/contract compatibility

## Acceptance Checks

- Router is tenant/user scoped.
- Neutral start path exists.
- Old Agency path remains readable or safely redirected.
- Redis-only execution state is no longer created for started Chat-origin runs.

## UI/UX Contract

### Target User / JTBD

N/A for direct UI implementation. This section exposes server operations consumed by Chat and workspace UI.

### Surface Inventory

| Surface | File/route | Change |
|---|---|---|
| Hybrid preview route consumer | `/hybrid/preview` | backend endpoint support only |
| Hybrid execution route consumer | `/hybrid/:executionId` | backend endpoint support only |

### Component Map

N/A. React consumers are owned by sections 06 and 07.

### State Matrix

N/A. This section returns states; UI rendering is covered in section 07.

### Responsive Matrix

N/A. No layout work.

### Accessibility Acceptance

N/A. No direct UI.

### Copy Contract

N/A. Return structured error codes; localized copy is owned by UI sections.

### Browser Evidence Required

N/A for this section. Browser evidence is required after sections 06 and 07 wire these endpoints.
