# TDD Plan - Unified Library/RAG Layer (SSP-LIB-RAG-2026-001)

This file mirrors `claude-plan.md` and defines tests to write before implementation tasks.

## 1. Plan Intent

- Test: plan artifacts exist and remain internally consistent (`spec`, `plan`, `tdd`, `sections`).

## 2. Current-State Constraints and Design Principles

- Test: existing media generation task lifecycle behavior remains unchanged for non-library paths.
- Test: existing fetch-result endpoint behavior remains backward compatible for successful tasks.

## 3. Cross-Runtime Ownership Contract

- Test: migrations create expected tables/columns/indexes and Python models can read/write them.
- Test: schema compatibility check fails fast on missing required columns.

## 4. Target Architecture

- Test: service boundaries enforce expected call flow (Node API enqueue -> Python worker processing).
- Test: tenant isolation is validated in each service layer entrypoint.

## 5. Data Model Delivery

- Test: `library_items` create/read/update/soft-delete lifecycle with tenant scoping.
- Test: `library_links` uniqueness and source mapping rules.
- Test: `library_chunks` insertion with chunk ordering and content type validation.
- Test: `library_index_jobs` state transition validity and attempt counter behavior.
- Test: callback persistence tables (`media_callback_events`, `media_callback_dlq`) enforce required fields and status transitions.

## 6. API Contract Plan

- Test: media result query rejects/guards invalid provider task mapping inputs.
- Test: library item create endpoint validates required fields and returns normalized payload.
- Test: library search endpoint returns contract-compliant response shape (`library_search_v1`).
- Test: add-to-library endpoint is idempotent for repeated requests on same source task.

## 7. Reliability Hardening Plan

- Test: callback handler is idempotent for duplicate callback payloads.
- Test: callback processing retries transient failures with exponential backoff behavior.
- Test: terminal callback failures enter DLQ with diagnostic metadata.
- Test: reconciliation job updates stale processing tasks to completed/failed when provider state changes.

## 8. Ingestion and Search Plan

- Test: indexing pipeline transitions `queued -> processing -> indexed` with persistent status updates.
- Test: chunker produces deterministic chunk boundaries for identical input.
- Test: hybrid retrieval merges keyword/vector results deterministically.
- Test: ACL/tenant filters are applied before result return.

## 9. Frontend Delivery Plan

- Test (UI): Media Studio shows Add-to-Library action only for eligible completed assets.
- Test (UI): Media Studio Search Library panel displays ready/indexing/failed states.
- Test (UI): Media History can add item and reflects already-added state.
- Test (UI): Chat source picker can search and attach selected library item to context.
- Test (UI): Dashboard has direct navigation entry to Document Management.
- Test (UI): Document Management correctly separates My Library, Shared With Me, and Shared Groups.
- Test (UI): Multi-format preview supports common types and falls back safely when unsupported.
- Test (UI): Markdown editor save updates content and triggers indexing status transitions.
- Test (UI): Default sort is newest first; keyword search and filters remain stable during pagination.

## 10. Backfill Controls and Operational Safety

- Test: backfill dry-run reports estimated counts without writing data.
- Test: backfill pause/resume preserves progress cursor and avoids duplicates.
- Test: concurrency cap is honored under multi-worker load.

## 11. Feature Flags and Rollout

- Test: feature flags gate new API/UI routes correctly per tenant.
- Test: disabling flags reverts to baseline behavior without runtime errors.

## 12. Observability and Operations

- Test: required metrics emit on add/index/search/callback/DLQ events.
- Test: structured logs include correlation IDs without secrets.
- Test: admin reprocess endpoint moves DLQ entries back into retry pipeline.

## 13. Security and Multi-Tenancy Plan

- Test: cross-tenant access attempts are denied for item read/search/share operations.
- Test: visibility rules (`private|team|public`) are enforced in search and get-item paths.
- Test: audit events are written for add/share/delete/reindex operations.

## 14. Risk Register and Mitigations

- Test: internal vs provider task ID mismatch is detected and surfaced with actionable error.
- Test: dual-write callback transition does not create divergent terminal states.

## 15. Test Strategy Integration

- Test: representative end-to-end path passes:
  - media task completion -> add to library -> indexed -> searchable -> attach in chat
- Test: regression suite confirms media generation/history flows remain stable.

## 16. Definition of Completion (MVP)

- Test: SLO and reliability gate metrics are queryable and meet thresholds in staging observation window.
- Test: no critical P0/P1 failures remain in callback/index/search workflow during rollout validation.

## 17. UI/UX Extension - Document Management (Post-MVP track)

- Test: permission-driven UI hides unauthorized edit/share/delete actions.
- Test: share provenance labels (owner/direct/group) are accurate for every listed file.
- Test: markdown save conflict returns actionable UI state without silent overwrite.
- Test: re-index enqueue after markdown save is idempotent per content version.
