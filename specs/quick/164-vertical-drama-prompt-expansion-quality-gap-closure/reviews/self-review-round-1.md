# Plan Self-Review — Round 1

## Checklist score

| Category | Score | Result |
|---|---:|---|
| Structural integrity | 5/5 | PASS |
| Completeness vs spec | 5/5 | PASS |
| Implementability | 5/6 | FIXED below |
| Internal consistency | 5/5 | PASS |
| Edge cases and failure modes | 5/5 | PASS |

## Findings and fixes

1. **Idempotency race was underspecified.** The plan required a tenant/user/key
   check but did not say how concurrent inserts are prevented. The implementation
   plan was updated to require a unique ownership/idempotency constraint or
   conflict-safe insert path, with a post-conflict read that rechecks source hash
   and profile before returning an existing run.
2. **Profile selection boundary needed to be explicit.** The router currently
   accepts only a prompt. The plan was updated to derive the profile using the
   shared server function unless a bounded, validated profile hint is already
   part of the UI contract; client hints cannot bypass profile-specific gates.
3. **Retry charging needed a ledger rule.** The plan was updated to require one
   preview credit reservation/transaction for the bounded operation, or an
   equivalent existing executor mechanism, with repair attempts not independently
   charged and no silent extra deduction after a provider/schema failure.

## Round result

After these fixes, the plan is implementable without leaving the concurrency,
profile, or credit boundaries implicit.
