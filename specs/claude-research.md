# Claude Research - SSP-LIB-RAG-2026-001

## Research Decision (Step 6)

- Codebase research: Yes
- Web research: No (spec is implementation-specific to this repository; no external standards dependency was required for initial planning)
- Testing coverage analysis: Yes

Reasoning:
- The spec is tightly coupled to current SmartSpec components (`apps/web`, `python-backend`, `apps/web/drizzle`).
- Highest risk is integration regression in existing media flows, not lack of public best-practice references.
- Current test coverage for media + library-like workflows is sparse, so testing strategy needs explicit planning.

## Codebase Findings (Step 7)

### 1) Existing media result path already supports model-config-driven query endpoints

- Admin model config already exposes `apiQueryEndpoint` in `configJson`.
- Frontend/server skill execution maps model config into runtime `apiConfig.query_endpoint`.
- Python fetch-result resolves preferred query endpoint from task parameters or DB model config.
- Kie provider supports endpoint normalization, placeholder substitution (`{task_id}`), and fallback endpoints.

Implication:
- Phase 0 does not need brand-new endpoint architecture; it needs strict contract enforcement and field-mapping hardening around `provider_task_id`.

### 2) Reliability exists, but callback durability is incomplete

- Callback endpoint exists (`/api/v1/media/callback/kie-ai`) and updates tasks.
- Callback payloads are temporarily stored in `_pending_callbacks` (in-memory dict).
- Celery periodic recovery exists:
  - `retry_failed_tasks`
  - `recover_stuck_tasks`
  - `cleanup_expired_tasks`

Gap:
- No persistent callback retry queue or DLQ model for media callback processing failures.
- In-memory callback state will be lost on process restart.

### 3) Current “library” is fragmented

- `gallery_items` supports saved media showcase usage.
- Media History supports “Add to Gallery,” not unified multi-source library.
- Video editor `MediaLibraryPanel` is editor/project asset oriented, not cross-product RAG library.
- No schema for `library_items`, `library_chunks`, `library_links`, `library_permissions`, `library_index_jobs`.

Implication:
- New library must be introduced as a separate domain model rather than extending gallery-only semantics.

### 4) Vector/RAG foundations are present but mixed

- Active, production-used path exists around Chroma + embedding service.
- Separate pgvector-oriented implementation exists (`vector_store` models + `PgVectorStore`), but integration appears partial.

Implication:
- MVP should avoid forced vector backend switch.
- Introduce storage abstraction so MVP can start with currently running backend and later migrate to pgvector per tenant/environment.

### 5) Existing provider/admin schema can absorb proposed provider config

- `media_models.configJson` already contains per-model extensible config.
- `media_providers` exists for provider-level config.

Implication:
- Proposed `provider_model_configs` can be implemented either as:
  - explicit normalized table, or
  - structured/validated extension of `media_models.configJson`.

Recommendation:
- For MVP speed and compatibility, keep model-level config in `media_models.configJson` with strict schema validation and migration helpers.
- Revisit normalized table in Phase 4/5 if config complexity grows.

## Testing Coverage Analysis

### Frontend/Web (`apps/web`)

- Existing tests around media are mostly shared types/client helpers.
- Limited direct router/API tests for `server/routers/media.ts` behavior.
- No current tests for Add-to-Library flows, hybrid library search, or Chat source picker integration.

### Python backend (`python-backend`)

- `test_media_task_service.py` covers basic media task service behavior.
- Existing integration tests focus on media job pipeline and security, not callback DLQ or library indexing.
- RAG tests exist (`tests/orchestrator/rag/test_hybrid_rag.py`) but do not cover new library ingestion/search contracts.

### Risk Concentrations

- Provider task ID mapping correctness (`task_id` internal vs external provider ID usage).
- Callback failure handling and delayed reconciliation path.
- Cross-service data consistency between Node API actions and Python indexing workers.
- Tenant isolation and ACL filtering in search results.

## Constraints and Opportunities

### Constraints

- Feature spans two runtimes and schema layers:
  - Node+tRPC+Drizzle
  - Python FastAPI+Celery+SQLAlchemy
- Existing data models are active in production-like paths; destructive changes are high risk.

### Opportunities

- Reuse established async worker pattern in Celery.
- Reuse existing memory router/service patterns for context attachment ergonomics in Chat.
- Reuse admin media model config UX to avoid introducing a second provider admin surface in MVP.

## Recommended Architectural Direction for Planning

1. Stabilize provider result flow first (strict external task ID, callback durability, reconcile).
2. Add library relational schema and ingestion job table with clear state machine.
3. Build Python indexing/search service with pluggable vector backend adapter.
4. Expose minimal Node/tRPC APIs for Add-to-Library and search to frontends.
5. Integrate Media Studio + History first, then Chat source picker.
6. Gate all major functionality behind tenant-scoped feature flags with phased rollout.
