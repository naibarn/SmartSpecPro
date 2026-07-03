# Section 07: Neutral Hybrid Workspace UI

## Purpose

Provide neutral preview and execution routes for Hybrid runs independent from Agency route context.

## Depends On

- `section-03-neutral-router-runtime-coordinator`
- `section-05-stage-runner-integration`
- `section-06-chat-routing-and-card-ui`

## Blocks

- final release gates

## Files Owned By This Section

- `apps/web/client/src/pages/HybridOrchestrationPreview.tsx`
- route registration such as `apps/web/client/src/App.tsx`
- supporting components under `apps/web/client/src/components`
- locale files for workspace copy
- UI/browser tests for Hybrid workspace

## Routes

- `/hybrid/preview?hybridPreviewToken=...`
- `/hybrid/:executionId`

Existing `/agencies/:id/hybrid-preview` route must remain readable or redirect safely.

## Required UI States

- preview loading
- valid preview
- expired preview
- start failed
- execution loading
- running stage
- awaiting approval
- repair required
- committing
- completed
- failed retryable
- failed terminal
- cancelled

## UI/UX Contract

### Target User / JTBD

- Role: Chat user or Agency user reviewing a Hybrid run.
- Goal: Inspect staged execution, approve/repair/cancel, and see final artifacts.
- Entry point: neutral Hybrid preview/execution route.
- Success outcome: User understands what happened, what is waiting, and what action is safe next.

### Surface Inventory

| Surface | File/route | Change |
|---|---|---|
| Preview route | `/hybrid/preview` | resolve preview and start execution |
| Execution route | `/hybrid/:executionId` | display durable stage state |
| Legacy route | `/agencies/:id/hybrid-preview` | redirect/wrap neutral workspace |

### Component Map

| Component | File | Owns | Consumes |
|---|---|---|---|
| Workspace page | `HybridOrchestrationPreview.tsx` or replacement | route state and tRPC calls | preview/execution endpoints |
| Stage list | new/existing component | stage status projection | `HybridStageResult` |
| Approval panel | new/existing component | approve/change/reject/cancel actions | resume/cancel endpoint |

### State Matrix

| State | Expected UI | Verification |
|---|---|---|
| loading | stable skeleton/spinner | UI test |
| empty/expired | recovery copy and back action | UI test |
| error | retry-safe message | UI test |
| success | stages/artifacts/cost visible | UI test |
| disabled/focus/hover | actions disabled by policy; focus visible | browser evidence |

### Responsive Matrix

| Viewport | Expected behavior | Evidence |
|---|---|---|
| mobile 390x844 | stage list stacks, actions remain visible | browser evidence |
| tablet 768x1024 | summary and details remain readable | browser evidence |
| desktop 1440x900 | workspace uses available width without card nesting clutter | browser evidence |

### Accessibility Acceptance

- Approval actions are keyboard reachable.
- Stage status is text-visible, not color-only.
- Focus order follows preview -> stages -> actions.
- Errors are announced or visibly associated with action areas.

### Copy Contract

- Thai/English stage labels and action labels.
- Clear expired preview copy.
- Clear retry/cancel copy.
- No unsupported "Agency required" copy for Chat-origin flows.

### Browser Evidence Required

- desktop execution route
- mobile awaiting approval
- expired preview
- legacy route compatibility state

## TDD Expectations

Write tests first for:

- neutral route renders preview
- start execution action
- execution route renders stage states
- approval/resume/cancel actions call correct endpoints
- legacy route compatibility
- visible trace id and cost summary when present

## Acceptance Checks

- User can complete first-slice Hybrid run from neutral workspace.
- UI remains usable on mobile and desktop.
- Agency context is optional.

