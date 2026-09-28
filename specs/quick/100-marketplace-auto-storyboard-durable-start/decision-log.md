# Decision Log

## Planning depth

Depth: `standard`

The change crosses a shared service, worker, API adapter, and client error state,
but remains within one Marketplace Auto Review workflow and uses an established
outbox. Three sections are sufficient; full deep-plan promotion is unnecessary.

## Decisions

1. Reuse `marketplace_auto_review_outbox_jobs` with job type
   `initialize_run`.
2. Split durable acceptance from expensive initialization rather than
   detaching an in-process promise.
3. Persist a versioned initialization payload; never persist a bearer token.
4. Require an atomic outbox claim and heartbeat for initialization.
5. Keep existing polling; export/reuse a lost-upstream classifier to preserve
   optimistic polling on ambiguous transport failures.
6. Give a missing sequential prompt one bounded planner repair, then fail with
   `sequential_prompt_missing`.
7. Do not add a migration because `payloadJson` is JSONB and the outbox already
   has a unique idempotency index.
8. Preserve the existing direct `startMarketplaceAutoReviewRun` contract.
   Introduce a durable enqueue entry point for
   `startAutoStoryboardReviewForApi`; both paths share one internal acceptance
   primitive to avoid persistence drift.
9. The current start helpers are not transaction-scoped. Persist initialization
   intent inside the run insert and make both API idempotency recovery and the
   active-run scanner recreate a missing deterministic outbox job. This closes
   the orphan-run failure without a broad transaction refactor.
10. Reuse the sequential runner's existing bounded rounds/mapping repair. The
    observed missing-prompt failure is fixed by forwarding its returned
    metadata into production-project construction.

## Review log

- Round 1: ensured the failing API acceptance excludes all LLM work without
  changing the separate direct-start caller contract.
- Round 2: added atomic claim and heartbeat requirements for multi-worker
  safety.
- Round 3: added exhausted-retry run failure and legacy-run compatibility.
- Round 4: checked tenant/auth and secret-persistence boundaries; no new gap.
- Round 5: checked test coverage, UI states, and rollback behavior; no new gap.
- Round 6: repeated completeness and contradiction check; no meaningful
  auto-fix remained.

## Promotion triggers

Promote only if implementation proves initialization cannot be extracted
without redesigning later media stages, or if a schema migration becomes
necessary.
