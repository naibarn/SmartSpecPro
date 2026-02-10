# Implementation Plan - Unified Library/RAG Layer (SSP-LIB-RAG-2026-001)

## 1. Plan Intent

This plan defines a phased implementation to introduce a unified library + RAG layer while reducing current media result reliability risk. The delivery order intentionally stabilizes provider-result flow before adding new ingestion and search surfaces.

## 2. Current-State Constraints and Design Principles

### Constraints
- Feature spans Node/tRPC/Drizzle and Python/FastAPI/Celery/SQLAlchemy.
- Existing media completion flow is production-relevant and must remain backward compatible.
- Callback handling currently includes volatile in-memory state.
- No existing unified library schema exists.

### Principles
- Preserve existing user-visible media generation behavior.
- Add new capability behind feature flags and progressive rollout.
- Keep task identifiers explicit (`internal_task_id` vs `provider_task_id`) in every boundary.
- Use async indexing and durable retry for all unreliable external interactions.
- Enforce tenant and visibility checks in the data access layer, not only at route level.

## 3. Cross-Runtime Ownership Contract

- Schema ownership:
  - Drizzle migrations under `apps/web/drizzle/` are the source of truth for new relational tables.
- Python data access:
  - SQLAlchemy models in `python-backend/app/models/` must map exactly to migrated schema.
- Contract management:
  - Every schema change ships with both migration artifacts and compatibility notes for Python services.
- Compatibility rule:
  - Additive schema changes first; destructive changes only after deprecation window and data migration completion.

## 4. Target Architecture

### 4.1 Domain Layers
- Library Domain Layer:
  - item lifecycle, metadata normalization, ACL evaluation, source linking
- Ingestion Layer:
  - chunking, embedding, vector upsert, index-job state transitions
- Search Layer:
  - hybrid retrieval, filtering, ranking/merging
- Media Reliability Layer:
  - callback idempotency, retry/DLQ, reconciliation polling

### 4.2 Runtime Responsibilities
- Web/Node runtime:
  - user-facing APIs, tRPC procedures, UI integration actions
  - relational writes for add-to-library requests and metadata updates
- Python runtime:
  - background ingestion/indexing execution
  - provider callback processing and reconciliation jobs
  - retrieval logic where vector orchestration currently lives

## 5. Data Model Delivery

### 5.1 New relational tables (Drizzle-first schema source)
- `library_items`
- `library_chunks`
- `library_links`
- `library_permissions` (or embedded ACL strategy with extension point)
- `library_index_jobs`
- `media_callback_events` (durable callback processing ledger)
- `media_callback_dlq` (terminal callback processing failures)

### 5.2 Key indexes
- tenant + visibility + status composite indexes on `library_items`
- tenant + content_type indexes on `library_chunks`
- unique/lookup indexes for source linkage in `library_links`
- status + run_at indexes for `library_index_jobs`
- status + next_retry_at indexes on callback event tables

### 5.3 Migration strategy
- Additive migrations only in MVP.
- Backfill is incremental for recent media records, not full historical.
- Backfill execution is resumable, throttled, and metrics-instrumented.

## 6. API Contract Plan

### 6.1 Media reliability contracts
- Require and validate `provider_task_id` for provider status queries.
- Maintain explicit response fields for both internal and provider identifiers.
- Normalize provider parser selection via validated model config key.

### 6.2 Library APIs
- Create item (`POST /api/library/items`)
- Trigger/retry index (`POST /api/library/items/:id/index`)
- Share/update permissions (`POST /api/library/items/:id/share`)
- Get item (`GET /api/library/items/:id`)
- Search (`GET /api/library/search?...`)
- Soft delete (`DELETE /api/library/items/:id`)

### 6.3 Media integration APIs
- Add-to-library from task (`POST /api/media/tasks/:id/add-to-library`)
- Optional auto-add hook for completed tasks (feature-flag guarded)

### 6.4 Search response contract versioning
- Introduce versioned response schema (`library_search_v1`) used by both Media Studio and Chat.
- Required payload fields:
  - item identity and type
  - display metadata (`title`, `thumbnail_url`, `status`)
  - provenance (`source`, `provider_name`, `model_name`)
  - ranking metadata (`combined_score`, `keyword_score`, `vector_score` when available)
  - permission-safe attach payload for chat context.

## 7. Reliability Hardening Plan

### 7.1 Callback processing (persistent)
- Replace in-memory pending callback behavior with durable persistence.
- Make callback updates idempotent via state transition guards.
- Track processing attempts and last error metadata.

