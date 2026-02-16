# Research Notes

## Codebase Recon

### Architecture and Boundaries
- Node entrypoint is a consolidated tRPC router in `apps/web/server/routers.ts` that composes modular routers (`library`, `media`, `chat`, `systemSettings`, `search`, `infrastructure`) plus a legacy in-file `gallery` router block.
- Current vector search path in Node is isolated to `apps/web/server/routers/search.ts` -> `apps/web/server/services/vectorize-search.ts` -> `apps/web/server/services/vectorize-indexing.ts` -> `apps/web/server/services/vectorize.ts` (Cloudflare-only path).
- Library indexing is a separate cross-runtime pipeline:
  - Node enqueues DB-backed jobs via `apps/web/server/services/libraryService.ts` (`library_index_jobs` table).
  - Python processes jobs via Celery (`python-backend/app/tasks/media_tasks.py`) and `python-backend/app/services/library_indexing_service.py`.
  - Scheduling is periodic (`retry_library_index_jobs` every minute in `python-backend/app/core/celery_app.py`), not immediate per-event push.
- Media-generated content enters Library through `apps/web/server/routers/media.ts` -> `apps/web/server/services/mediaLibraryService.ts` (manual `addTaskToLibrary`), which then enqueues library index jobs.

### Integration Touchpoints (Impacted Areas)
- `apps/web/server/routers/search.ts`
  - Protected search endpoints derive tenant from authenticated context (`ctx.user.tenantId ?? String(ctx.user.id)`).
  - Uses Vectorize-only service calls.
- `apps/web/server/services/vectorize-indexing.ts`
  - Implements `indexDocument`, `indexImage`, `removeDocument`, `removeVector`.
  - Not currently wired to CRUD hooks in gallery/library/chat flows.
- `apps/web/server/routers.ts` (`gallery` block)
  - `gallery.create`, `gallery.update`, `gallery.delete`, bulk actions are present.
  - No vector indexing/deletion hooks.
- `apps/web/server/routers/library.ts` + `apps/web/server/services/libraryService.ts`
  - Upload/save/restore/media-add flows enqueue `library_index_jobs` and set item status to `indexing`.
  - Delete is soft-delete/permanent-delete in SQL domain; no provider-specific vector delete orchestration.
- `apps/web/server/routers/systemSettings.ts` + `apps/web/client/src/pages/AdminSettings.tsx`
  - Admin can configure vectordb provider and run connection tests/reindex.
  - UI warns on provider switch and offers reindex action.
- `python-backend/app/api/admin.py`
  - `/vectordb/reindex` and `/vectordb/reindex/status` trigger/inspect full reindex jobs.

### Provider Abstraction Reality Check
- Provider config exists in Node settings (`system_settings` category `vectordb`) and Admin UI.
- Python indexing service has adapters for Chroma, pgvector, Cloudflare (`_default_vector_upsert`, `_pgvector_vector_upsert`, `_cloudflare_vector_upsert`, `get_vector_upsert_fn`).
- Critical gap: production job execution path does not select provider from `system_settings`:
  - `process_library_index_job` defaults to `_default_vector_upsert` unless a custom function is injected.
  - Celery task entrypoint calls `process_library_index_job(db, job_id)` without injecting provider-specific upsert fn.
  - Result: provider switch in UI does not currently re-route indexing pipeline end-to-end.
- Additional embedding gap:
  - `python-backend/app/services/embedding_service.py` defaults to Chroma local embedding provider (384D) unless explicitly overridden in process memory.
  - Active embedding/provider selection is not bound to vectordb settings in the default job path.

### Existing Tests and Coverage Gaps
- Existing vector tests in Node:
  - `apps/web/server/__tests__/vectorize-embeddings.test.ts`
  - `apps/web/server/__tests__/vectorize-indexing.test.ts`
  - `apps/web/server/__tests__/vectorize-search.test.ts`
- These tests are isolated unit tests with mocked fetch/client; they do not validate router CRUD hooks, provider switching, queue execution, or migration behavior.
- Library router tests (`apps/web/server/routers/library.test.ts`) are largely mocked-service behavior tests, with several TODO placeholders for share/trash/permanent-delete scenarios.
- Missing integration/e2e coverage for:
  - Provider switch + reindex + search parity.
  - Cross-provider dimension/model change handling.
  - Gallery/chat/conversation indexing/deletion hooks.
  - Tenant isolation verification across all providers.
  - Rollback/restore behavior after failed reindex.

