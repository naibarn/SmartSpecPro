# Section 09: Replay, Rollout, And Operator Gates

## Purpose

Make activation safe through replay fixtures, release gates, observability, rollback validation, and operator recovery documentation.

## Depends On

- all prior sections

## Files Owned By This Section

- feature-scoped replay fixtures under existing test conventions
- routing/runtime/replay test files created by earlier sections
- `specs/feature/130-hybrid-flow-openai-agents-sdk-runtime/rollout.md` (new)
- `specs/feature/130-hybrid-flow-openai-agents-sdk-runtime/operator-playbook.md` (new)
- `specs/feature/130-hybrid-flow-openai-agents-sdk-runtime/verification-results.md` after implementation

## Replay Fixture Groups

Required groups:

- direct media negative
- prompt enhancement negative
- direct skill negative
- Hybrid-positive Thai
- Hybrid-positive English
- ambiguous prompts
- SDK stage success
- SDK schema drift
- approval resume
- idempotent commit retry
- legacy Agency compatibility

Each fixture records:

- input prompt and locale
- expected route and reason codes
- expected feature flags
- expected stage plan shape
- expected schema/contract versions
- expected side-effect class
- expected recovery state for failures

## Release Gates

Shadow -> canary requires:

- pinned SDK dependency and release-note review
- adapter contract tests for current/current-1
- replay fixtures pass
- no direct media/prompt-enhance regression
- no Chat/Team/Responses/shared skill regression
- durable migration smoke checks
- rollback validation
- operator recovery playbook
- logs/dashboard query for routing, stage failures, approval pauses, cost, SDK version, contract version

## Shadow Mode Evidence

Shadow mode must:

- keep current visible behavior
- generate candidate SDK stage result
- suppress all side effects
- compare routing decisions
- compare stage output shape and repair verdicts
- persist comparison metadata for QA/operator review
- never silently fall back to legacy Agency execution for Chat-origin Hybrid failures

## Product Metrics And SLO Gates

Release evidence must include:

- Hybrid offered count
- Hybrid accepted count
- keep-in-chat count
- user chose direct skill count
- direct skill false-positive rate
- stage completion rate
- approval completion rate
- repair-required rate
- duplicate side-effect prevention count
- average credits per completed run
- user-visible latency per stage
- final artifact acceptance or retry rate where measurable
- manual golden review verdict for complex Thai and English Hybrid-positive prompts

Initial promotion thresholds:

- at least 90% precision for Hybrid-positive fixture prompts before canary
- at least 95% precision for direct-skill-negative fixture prompts before canary
- every failed stage has stable reason code and user-readable recovery state
- no duplicate commit side effect for retried idempotency keys
- golden set review passes before broad rollout

## Environment And Configuration Gates

Verify:

- local/dev requires explicit flags for SDK Hybrid
- staging runs replay fixtures before active canary
- production defaults disabled until release gates pass
- missing budget disables commit stages
- missing executor allowlist disables commit stages
- missing SDK health disables SDK-backed Hybrid but does not disable direct chat or direct skills

Canary cannot include mutating publish or broad connector writes.

## Operator Playbook Requirements

Document how to:

- find execution by id/conversation/user
- identify SDK version and contract version
- inspect stage trace and error code
- retry a safe stage
- cancel stuck execution
- resume or expire stale approval
- verify whether commit side effect ran
- disable Chat-origin Hybrid
- disable commit stages only
- read/migrate legacy Agency-origin run

## TDD Expectations

Write tests/checks first for:

- replay fixture runner or focused test suite
- shadow mode side-effect suppression
- shadow mode comparison metadata persistence
- rollback disables only new SDK-backed Hybrid starts
- existing executions remain readable after rollback
- unsupported SDK/contract health blocks runtime
- operator docs mention every high-risk failure mode
- release gates include product metric thresholds
- missing config fails closed without breaking direct chat/direct skill

## Acceptance Checks

- Release gate checklist exists and is executable.
- Operator playbook exists before canary.
- Broad rollout is blocked until replay, rollback, and compatibility gates pass.

## UI/UX Contract

### Target User / JTBD

Operators and QA need evidence that user-facing Hybrid UI states were verified before rollout.

### Surface Inventory

| Surface | File/route | Change |
|---|---|---|
| Chat Hybrid card | Chat route | evidence and replay validation only |
| Hybrid workspace | `/hybrid/preview`, `/hybrid/:executionId` | evidence and rollout validation only |

### Component Map

N/A. This section does not own component edits; it owns verification artifacts.

### State Matrix

Must verify evidence exists for loading, expired, running, awaiting approval, repair, failed, cancelled, and completed states.

### Responsive Matrix

Must verify required evidence exists for mobile 390x844, tablet 768x1024, and desktop 1440x900 where UI sections changed route-level behavior.

### Accessibility Acceptance

Must verify UI sections recorded keyboard, focus, labels, semantic status, and non-color-only status evidence.

### Copy Contract

Must verify Thai/English copy keys exist for user-visible release states.

### Browser Evidence Required

Required as a rollout gate if sections 06 and 07 changed UI. Missing browser tooling must be logged as skipped with residual risk, not treated as pass.
