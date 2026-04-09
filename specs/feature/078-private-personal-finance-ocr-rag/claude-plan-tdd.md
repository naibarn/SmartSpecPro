# TDD Plan

The tests below mirror the implementation plan and should be written before each section is implemented.

## 1. Schema, Migrations, and Shared Contracts

- Add schema tests that prove the new finance tables exist with required ownership and idempotency columns.
- Add schema tests that prove `library_items`, `library_chunks`, and `library_index_jobs` now carry `project_id`.
- Add schema or migration tests that prove purge/backfill cleanup paths are present for library-backed finance evidence and vector artifacts.
- Add migration-order tests that prove RLS / FORCE RLS changes and finance backfill steps are present in the expected order.
- Add regression tests that prove legacy library rows without `project_id` remain compatibility-only.
- Add type-level or router-level contract tests for the shared finance payload shapes if a shared type module is introduced.

## 2. Personal Chat Lock and UI Entry Points

- Add router tests that prove `createConversation` can create a personal chat with `projectId = "personal"`.
- Add router tests that prove `updateConversation` rejects attempts to retarget a personal conversation to a work project.
- Add router tests that prove the generic project update path cannot set the reserved personal slug unless the explicit personal-create flow is used.
- Add router tests that prove personal conversations still load correctly through list/get endpoints.
- Add UI tests for the personal entry point, lock badge, and hidden or disabled project selector.
- Add UI tests that prove the personal state is visible in chat header and sidebar presentations.

## 3. Finance Router and Finance Service

- Add router tests for `parseTextToDraft` that prove structured draft shape, confidence, and missing-field behavior.
- Add router tests for draft creation idempotency so the same draft request does not duplicate work.
- Add router tests for `confirmDraft` that prove repeat calls return the same logical result and do not double-create transactions.
- Add router tests for `updateDraft`, `voidTransaction`, and recurring rule mutations that prove owner-only or project-permission checks.
- Add service tests for daily and monthly summary queries that prove values come from SQL aggregation, not model output.
- Add service tests for timezone-aware bucket boundaries and recurring rule scheduling defaults.
- Add authorization matrix tests for personal vs work access on each finance procedure.

## 4. OCR Intake and Document Extraction

- Add upload tests that accept the finance allowlist only, including HEIC when the signature is valid, and reject spoofed MIME types, invalid file signatures, disallowed extensions, password-protected PDFs, and oversized payloads.
- Add upload tests that enforce the finance caps: 25 MB per upload, 25 pages per PDF, and 10 images per batch.
- Add abuse-gate tests that prove OCR intake is rate-limited or quota-limited before queue dispatch.
- Add queue/backpressure tests that prove OCR jobs stop dispatching when the worker queue is saturated and leave the draft in a safe pending state.
- Add worker tests that prove OCR jobs refuse ambiguous ownership, missing tenant context, or missing project context.
- Add extraction tests that prove low-confidence OCR produces clarification metadata instead of inventing values.
- Add draft-creation tests that prove the OCR payload is persisted as a draft before confirmation.
- Add audit tests for OCR start, OCR completion, and extraction failure paths.

## 5. Retrieval Isolation and Evidence Lookup

- Add retrieval tests that prove `tenant_id`, `project_id`, `allowed_scopes`, and `owner_user_id` are all enforced before ranking.
- Add personal-leakage tests with two users in the same tenant to prove personal evidence cannot cross users.
- Add work-scope tests to prove only the active project’s documents are returned.
- Add backfill tests that prove legacy rows without `project_id` are excluded from personal retrieval until remediated.
- Add purge tests that prove library chunks, vector artifacts, and search results disappear when finance evidence is deleted or purged.
- Add chat-context tests that prove personal chats still reuse project-scoped memory but do not mix with work context.

## 6. Security Hardening, Retention, and Rollout

- Add RLS regression tests that prove personal finance rows are blocked when ownership or tenant context is wrong.
- Add retention tests for deleting or purging drafts, OCR artifacts, transaction links, and confirmed transactions together.
- Add audit-log tests for upload, extraction, confirmation, voiding, and purge events.
- Add sandboxing tests for malformed or oversized finance uploads.
- Add cleanup tests for library/vector artifacts on purge so deleted personal evidence cannot reappear in search.
- Add backpressure tests for queue saturation and retry-safe OCR dispatch.
- Add abuse-gate tests for OCR request-side rate or quota limits.
- Add rollout-gate tests that prove hard personal retrieval does not activate until backfill verification passes.