### Database and Migration Dependencies
- Core tables in Node Drizzle schema:
  - Gallery: `gallery_items` (tenant as integer FK).
  - Library: `library_items`, `library_chunks`, `library_index_jobs`, `library_links`, `library_permissions` (tenant mostly varchar).
  - Chat context candidates: `messages`, `conversations`, `conversation_summaries`, `entity_memories`.
  - Settings: `system_settings`.
- Python models include `vector_collections`, `vector_documents`, `embedding_jobs` in `python-backend/app/models/vector_store.py`, but repository migrations do not currently include creation scripts for these tables or pgvector extension.
- Migration directories currently lack concrete vector table migrations:
  - `python-backend/migrations` has no vector-table migration.
  - `apps/web/drizzle/migrations` currently only `.gitkeep`.
- Tenant ID type inconsistency is present and relevant to vector operations:
  - `gallery_items.tenantId` integer.
  - Library vector-related tables use varchar tenant IDs.
  - This increases mapping/migration risk when building unified cross-table indexing.

### Security and Tenant Controls (Current State)
- Positive controls:
  - Search router is `protectedProcedure`, tenant filter is server-derived.
  - Library service enforces tenant-based reads/writes and permission checks; includes explicit defense-in-depth checks in permission resolution.
  - Sensitive vectordb settings (`openaiApiKey`, `pgvectorPassword`, `vectorizeApiToken`) are encrypted/masked in Node settings flows.
- Gaps:
  - Unified vector operations audit trail is incomplete for non-library flows.
  - Deletion consistency across source rows and vector rows is not universally enforced.
  - Provider-switch execution path does not guarantee tenant-scoped reindex semantics across all target data domains beyond library items.

### Destructive/Data-Loss Risk Assessment
- Risk classification: `high`.
- Reasons:
  - Provider switch can lead to effectively empty/partial search until reindex completes.
  - Existing workers default to Chroma path even when other providers are selected, causing silent divergence between configured and actual storage target.
  - No complete migration scripts for pgvector table/extension lifecycle in current repo state.
  - Deletion hooks are incomplete across content domains (orphan/stale vector risk).
- Required mitigation direction for planning:
  - Non-destructive migration-first rollout (`expand -> backfill -> cutover -> contract`).
  - Backfill + validation before cutover.
  - Explicit rollback/restore runbook with trigger thresholds.
  - Per-tenant consistency verification checks post-cutover.

### Recon Summary Against Spec
- Confirmed by codebase:
  - Cloudflare vector services and search route exist but are not broadly integrated with content lifecycle hooks.
  - Provider config UI exists and supports save/test/reindex actions.
  - Library async indexing pipeline exists (DB job table + Celery retries) with observability hooks.
- Confirmed blockers:
  - No end-to-end provider dispatch from admin setting to active indexing worker path.
  - Legacy/backfill script `scripts/index-existing-content.ts` is a stub and skips actual tables.
  - Missing migration artifacts for pgvector model tables.
  - `.env.example` files are missing explicit vector provider variables currently used/planned in spec.

## Web Research

_Date: 2026-02-16 (user selected `apply_all` topics)_

### 1) BullMQ reliability patterns (idempotency, retries, dead-letter, backoff)
- BullMQ retry behavior should be configured with `attempts` + backoff strategy (`fixed` or `exponential`) to avoid immediate hot-loop retries.
- Idempotent job design is explicitly recommended by BullMQ docs to make retries safe.
- Duplicate indexing jobs can be prevented by deterministic `jobId` and/or deduplication (`deduplication.id`), which is relevant for repeated content updates.
- Stalled job behavior matters for long embedding operations: stalled jobs are moved back to wait (or failed after `maxStalledCount`), so worker logic should avoid event-loop blocking.
- BullMQ supports queue-level events and queue metrics (`completed`/`failed`) that map directly to observability requirements in this spec.
- Inference for this project: model queue keys as `{tenantId}:{sourceTable}:{sourceId}:{action}` and enforce idempotent worker handlers so retries and deduplication are safe.
- Sources:
  - https://docs.bullmq.io/guide/retrying-failing-jobs
  - https://docs.bullmq.io/patterns/idempotent-jobs
  - https://docs.bullmq.io/guide/jobs/job-ids
  - https://docs.bullmq.io/guide/jobs/deduplication
  - https://docs.bullmq.io/guide/jobs/stalled
  - https://docs.bullmq.io/guide/events
  - https://docs.bullmq.io/guide/metrics

