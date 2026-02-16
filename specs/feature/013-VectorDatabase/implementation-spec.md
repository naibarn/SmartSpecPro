# Implementation Spec: Vector Database Productionization (Feature 013)

Date: 2026-02-16
Source Spec: `spec.md`
Planning Intent: `resume_progress`

## 1. Objective
Deliver a production-ready, provider-switchable vector search system for SmartSpecPro where `cloudflare_vectorize`, `pgvector`, and `chromadb` are operationally usable under one admin-controlled configuration, with automatic indexing/deletion for prioritized content domains and safe migration/cutover behavior.

## 2. Scope

### In Scope (v1)
- Automatic indexing and deletion for `gallery` and `library` content domains.
- Unified provider abstraction used by Node search/indexing entrypoints.
- Provider dispatch controlled by `system_settings` (`vectordb` category).
- Asynchronous indexing using existing DB job + Celery pipeline as the primary queue mechanism.
- Provider switch flow with staged cutover and readiness gate.
- Reindex orchestration for provider/model switches.
- Tenant isolation hardening:
  - Provider-side tenant filtering (metadata/namespace as supported).
  - pgvector DB-side Row Level Security (RLS).
- Audit and health observability for vector operations.
- Backfill execution path for existing `gallery` and `library` data.
- Environment/config documentation updates for vector provider operation.

### Out of Scope (v1)
- Full indexing/search integration for `messages`, `conversations`, `conversation_summaries`, and `entity_memories`.
- Replacing Celery pipeline with BullMQ as primary indexing infrastructure.
- Cross-tenant analytics features over vector data.

## 3. Required Product Behaviors
- Upload/create/update flows in `gallery` and `library` enqueue index jobs automatically.
- Delete/permanent-delete flows enqueue vector deletion jobs automatically.
- Search routes query the active provider selected in admin settings.
- Provider switch does not immediately drop user-facing search quality:
  - Existing provider remains read-active during reindex.
  - New provider becomes read-active only when readiness gate passes.
- Provider switch readiness gate is `coverage_95_plus_smoke`:
  - At least 95% of eligible records indexed in new provider.
  - Smoke tests for search correctness/latency pass.
- Rollback trigger is `either`:
  - Failure rate breach, or
  - Search quality/latency regression.

## 4. Technical Constraints and Decisions
- Primary async indexing path must remain DB-backed jobs + Celery workers.
- pgvector rollout mode is `single_db` on existing Postgres.
- Tenant/security policy is strict dual enforcement (provider + DB RLS).
- Provider/model switches require re-embedding and reindexing; embeddings are treated as non-transferable across providers/models.
- Cloudflare Vectorize metadata index constraints and topK limits must be respected.

## 5. Current-State Gaps to Close
- Provider config exists but is not consistently used in active indexing execution path.
- Existing worker defaults can drift from selected provider.
- Indexing and deletion hooks are incomplete across target CRUD flows.
- Backfill script for existing data is stubbed/non-functional.
- pgvector model tables and extension rollout are incomplete in migrations.
- Monitoring and failure diagnostics are insufficient for production SLOs.

## 6. Target Architecture

### 6.1 Control Plane
- Admin settings remains source of truth for provider configuration and credentials.
- Runtime provider resolver reads effective config, validates readiness state, and routes operations.
- Provider cache invalidation occurs on config changes and cutover events.

### 6.2 Data Plane
- Node entrypoints for search/indexing call a unified vector service abstraction.
- Unified service routes to provider adapters:
  - Cloudflare Vectorize adapter
  - pgvector adapter
  - Chroma adapter
- Indexing tasks are enqueued into existing DB job mechanism and processed by Celery workers.

### 6.3 Provider Switch Lifecycle
1. Admin updates provider config and requests switch.
2. System validates target provider connectivity.
3. System starts reindex campaign into target provider (write target may be dual during migration policy window).
4. System tracks coverage, failures, latency, and smoke-test outcomes.
5. On `coverage_95_plus_smoke`, reads cut over to new provider.
6. On rollback trigger (`either`), reads revert to previous provider and incident state is surfaced.

## 7. Data and Schema Requirements

### 7.1 Provider-Independent Vector Metadata
Every indexed vector record must include tenant-safe metadata envelope:
- `tenantId` (required)
- `sourceTable` and `sourceId`
- `type` and `title`/display fields as applicable
- `createdAt`
- Optional chunk metadata (`chunkIndex`, `parentId`)

### 7.2 pgvector (single_db)
- Ensure extension installation workflow for `vector` is migration-managed.
- Add/verify vector tables and indexes required for production querying.
- Apply RLS policies enforcing tenant constraints for read/write paths.
- Validate index strategy and query tuning parameters per dataset scale.

## 8. Security and Compliance Requirements
- Tenant identity must be server-derived only (never client-provided for filters).
- Provider-side filters are mandatory for query/update/delete operations.
- pgvector tables require explicit RLS policies with deny-by-default behavior.
- Sensitive provider credentials remain encrypted/masked in settings interfaces.
- Audit log must record provider switch, index/delete/search failures, and reindex events.

## 9. Observability Requirements
- Required telemetry:
  - indexing success/failure counts and rate
  - queue depth/lag and retry behavior
  - search latency distribution and error rate
  - provider health and connection status
  - per-tenant cutover coverage progress
- Required admin visibility:
  - provider status
  - reindex progress
  - failed indexing count and recent failure reasons
  - last successful indexing time

## 10. Testing and Verification Requirements
- Unit coverage for provider resolver/dispatch, adapters, and settings-driven behavior.
- Integration coverage for:
  - create -> indexed -> searchable
  - delete -> removed from search
  - provider switch staged cutover
  - rollback triggers and fallback behavior
  - tenant isolation negative tests (cross-tenant denial)
- Migration verification:
  - extension/table/index creation
  - RLS policy enforcement
  - post-migration consistency checks

## 11. Acceptance Criteria
- `gallery` and `library` items become searchable automatically after asynchronous indexing.
- Deletions in scoped domains remove vectors and search does not return deleted content.
- Admin can switch among all three providers with staged cutover policy.
- New provider cutover occurs only on `coverage_95_plus_smoke`.
- Rollback executes on either failure-rate breach or search regression.
- pgvector runs on primary Postgres with enforced tenant RLS.
- Vector operations are observable through logs/metrics and admin health views.

## 12. Risks and Explicit Non-Assumptions
- Provider-specific capabilities differ (dimension, filters, limits), so behavior must be normalized by abstraction and verified by compatibility tests.
- Existing content quality/consistency may affect coverage calculations; readiness metrics must account for excluded/invalid records transparently.
- No assumption of zero-downtime reindex by default; staged read cutover is mandatory risk control for v1.
