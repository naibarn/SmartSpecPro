# Synthesized Specification - Unified Library/RAG Layer (SSP-LIB-RAG-2026-001)

## 1. Objective

Deliver a tenant-safe, reusable Library/RAG layer that unifies generated media (and later documents) so users can add, index, search, and reuse assets across Media Studio, Media History, and Chat.

## 2. In-Scope (MVP + Planned Sequencing)

### Phase 0 (stabilization prerequisite)
- Enforce provider result querying by external provider task identifier.
- Ensure model-config-driven query endpoint + parser behavior is explicit and testable.
- Add durable callback retry and DLQ flow.
- Keep scheduled reconciliation for stuck tasks and harden state transitions.

### Phase 1 (library schema)
- Introduce normalized library entities:
  - `library_items`
  - `library_chunks`
  - `library_links`
  - `library_permissions` (or equivalent policy model)
  - `library_index_jobs`
- Add indexes for tenant-scoped search filters and ingestion throughput.

### Phase 2 (ingestion entrypoints)
- Add `Add to Library` API and UI actions from:
  - Media Studio results
  - Media History rows/details
- Optional auto-add on completed tasks controlled by feature flags/config.
- Create async indexing jobs for each library item.

### Phase 3 (retrieval)
- Add hybrid search API (keyword + vector + deterministic filters).
- Expose search+selection in Media Studio and Chat context picker.
- Ensure response contract supports “attach to chat context” workflow.

### Phase 4+ (deferred expansion)
- Document management ingest/search/preview/versioning.
- Governance enhancements and monitoring dashboard.

## 3. Functional Requirements

### 3.1 Library Domain
- Store `image|video|document` uniformly with metadata, source, ownership, and visibility.
- Keep source lineage through link table (`media_task`, `gallery_item`, `message`, `document_version`).
- Soft delete support with recoverable state.

### 3.2 Ingestion and Indexing
- Asynchronous indexing pipeline:
  1. Normalize metadata and text material
  2. Chunk content by type
  3. Generate embeddings
  4. Upsert into vector store
  5. Persist chunk/index job status
- Support retryable job failures and explicit error surfaces.

### 3.3 Search
- Hybrid query behavior:
  - keyword ranking over structured text fields
  - vector similarity ranking over chunk embeddings
  - deterministic filters (`type`, `owner`, `model`, `tags`, date range)
- Tenant isolation and visibility filtering are mandatory in every query path.

### 3.4 Media Result Reliability
- Distinguish and enforce:
  - `internal_task_id` (system primary task)
  - `provider_task_id` (external provider identifier)
- Callback receiver must be idempotent.
- Callback failures must enter retry path before DLQ.
- Reconciliation job must poll unresolved processing tasks using model-config endpoint/parser rules.

### 3.5 Frontend Integration
- Media Studio:
  - Add-to-Library action for completed assets
  - Search Library panel with index status badges
- Media History:
  - Add-to-Library action per task
  - Display “already in library” indicator
- Chat:
  - Source picker for Library search
  - Attach selected library item to conversation context

## 4. Non-Functional Requirements

### Security and Compliance
- Tenant-scoped authorization in all CRUD/search/index endpoints.
- Controlled media URL access policy (signed URL or equivalent).
- Audit trail for add/share/delete/reindex.
- No secrets or PII leakage in logs.

### Performance
- Search API p95 < 800ms (general query).
- Add-to-library API p95 < 300ms (enqueue only).
- Index job start latency < 30s under normal queue load.
- Callback recovery success > 99% within 15 minutes.

### Reliability
- At-least-once callback processing, exactly-once state transitions via idempotent updates.
- Durable retry + DLQ + operator reprocess endpoint.
- Recoverability after worker/process restart.

## 5. Data and Contract Decisions

- Prefer extending `media_models.configJson` for result query config in MVP with strict validation and parser-key registry.
- Keep vector backend pluggable; avoid mandatory backend migration in MVP.
- Implement library schema in `apps/web/drizzle` and corresponding Python model/service contracts.

## 6. Explicit Assumptions (from interview pass)

- Default visibility: `private`.
- Auto-add defaults OFF; controlled by per-tenant/per-model flag.
- Vector backend for MVP uses currently active path, abstracted for future pgvector.
- Document versioning later uses immutable revisions.

## 7. Out of Scope for This Planning Cycle

- Advanced auto-tagging/scene detection.
- Enterprise policy engine breadth.
- Full historical reindex from day one.
- Rich document collaboration beyond ingest/search/version baseline.

## 8. Acceptance Criteria (MVP)

- Users can add image/video results into library from Media Studio and Media History.
- Indexed items are searchable from Media Studio and Chat with hybrid retrieval + filters.
- Media completion path no longer depends primarily on manual fetch.
- Callback retry/DLQ/reconcile pipeline is operational and observable.
- Tenant isolation and ACL behavior are covered by unit/integration tests.