### 2) pgvector migration + index tuning
- `CREATE EXTENSION [IF NOT EXISTS]` is the canonical way to install extension objects in a database; migration plans should include privilege checks and controlled rollout.
- pgvector supports both HNSW and IVFFlat; HNSW generally has better speed/recall but slower build and higher memory footprint; IVFFlat requires choosing lists/probes well.
- pgvector README guidance for IVFFlat: start lists at `rows/1000` (up to 1M rows) or `sqrt(rows)` (>1M); start probes near `sqrt(lists)`.
- HNSW build performance depends heavily on `maintenance_work_mem` and parallel maintenance workers; index build and monitoring (`pg_stat_progress_create_index`) should be first-class in rollout runbooks.
- Inference for this project: adopt an expand/backfill/validate/cutover plan with post-migration recall checks and index progress monitoring for large tenants.
- Sources:
  - https://www.postgresql.org/docs/current/sql-createextension.html
  - https://github.com/pgvector/pgvector

### 3) Cloudflare Vectorize operational limits + filtering semantics
- Metadata filtering is applied before topK selection, and namespace filtering is applied before metadata filters.
- Non-namespace metadata filtering requires pre-created metadata indexes; vectors inserted before index creation are not indexed for that property until re-upserted.
- Practical limits impact API/UX design: topK max is 100 without values/metadata and 20 when returning values/full metadata; 10 metadata indexes per Vectorize index; 10KiB metadata/vector.
- Inference for this project: `tenantId` should be modeled as namespace where possible plus metadata filter defense-in-depth, with careful handling of pre-indexed vectors during metadata-index rollout.
- Sources:
  - https://developers.cloudflare.com/vectorize/reference/metadata-filtering/
  - https://developers.cloudflare.com/vectorize/reference/client-api/
  - https://developers.cloudflare.com/vectorize/platform/limits/
  - https://developers.cloudflare.com/vectorize/best-practices/insert-vectors/

### 4) ChromaDB production persistence/backup guidance
- Chroma server persistence in Docker relies on persistent volume + `IS_PERSISTENT=TRUE` and configured `PERSIST_DIRECTORY`.
- Chroma production guidance emphasizes HA/scalability/security/observability/backup-and-restore as explicit operating requirements.
- Chroma constraints: collection dimension and distance function are immutable after collection creation.
- Inference for this project: provider switching to/from Chroma must assume re-embedding + collection recreation when model/dimension changes.
- Sources:
  - https://cookbook.chromadb.dev/running/running-chroma/
  - https://cookbook.chromadb.dev/running/road-to-prod/
  - https://cookbook.chromadb.dev/core/system_constraints/
  - https://docs.trychroma.com/

### 5) Embedding-model switch strategy (dimension changes + rollout)
- OpenAI embeddings document default dimensions (for example `text-embedding-3-small` default 1536, `text-embedding-3-large` default 3072) and supports optional `dimensions` parameter for `text-embedding-3*` models.
- Even when dimensions can be adjusted, embedding spaces differ by model/provider and should be treated as incompatible for existing ANN indexes.
- Inference for this project: provider/model switch should always trigger full re-embedding and dual-read or controlled cutover strategy until coverage/quality checks pass.
- Sources:
  - https://platform.openai.com/docs/guides/embeddings
  - https://platform.openai.com/docs/api-reference/embeddings/create
  - https://platform.openai.com/docs/models/text-embedding-3-small

### 6) Multi-tenant vector security patterns (metadata filters + auth boundaries)
- PostgreSQL row-level security requires explicit enablement and policy definitions; no applicable policy implies default deny.
- `CREATE POLICY` supports distinct read/write constraints (`USING` / `WITH CHECK`) and role scoping, which is useful for tenant guardrails on vector tables.
- Cloudflare Vectorize supports namespace and metadata filtering; docs indicate namespace filter is applied first.
- Chroma’s multi-tenancy docs identify app-enforced isolation as the simplest path, with stronger authorization models (for example OpenFGA) for production-grade isolation.
- Inference for this project: enforce tenant ID from server auth context only, apply provider-side filters plus DB-side RLS where applicable, and verify with negative cross-tenant tests.
- Sources:
  - https://www.postgresql.org/docs/current/ddl-rowsecurity.html
  - https://www.postgresql.org/docs/current/sql-createpolicy.html
  - https://www.postgresql.org/docs/current/view-pg-policies.html
  - https://developers.cloudflare.com/vectorize/reference/metadata-filtering/
  - https://cookbook.chromadb.dev/strategies/multi-tenancy/

### Web Research Decision Notes
- External web research was run for all proposed topics (`apply_all`).
- Scope was limited to primary technical documentation and official project repositories.
