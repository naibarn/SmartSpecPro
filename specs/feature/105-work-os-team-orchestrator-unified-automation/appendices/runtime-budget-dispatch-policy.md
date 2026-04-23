# Appendix - Runtime Budget and Dispatch Policy

## Purpose

Translate preflight estimates into hard runtime controls and define retry, timeout, cancellation, and dead-letter behavior for long-running surfaces.

## ExecutionBudgetEnvelope fields

| Field | Meaning | Enforcement |
|---|---|---|
| `maxTokens` | Maximum LLM tokens for the approved run or step group. | Stop or request approval before exceeding. |
| `maxToolCalls` | Maximum tool/runtime calls. | Block next dispatch when cap is reached. |
| `maxMediaJobs` | Maximum image/video/audio generation jobs. | Block additional media dispatch. |
| `maxWorkflowRuns` | Maximum workflow executions. | Block new workflow dispatch. |
| `maxAgencyRuns` | Maximum agency/swarm executions. | Block new agency dispatch. |
| `maxDurationMinutes` | Maximum wall-clock runtime. | Pause or fail based on `onExceeded`. |
| `maxRetries` | Maximum retry attempts for retryable steps. | Move step to blocked/dead-letter after cap. |
| `maxCostCredits` | Unified internal budget cap. | Stop dispatch when estimated next action would exceed cap. |
| `sideEffectRetryPolicy` | Retry rules for side-effecting surfaces. | Controls whether retries are automatic, manual, or forbidden. |
| `onExceeded` | `pause_for_approval`, `fail_run`, `skip_optional_step`, or `cancel_pending`. | Defines runtime behavior after cap breach. |

## Units and accounting rules

Budget fields must use stable units so preview, launch, runtime, telemetry, and tests agree.

| Budget dimension | Unit | Accounting rule |
|---|---|---|
| tokens | provider-reported input + output tokens | Count actual provider usage when available; otherwise reserve estimated next-action tokens before dispatch. |
| tool calls | count | Increment when a tool/runtime dispatch is accepted, not when planning suggests it. |
| media jobs | job count by media type | Count image, video, and audio provider jobs separately and roll up to `maxMediaJobs`. |
| workflow runs | run count | Count each workflow execution id once; retries reuse the same id only when the workflow runtime is idempotent. |
| agency runs | run count | Count each agency/swarm execution id once. |
| duration | wall-clock minutes | Measure from Team run start until terminal/cancelled/paused state, excluding explicit user-review pauses when policy allows. |
| cost credits | internal decimal credits | Reserve estimated next-action cost before dispatch and reconcile to actual cost after completion. |

When exact actual usage is delayed, runtime should pessimistically reserve budget before dispatch. Reconciliation may release unused reserved budget, but it must never allow the run to exceed a hard cap.

## Budget failure reason codes

- `budget_token_cap_exceeded`
- `budget_tool_call_cap_exceeded`
- `budget_media_quota_exceeded`
- `budget_workflow_run_cap_exceeded`
- `budget_agency_run_cap_exceeded`
- `budget_runtime_timeout`
- `budget_retry_cap_exceeded`
- `budget_cost_cap_exceeded`
- `budget_next_action_would_exceed_cap`

## RuntimeDispatchPolicy

Each executable plan step should compile to a `RuntimeDispatchPolicy` before dispatch.

Required fields:

- `stepId`
- `surface`
- `selectedCapabilityId`
- `authorityDecision`
- `contractCompatibilityState`
- `sideEffectClass`
- `idempotencyKey`
- `inputHash`
- `budgetReservation`
- `maxAttempts`
- `timeoutSeconds`
- `retryBackoff`
- `cancelBehavior`
- `deadLetterPolicy`

Runtime must validate `RuntimeDispatchPolicy` immediately before dispatch. A policy generated at preflight is advisory until runtime re-checks authority, contract compatibility, source snapshot validity, and available budget.

## Dispatch policy fields

| Field | Meaning |
|---|---|
| `stepId` | Approved plan step id. |
| `surface` | Approved execution surface. |
| `selectedCapabilityId` | Capability selected during preflight. |
| `sideEffectClass` | `read_only`, `bounded_write`, `external_side_effect`, or `irreversible`. |
| `idempotencyKey` | Stable key for retries/resume. |
| `maxAttempts` | Maximum attempts for the step. |
| `timeoutSeconds` | Per-attempt timeout. |
| `retryBackoff` | `none`, `fixed`, or `exponential`. |
| `resumeCursor` | Provider/runtime resume marker when supported. |
| `cancelBehavior` | `best_effort_cancel`, `wait_for_provider`, `mark_cancel_requested`, or `cannot_cancel`. |
| `deadLetterReason` | Stable reason when the step can no longer continue automatically. |

## Timeout, cancellation, and dead-letter rules

- A timed-out attempt may retry only when the step has remaining attempts, the input hash is unchanged, and side-effect rules allow retry.
- Cancellation should be best-effort for providers that support it and explicit `cancel_requested` for providers that do not.
- A dead-lettered step must store `stepId`, `surface`, `attemptCount`, `lastErrorCode`, `deadLetterReason`, `recoveryHint`, `idempotencyKey`, and `providerJobId` when available.
- Dead-letter recovery is manual by default. Automated recovery requires a new approved plan revision or an explicit operator override.
- Optional steps may be skipped only when the approved plan marks them optional and `onExceeded = skip_optional_step`.

## Retry rules by side-effect class

| Side-effect class | Automatic retry | Requirement |
|---|---|---|
| `read_only` | allowed | Same input hash and idempotency key. |
| `bounded_write` | conditional | Must verify prior attempt state before retry. |
| `external_side_effect` | manual approval by default | Must avoid duplicate provider jobs or external writes. |
| `irreversible` | no | Requires human review for any retry. |

## Runtime outcomes

| Condition | Outcome |
|---|---|
| Budget cap reached before dispatch | Block step and emit budget reason. |
| Budget cap reached mid-run | Pause for approval or fail based on `onExceeded`. |
| Retry cap reached | Move step to dead-letter with retry reason. |
| Provider timeout | Retry if policy allows, otherwise dead-letter. |
| User cancels run | Attempt cancel based on `cancelBehavior`, then mark pending jobs accordingly. |
| Compatibility or authority disappears | Block dispatch and require re-review. |

## Required tests

- Budget helper converts approved forecast to runtime caps.
- Next action is blocked when estimated cost would exceed cap.
- Runtime timeout produces `budget_runtime_timeout`.
- Side-effecting retry requires idempotency verification.
- Cancellation records provider-specific behavior without double-dispatch.
- Dead-letter records stable reason and recovery hint.
- Runtime reconciliation cannot exceed approved hard caps after reserved budget is released.