### 7.2 Callback transition strategy
1. Introduce persistent callback event writes behind a feature flag.
2. Shadow-write while keeping current path active; compare processing outcomes.
3. Enable persistent processor as primary retry engine.
4. Deprecate/remove in-memory callback cache after observation window.

### 7.3 Retry and DLQ
- Introduce media-callback retry queue semantics with exponential backoff.
- Introduce media-focused DLQ record model and reprocess endpoint.
- Ensure operator visibility for terminal failures.

### 7.4 Scheduled reconciliation
- Keep existing stuck-task poller and integrate parser/endpoint config validation.
- Log and metric every state transition and mismatch condition.

## 8. Ingestion and Search Plan

### 8.1 Ingestion state machine
- `queued -> processing -> indexed`
- failure path: `processing -> failed` with retry limit and reason
- retries increment attempt counter and preserve full failure context

### 8.2 Chunking and embedding
- Extract text from prompt/description/caption/transcript/OCR sources.
- Chunk with deterministic boundaries and token metadata.
- Persist chunk metadata and vector ID linkage.

### 8.3 Hybrid retrieval
- Candidate set from keyword and vector channels.
- Merge and score with deterministic tie-breakers.
- Apply tenant + ACL filters pre-return.

## 9. Frontend Delivery Plan

### 9.1 Media Studio
- Add “Add to Library” action on generated results.
- Add “Search Library” panel for retrieval and reuse.
- Render indexing status badges and failure-retry affordance.

### 9.2 Media History
- Add row/detail action for add-to-library.
- Show existing-library linkage state.

### 9.3 Chat
- Add source picker for library search.
- Support attach-to-context for chosen library item.

## 10. Backfill Controls and Operational Safety

- Tenant-scoped batch processing with configurable batch size.
- Concurrency caps for indexing workers during backfill windows.
- Pause/resume controls for backfill jobs.
- Dry-run mode to estimate volume and expected queue pressure.
- Idempotent item/link detection to prevent duplicate ingestion.

## 11. Feature Flags and Rollout

### 11.1 Flags
- `library_enabled`
- `library_auto_add_enabled`
- `library_chat_source_picker_enabled`
- `media_callback_persistent_pipeline_enabled`

### 11.2 Rollout order
1. Internal tenants: media reliability hardening + add-to-library manual only.
2. Limited tenant cohort: search in Media Studio.
3. Expanded cohort: search in Chat source picker.
4. Post-stabilization: document ingestion phase.

### 11.3 Quantitative release gates
- Callback recovery success >= 99% within 15 minutes over agreed observation period.
- DLQ net growth near zero under steady-state load.
- Reprocess success rate for DLQ above target threshold.
- Search p95 and add-to-library p95 remain within SLO limits.

## 12. Observability and Operations

### Metrics
- add-to-library success/failure rates
- index-job queue latency and completion latency
- search latency and hit-rate
- callback recovery within SLA window
- DLQ backlog and reprocess success rate

### Logging
- Structured logs with tenant/task/item identifiers
- Redaction rules for secrets and sensitive payload segments

### Admin operations
- Reprocess DLQ endpoint
- Reindex item endpoint
- Dashboard tiles for callback/index status and recent failures

## 13. Security and Multi-Tenancy Plan

- Enforce tenant scope in query builders and service layer.
- Validate ownership and visibility before returning item metadata URLs.
- Use controlled URL policy for media access.
- Capture audit events for add/share/delete/reindex operations.

## 14. Risk Register and Mitigations

- Identifier confusion risk (internal vs provider task IDs):
  - mitigate with explicit schema fields, endpoint validation, and regression tests.
- Cross-runtime consistency risk:
  - mitigate with idempotent event handling and reconciliation checks.
- Search relevance risk:
  - mitigate with staged hybrid merge tuning and feedback metrics.
- Migration risk:
  - mitigate with additive schema, dry-run backfill, and tenant-scoped rollout.

## 15. Test Strategy Integration

- Unit tests for parser mapping, ACL logic, chunking, state machine transitions.
- Integration tests for task completion to add-to-library to indexed to searchable.
- Reliability tests for callback fail/retry/DLQ/reconcile flows.
- E2E tests for Media Studio, Media History, and Chat library reuse journeys.
- Regression tests to ensure existing media generation and history behavior remain intact.

## 16. Definition of Completion (MVP)

MVP is complete when:
- Manual add-to-library works from Media Studio and Media History for image/video.
- Indexed assets are retrievable by hybrid search in Media Studio and Chat.
- Callback/manual fetch dependence is reduced by durable retry/reconcile flow.
- Operational telemetry and reprocessing capabilities exist for indexing and callback failures.
- Quantitative reliability gates in section 11.3 are met.
