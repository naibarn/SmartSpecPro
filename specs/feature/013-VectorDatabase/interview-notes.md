# Interview Notes

Date: 2026-02-16
Mode: Resume (`resume_progress`)
Decision Mode: `smart_auto`

## Q1. Queue architecture choice
Should vector indexing use existing DB job + Celery pipeline (`library_index_jobs`) as the primary system, or introduce BullMQ as a new primary queue?

**Answer:** Celery (existing DB job + Celery pipeline as primary).

## Q2. Scope for first production cut
Should v1 include only `gallery + library` indexing/search parity, or also include `messages/conversations/memories` in the same rollout?

**Answer:** `gallery + library` only for v1.

## Q3. Provider switch behavior
On provider change, should we do immediate cutover (partial results during reindex) or staged cutover (old provider serves reads until readiness)?

**Answer:** Staged cutover.

## Q4. Tenant/security enforcement
Should we enforce dual controls everywhere (provider-side tenant filters plus DB-side RLS for pgvector), even with extra migration complexity?

**Answer:** Yes, strict dual enforcement.

## Q5. Staged cutover readiness gate
What should activate reads on the new provider?

**Answer:** `coverage_95_plus_smoke` (>=95% coverage plus smoke tests pass).

## Q6. Failure rollback trigger during reindex
What should trigger rollback?

**Answer:** `either` (rollback on either high error rate or search regression).

## Q7. pgvector rollout mode
How should pgvector be deployed for production?

**Answer:** `single_db` (same primary Postgres with extension + RLS).

## Consolidated Constraints
- Preserve and extend existing Celery pipeline; do not introduce BullMQ as primary for this feature.
- Deliver v1 for `gallery` and `library` domains only.
- Use staged provider cutover; keep old provider serving reads until new provider reaches readiness.
- Enforce strict tenant controls: provider-side filtering and pgvector RLS.
- Promote new provider only when coverage >=95% and smoke tests pass.
- Roll back cutover on either: indexing failure-rate breach or search quality/latency regression.
- Roll out pgvector on existing primary Postgres (`single_db`) with migration safeguards.
