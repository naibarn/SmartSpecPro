# Interview Transcript — Spec 056: Agency Memory Hybrid 2-Level Vector RAG

## Q1: Memory Scale per Agent

**Q:** What's the expected scale of agency_agent_memories per tenant? Dozens, hundreds, or thousands of memories per agent?

**A:** Medium (100-1000/agent) — Heavy-use agents accumulate hundreds of memories over weeks/months.

## Q2: Feature Rollout Strategy

**Q:** Should the 2-level retrieval (vector search) be enabled by default for all agencies, or gated behind a feature flag that admins enable per-agency?

**A:** Default ON for all — All agencies get vector retrieval immediately. Faster impact.

## Q3: Chunk Retention Configuration

**Q:** For Level 2 chunk retention, should the 7-day default be configurable per-tenant via admin settings, or is a fixed retention period acceptable?

**A:** Configurable per-tenant — Admin can set retention (e.g., 3-30 days) in tenant settings. More flexible but needs UI.

## Q4: Embedding Failure Mode

**Q:** When embedding generation fails (e.g., OpenAI API down), should memory save/retrieval degrade gracefully to confidence-sort (current behavior) or fail the operation?

**A:** Graceful degradation — Save memory without embedding, retrieve falls back to confidence-sort. No user impact.

## Q5: Embedding Backfill Strategy

**Q:** Should the embedding backfill for existing memories run automatically on deploy, or be triggered manually by an admin?

**A:** Auto on deploy — Celery task auto-starts after migration. ~30s for ~2000 rows, $0.04 cost.

---

## Auto-Decisions (Technical — Not Asked)

- **Embedding model**: text-embedding-3-small (1536-dim) — matches existing embedding_service.py
- **Index type**: HNSW with default params (m=16, ef_construction=64) — optimal for < 1M rows per pgvector research
- **Partial index**: WHERE `isActive = true` — matches spec design and best practice
- **Distance metric**: Cosine with application-side threshold filtering — per pgvector best practices (threshold via WHERE doesn't use index)
- **Purge schedule**: Celery beat daily — matches existing `decay-agent-memories` pattern
- **Testing**: pytest with AsyncSession mocking — matches existing long_term_memory tests
- **Feature flag**: Use `check_agentic_flag()` pattern — matches existing codebase
- **SQLAlchemy model**: Follow existing patterns in `python-backend/app/models/`
- **Drizzle schema**: Follow pgTable pattern with vector1536 helper (matches scoped_memories)
- **RRF fusion k=60**: Industry standard, matches existing hybrid_rag.py
