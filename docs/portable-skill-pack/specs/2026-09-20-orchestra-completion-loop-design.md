# Orchestra Completion Loop Design

## Goal

Make Orchestra drive every implementation task through a recoverable lifecycle:

`Planning → TDD / Test Design → Implement → Verify → Debug/Fix → Review → Final Verify`

The conductor must not treat a blocker, missing artifact, failed gate, or review
finding as permission to skip the remaining lifecycle. It must record the gap,
backtrack to the earliest affected stage, repair it, rerun stale gates, and only
finish when the lifecycle ledger proves convergence.

## Current Failure Mode

The existing references contain gap closure and review-convergence guidance, but
they are primarily final-summary gates. A stage can become blocked after a retry
limit or missing prerequisite and the session can continue with a stale backlog,
without a durable resume pointer or a required transition back to the missing
stage. This makes “blocked” behave like “skipped”.

## Design

### 1. Lifecycle ledger

Create `orchestra/lifecycle.md` for every non-trivial implementation,
debugging, review, or skill-system task. It is the source of truth for stage
status and recovery, while `orchestra/progress.md` remains the compact loop
counter and wave ledger.

Each stage has exactly one status:

- `PENDING`
- `IN_PROGRESS`
- `COMPLETE`
- `NOT_APPLICABLE` with evidence and rationale
- `BLOCKED` with a typed reason and `resume_from`

Behavior-changing work must complete all seven stages. Documentation-only,
purely visual, or trivial work may use `NOT_APPLICABLE` only with an explicit
reason and proof; it is never an implicit skip.

### 2. Gap ledger and recovery

Every gap is recorded in the lifecycle ledger with:

- stable gap ID and discovered stage
- target/earliest affected stage
- severity and classification (`MUST_FIX`, `MUST_DO_NOW`, `VERIFY_ONLY`,
  `DEFER_OPTIONAL`, `BLOCKED`)
- evidence and exact missing condition
- owner/action and attempt count
- gates made stale by the fix
- status and next transition

Recovery rules:

1. A stage exit audit runs before advancing to the next stage.
2. A missing prerequisite, failed gate, or review finding creates an open gap.
3. Safe in-scope gaps are repaired automatically; the conductor transitions to
   the earliest affected stage instead of advancing.
4. After every repair, all affected stages/gates become stale and are rerun.
5. External dependency, product decision, destructive action, or loop-limit
   blockers remain `BLOCKED`; the session stops with `resume_from` and does not
   claim completion.
6. `orchestra/backlog.md` may reference a gap only after it exists in the
   lifecycle ledger; backlog placement never closes or hides an open gap.

### 3. Stage transition map

```text
PLANNING
  -> TDD_DESIGN
TDD_DESIGN
  -> IMPLEMENT
IMPLEMENT
  -> VERIFY
VERIFY
  -> DEBUG_FIX       (failure, missing evidence, or discovered gap)
  -> REVIEW          (clean verification)
DEBUG_FIX
  -> VERIFY          (repair applied)
  -> BLOCKED         (safe repair impossible)
REVIEW
  -> TDD_DESIGN      (coverage/design gap)
  -> IMPLEMENT       (code/contract gap)
  -> VERIFY          (evidence/gate gap)
  -> DEBUG_FIX       (failure/root-cause gap)
  -> FINAL_VERIFY    (clean review)
FINAL_VERIFY
  -> earliest affected stage (new gap or stale evidence)
  -> COMPLETE        (all invariants pass)
```

`DEBUG_FIX` is a required stage even when no defect is found: it closes with a
clean gap scan and evidence that no repair is needed. This prevents the stage
from silently disappearing from the audit trail.

### 4. Completion invariants

Orchestra may report completion only when:

- all seven stages are `COMPLETE` or explicitly justified `NOT_APPLICABLE`
- no `MUST_FIX`, `MUST_DO_NOW`, `VERIFY_ONLY`, or stale required gate remains
- all required artifacts exist and are fresh after the last repair
- review convergence criteria pass
- final verification has fresh evidence
- loop counters and stop reason are recorded

If any invariant fails, the only valid outcomes are continued recovery or a
typed blocked/deferred report with the exact resume stage and residual risk.

## Acceptance Criteria

- A missing test-design artifact sends the lifecycle back to `TDD_DESIGN`.
- A verification failure sends it to `DEBUG_FIX`, then back to `VERIFY` after a
  repair; it cannot jump directly to `REVIEW` or `FINAL_VERIFY`.
- A review finding marks the correct earlier stage and all downstream evidence
  stale, then reruns the affected path.
- A blocker after retry/repair limits preserves open gaps and `resume_from`; it
  never becomes a successful or silently skipped stage.
- A clean task records every stage, including a no-gap `DEBUG_FIX` result.
