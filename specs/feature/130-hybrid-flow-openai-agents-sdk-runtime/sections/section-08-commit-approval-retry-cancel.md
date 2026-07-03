# Section 08: Commit Executors, Approval, Repair, Retry, And Cancel

## Purpose

Implement the safe side-effect boundary for Hybrid completion and durable human control actions.

## Depends On

- `section-02-durable-persistence-migration`
- `section-03-neutral-router-runtime-coordinator`
- `section-05-stage-runner-integration`

## Blocks

- final release gates
- canary activation

## Files Owned By This Section

- `apps/web/server/services/hybridExecutorRegistry.ts`
- `apps/web/server/services/hybridCommitExecutor.ts` (new or equivalent)
- relevant direct skill/media execution service adapters
- approval/checkpoint service integration files selected during implementation
- focused service tests under existing conventions

## Commit Boundary

Commit stages must never be free-form LLM side effects.

The server-owned executor registry decides:

- allowed executor id
- allowed side-effect class
- whether approval is required
- required tenant policy checks
- credit checks
- idempotency policy
- audit payload

First-slice executor options:

- media prompt preview
- selected direct skill execution
- save output to library

Do not ship:

- automatic publishing
- broad connector writes
- fully autonomous commit without human approval

## Security And Governance Requirements

This section owns the highest-risk side-effect controls.

Required controls:

- no model-selected arbitrary executor ids
- no connector/tool credential exposure to Python except scoped server-mediated calls
- mutating tools require approval
- tenant policy checks before every side effect
- audit record before or atomically with side-effect attempt
- idempotency key for every commit attempt
- redacted trace refs only in user-visible UI
- cross-tenant execution, stage, and trace ids rejected

Commit executor safety gates must pass before enabling `hybridFlow.commitStageEnabled` for any tenant beyond internal canary.

## Approval And Repair

Approval state must be durable:

- approve
- request changes
- reject
- edit instruction
- resume
- cancel

Repair state must:

- preserve original stage output
- store repair instruction
- rerun only allowed stages
- keep trace and cost history

## Retry And Cancel

Retry:

- only retry retryable failures
- preserve idempotency key rules
- record retry count and reason

Cancel:

- stop future stages
- preserve prior artifacts
- do not undo completed side effects
- expose user-readable cancelled state

## TDD Expectations

Write tests first for:

- unknown executor rejected
- model-suggested arbitrary executor rejected
- approval required before commit
- credit/policy failure blocks commit
- commit idempotency prevents duplicate side effects
- repair reruns allowed stage only
- cancel prevents future stage execution
- retry respects retryable vs terminal failures
- cross-tenant commit attempts are rejected
- audit/idempotency record exists for failed commit executor attempts

## Acceptance Checks

- First safe commit executor works end-to-end.
- No publishing or external connector write can run in first slice.
- Duplicate commit attempts are prevented.

## UI/UX Contract

### Target User / JTBD

N/A for direct UI implementation. This section defines server behavior consumed by approval and commit UI in section 07.

### Surface Inventory

| Surface | File/route | Change |
|---|---|---|
| Approval panel | `/hybrid/:executionId` | no UI change here; endpoint behavior only |

### Component Map

N/A. Approval UI components are owned by section 07.

### State Matrix

N/A. Server states include approved, repair requested, cancelled, committing, failed, completed.

### Responsive Matrix

N/A. No layout work.

### Accessibility Acceptance

N/A. No direct UI.

### Copy Contract

N/A. Return stable codes; localized action copy in section 07.

### Browser Evidence Required

N/A for this section. Browser evidence occurs when UI consumes these actions.
