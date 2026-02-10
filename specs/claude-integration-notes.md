# Integration Notes - Iteration 1

## Source

- Review file: `specs/reviews/iteration-1-self-review.md`

## Accepted Suggestions

1. Clarify cross-runtime data ownership (accepted)
- Rationale: prevents migration drift between Drizzle and SQLAlchemy.
- Plan update: Added explicit ownership contract section.

2. Specify callback durability transition strategy (accepted)
- Rationale: reduces cutover risk and enables safe deprecation of in-memory callback cache.
- Plan update: Added phased shadow-write and deprecation sequence.

3. Define versioned search response contract (accepted)
- Rationale: avoids inconsistent client assumptions between Media Studio and Chat.
- Plan update: Added response contract section with compatibility expectations.

4. Add backfill operational controls (accepted)
- Rationale: protects queues and enables rollback during incremental indexing.
- Plan update: Added throttling, pause/resume, dry-run, tenant scoping controls.

5. Add quantitative release gates (accepted)
- Rationale: enforces objective readiness before rollout expansion.
- Plan update: Added reliability and DLQ thresholds to rollout exit criteria.

## Rejected Suggestions

- None.

## Result

`specs/claude-plan.md` updated with all accepted clarifications.
