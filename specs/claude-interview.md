# Claude Interview Transcript - SSP-LIB-RAG-2026-001

Interview mode for this run:
- The provided spec is already detailed and includes explicit open questions.
- No additional live stakeholder responses were captured in this session.
- To unblock planning, provisional decisions are documented below and marked as assumptions requiring confirmation.

## Q1. What should default visibility be for newly added library items?

**Provisional answer:** `private` by default.

Rationale:
- Safer for multi-tenant and compliance posture.
- Can later be expanded to team sharing with explicit user action.

## Q2. Should completed media tasks auto-add to library?

**Provisional answer:** Default OFF globally; enable via per-tenant/per-model flags.

Rationale:
- Avoids noisy/low-quality library growth.
- Supports staged rollout and per-model reliability differences.

## Q3. Which vector backend should MVP target in production?

**Provisional answer:** Start with existing active backend path (currently Chroma-based patterns), expose adapter abstraction for later pgvector migration.

Rationale:
- Lower migration risk and faster delivery.
- Avoids blocking MVP on vector backend cutover.

## Q4. How should document versioning behave in document management expansion?

**Provisional answer:** Immutable revisions with explicit latest pointer.

Rationale:
- Better auditability and rollback.
- Reduces ambiguity for RAG index freshness.

## Q5. What is the expected access control model in MVP?

**Provisional answer:** Item-level visibility (`private|team|public`) plus optional explicit grants table for exceptions.

Rationale:
- Fits proposed schema and supports future RBAC evolution.

## Q6. How strict should callback processing be?

**Provisional answer:** At-least-once processing with idempotent state updates, persistent retry queue, and DLQ for terminal failures.

Rationale:
- Required to remove manual fetch as primary recovery mechanism.

## Q7. What minimum search quality is expected in MVP?

**Provisional answer:** Hybrid search with deterministic filtering and lightweight rerank; advanced semantic rerank tuning deferred.

Rationale:
- Meets MVP SLO/scope without overfitting ranking models.

## Q8. What migration/backfill scope is acceptable initially?

**Provisional answer:** Incremental backfill for recent media only, with explicit admin-triggered reindex tooling.

Rationale:
- Avoids expensive full historical reindex in first release.

## Q9. What should happen when indexing fails?

**Provisional answer:** Mark item/index job failed, preserve item for manual retry, log actionable error metadata.

Rationale:
- Prevents data loss and supports operator recovery.

## Q10. Should Add-to-Library be synchronous or async?

**Provisional answer:** API is synchronous for item creation + job enqueue; indexing remains async.

Rationale:
- Meets responsiveness targets (`<300ms` API p95) while keeping ingestion scalable.

## Confirmation Needed

Please confirm or revise these provisional answers before implementation begins. They are embedded into the plan as explicit assumptions.
