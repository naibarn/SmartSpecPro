# Section 05 — Control flow, human interaction, recovery, and partial run

## Goal

Implement non-linear workflow behavior and durable user intervention. Branches,
loops, waits, retries, checkpoints, and partial runs must be runtime semantics,
not visual labels.

## Owned paths

- `apps/web/server/services/workflowStudioNodeAdapters/control.ts`
- `apps/web/server/services/workflowStudioControlRuntime.ts`
- control/runtime tests under the existing server service tree.

## Node coverage

`condition`, `switch`, `parallel`, `loop`, `foreach`, `delay`, `retry`,
`human-approval`, `human-input`, `checkpoint`, `error-handler`, `subflow`, and
`run-until`.

## Semantics

- Condition and switch evaluate typed values and choose explicit output handles;
  preserve selected route in events and output metadata.
- Parallel starts independent branches with bounded concurrency and deterministic
  join behavior. Loop/foreach require a finite bound, item expression, and
  explicit aggregation/error policy.
- Delay is a durable scheduled wait. Retry declares scope, max attempts,
  backoff/jitter, timeout, and retryable error classes.
- Human approval/input enters canonical external wait with reviewer/assignee,
  deadline, decision/comment, operation key, and resume authorization.
- Checkpoint captures definition/version/content hash, completed node IDs,
  typed outputs, artifact refs, and digest. Resume rejects stale or cross-tenant
  checkpoints.
- Partial run modes (`full`, `run_node`, `run_from`, `run_until`,
  `run_subflow`) compute exact selected steps and required predecessor inputs;
  they cannot silently use missing values.
- Error handler receives typed error context and can route to recovery/failure
  branches without masking the original event.

## TDD-first checks

- Conditions/switches choose correct labeled/default route.
- Parallel/loop/foreach enforce bounded deterministic behavior.
- Retry/backoff/timeout/idempotency and non-retryable classification work.
- Approval/input waits durably and resumes once with reviewer evidence.
- Partial runs select correct nodes and reject invalid/stale checkpoints.

## Exit criteria

The run UI can demonstrate waiting approval, retry, cancel, partial stop,
checkpoint, and resume using durable state and not local page state.

## UI/UX Contract

### Target User / JTBD

N/A for direct UI; this section supplies durable control state to the run dock.

### Existing Pattern Reference

N/A for direct UI; reuse of progress/review/sheet patterns is specified in section 10.

### Surface Inventory

N/A — control adapters and runtime state only.

### Component Map

N/A — section 10 owns approval, retry, cancel, and resume controls.

### State Matrix

Waiting, approved, rejected, retrying, canceled, partial, checkpoint-ready, and resumed are required runtime states for section 10.

### Responsive Matrix

N/A — section 10 owns mobile/tablet/desktop controls.

### Accessibility Acceptance

N/A — section 10 verifies accessible controls and live status.

### Copy Contract

Expose localized state/error keys for approval, retry, cancel, checkpoint, and resume.

### Browser Evidence Required

N/A for direct browser behavior; section 12 proves the states end-to-end.
