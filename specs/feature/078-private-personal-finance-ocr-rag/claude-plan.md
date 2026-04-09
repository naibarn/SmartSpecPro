# Implementation Plan

This plan assumes the existing SmartSpecPro TypeScript/tRPC/Drizzle/Vitest stack and reuses the current chat, memory, library, and sandbox patterns instead of introducing a separate finance platform.

## Delivery Order

1. Build the schema and migration foundation first, including the personal finance tables, `project_id` uplift on library tables, and RLS/backfill scaffolding.
2. Add personal chat locking and UI entry points second so the user can create and recognize a personal finance chat without data leakage.
3. Add the finance router and finance service third so text-only drafts, confirmations, summaries, and recurring rules work end to end.
4. Add OCR intake and document extraction fourth, reusing the existing upload and sandbox patterns.
5. Add retrieval isolation and evidence lookup fifth so personal and work RAG never mix.
6. Finish with security hardening, retention, rollout gating, and regression tests.

## 1. Schema, Migrations, and Shared Contracts

Goal: introduce the finance domain as a first-class set of tables and make library evidence project-aware without breaking legacy rows.

Files to touch:
- `apps/web/drizzle/schema.ts`
- `apps/web/server/__tests__/migrationOrdering.test.ts`
- `apps/web/server/services/financeTypes.ts` or `apps/web/shared/finance.ts` if a shared type home is needed
- database migration files generated from the schema change

Implementation notes:
- Add `finance_transactions`, `finance_drafts`, `finance_recurring_rules`, `document_extractions`, and `finance_transaction_documents`.
- Require `tenant_id`, `project_id`, and `owner_user_id` on personal finance records and keep those fields in every draft, extraction, and linkage row.
- Add `idempotency_key` and `source_hash` where repeatability matters, especially on drafts, confirmations, and OCR work.
- Keep the source links explicit with `confirmed_from_draft_id`, `source_message_id`, and `source_library_item_id` so every finance record can be traced back to its origin.
- Store money in minor units and keep `currency` explicit.
- Add `project_id` to `library_items`, `library_chunks`, and `library_index_jobs` so finance evidence can be filtered without metadata-only conventions.
- Mirror `allowed_scopes` to chunks and vector metadata and preserve `owner_user_id` as part of the personal scope.
- Make purge/backfill behavior explicit for library-backed finance evidence: removing a finance document must eventually remove or tombstone its library row, chunk rows, and vector-store entries so deleted personal evidence cannot reappear in search.
- Add indexes that support the primary filters: tenant, project, owner, status, occurred time, and idempotency.
- Keep legacy library rows with `project_id = null` in compatibility mode until they are backfilled and reindexed.
- Add migration-order assertions so RLS and `project_id` changes do not land out of order.

Security notes:
- Finance tables should be designed for database backstop enforcement from day one.
- Personal finance rows should fail closed when ownership or tenant/project context is missing.
- Only the explicit personal-create flow may set `projectId = "personal"`; generic project update flows must reject the reserved slug.

Validation notes:
- Schema compile should prove the new tables and columns exist.
- Migration-order tests should prove the new RLS and backfill steps are present and ordered.

## 2. Personal Chat Lock and UI Entry Points

Goal: give the user a clearly marked personal chat mode and enforce it on the server, not only in the UI.

Files to touch:
- `apps/web/server/routers/chat.ts`
- `apps/web/server/services/chatService.ts`
- `apps/web/client/src/components/chat/CreationMenu.tsx`
- `apps/web/client/src/components/chat/ChatSidebar.tsx`
- `apps/web/client/src/components/chat/ChatView.tsx`

Implementation notes:
- Add a `New Chat (Personal)` path that creates a conversation with `projectId = "personal"` and a user-owned title.
- Lock personal conversations so `updateConversation` cannot retarget them to any other project.
- Reject attempts to assign `projectId = "personal"` to an existing work conversation unless the flow is an explicit personal-create path.
- Ensure conversation list and detail endpoints continue returning `projectId` so the UI can render the personal badge consistently.
- Hide or disable the project selector when the active conversation is personal.
- Add a visible personal badge or lock indicator in the header and sidebar so users can see the scope at a glance.
- Keep personal chats backed by the same project-scoped memory path so personal context persists across personal sessions.

Security notes:
- UI locking is convenience only; the server must remain the enforcement point.
- Personal chat reads and writes should always require the authenticated user to match `owner_user_id`.

Validation notes:
- Tests should prove that personal conversations cannot be retargeted after creation.
- Tests should prove the UI renders a personal-specific entry point and scope indicator.

## 3. Finance Router and Finance Service

Goal: implement the text-first finance workflow, summaries, recurring rules, and transaction lifecycle.

Files to touch:
- `apps/web/server/routers/finance.ts`
- `apps/web/server/services/financeService.ts`
- `apps/web/server/routers.ts`
- `apps/web/server/jobs/financeRecurringJob.ts` or the repo’s preferred recurring job location
- `apps/web/client/src/components/finance/*` for draft cards and summary cards if the chat renderer needs dedicated components

Implementation notes:
- Add a dedicated `financeRouter` with `parseTextToDraft`, `parseDocumentToDraft`, `confirmDraft`, `updateDraft`, `voidTransaction`, `listTransactions`, `getDailySummary`, `getMonthlySummary`, `createRecurringRule`, `pauseRecurringRule`, `resumeRecurringRule`, and `listLinkedDocuments`.
- Register the router in `apps/web/server/routers.ts` so it becomes part of the app router.
- Lock `projectId` from the authenticated conversation or request context; do not trust client-supplied domain switching.
- Use structured extraction for draft creation so the output is schema-valid and explicit about `missingFields`, `needsClarification`, and `confidence`.
- Require idempotency keys on draft creation and document parsing so retries do not duplicate drafts.
- Make `confirmDraft` idempotent. Repeated confirmation calls should return the same logical transaction result instead of creating duplicates.
- Make `confirmDraft` verify that the draft tenant, project, and owner match the authenticated caller before committing anything.
- Make `updateDraft` versioned so edits are predictable and do not silently overwrite a confirmed transaction.
- Make `voidTransaction` repeat-safe.
- Calculate daily and monthly summaries with SQL aggregation over confirmed transactions only.
- Use the request timezone or the user/tenant timezone for bucket boundaries, never raw server time alone.
- Return summary metadata such as the timezone and date range used so the UI can render the exact bucket that was computed.
- Create recurring rules as schedules that emit drafts first by default. Auto-confirm should require an explicit opt-in flag.
- Keep all monetary math in the database and service layer. The LLM may only convert computed totals into prose.

Security notes:
- Authorization must be explicit for each procedure. Personal scope is owner-only; work scope follows project membership and permissions.
- Idempotency keys must be required where duplicate writes would be harmful.

Validation notes:
- Tests should prove that summaries read from the database, not from model output.
- Tests should prove that personal and work scope authorization differs correctly per procedure.

## 4. OCR Intake and Document Extraction

Goal: let users upload receipts and invoices through chat, read them safely, and turn them into drafts.

Files to touch:
- `apps/web/server/services/libraryService.ts`
- `apps/web/server/services/libraryUploadPipeline.ts`
- `apps/web/server/routers/library.ts`
- `apps/web/server/services/financeOcrService.ts` or the repo’s chosen OCR worker/service file
- `apps/web/server/services/financeDocumentExtractionService.ts` if OCR and extraction are separated

Implementation notes:
- Reuse the existing library upload path for storage, checksuming, and sandbox dispatch, but narrow the finance path to finance-approved file types only.
- Accept receipt photos, screenshots, and PDFs in the finance path, including common mobile image formats such as HEIC when the file signature matches.
- Enforce the spec caps before OCR work starts: 25 MB per upload, 25 pages per PDF, and 10 images per batch.
- Add a request-side abuse gate for OCR intake so uploads are rate-limited or quota-limited before they ever reach the worker queue.
- Keep OCR text and extraction prompts separate so document text cannot act as instructions.
- Use bounded workers with wall-clock and memory limits for OCR and extraction.
- Reuse the existing queue backpressure pattern so OCR jobs do not pile up uncontrollably when the worker queue is saturated.
- Persist OCR traces in `document_extractions`, including raw OCR text, normalized JSON, extracted fields, confidence payloads, MIME type, file hash, and page count.
- Create or update a draft after OCR, not a confirmed transaction.
- Require the source document scope to match the authenticated caller before starting OCR or draft creation.
- If the extraction is ambiguous, emit a targeted clarification request instead of inventing missing data.
- Link the original library item to the draft and then to the confirmed transaction after user approval.
- If tenant policy blocks outbound document processing, fail closed or route to a locally approved OCR path.

Security notes:
- Do not log raw full-document text by default.
- Use the same signature validation and sandbox discipline already present in the library upload stack.

Validation notes:
- Tests should reject spoofed content types, invalid signatures, oversized uploads, and disallowed MIME types.
- Tests should cover the low-confidence path that produces clarification instead of a false confirmation.

## 5. Retrieval Isolation and Evidence Lookup

Goal: make finance evidence searchable in chat while guaranteeing that personal and work retrieval never cross boundaries.

Files to touch:
- `apps/web/server/services/memoryService.ts`
- `apps/web/server/routers/memory.ts`
- `apps/web/server/services/messageChunkSearchService.ts`
- `apps/web/server/services/libraryService.ts`
- `apps/web/server/services/financeRetrievalService.ts` if a dedicated retrieval helper is needed
- vector-provider integration points that already receive library metadata or vector metadata

Implementation notes:
- Enforce retrieval filters before ranking: `tenant_id`, `project_id`, `allowed_scopes`, and `owner_user_id` for personal scope.
- Mirror `project_id` into `library_items`, `library_chunks`, and `library_index_jobs` so the filter is structural, not metadata-only.
- Keep `allowed_scopes` as the denormalized ACL cache and include owner-scoped values for personal data.
- For personal finance evidence, recompute `allowed_scopes` as owner-only and never widen it with tenant, group, or role grants.
- Keep ambiguous legacy library rows out of personal retrieval until they are backfilled and verified.
- Update chat memory and evidence lookup to request only the active conversation scope.
- Let chat use a finance-specific evidence helper to fetch supporting documents and prior confirmed evidence, but never treat RAG as the source of truth for totals.
- Preserve the existing project-scoped memory behavior so personal context shares across personal chats but remains separated from work chats.
- When a personal finance document is purged, remove or tombstone the linked library rows, chunks, and vector artifacts so search cannot resurrect deleted content.

Security notes:
- Never widen scope “to be helpful.”
- Never rank across projects and then filter afterward.

Validation notes:
- Tests should prove that two users in the same tenant cannot retrieve each other’s personal evidence.
- Tests should prove that work evidence stays bound to the active work project.

## 6. Security Hardening, Retention, and Rollout

Goal: close the privacy gaps with database backstops, retention controls, and regression coverage.

Files to touch:
- finance and library migration files
- any request-context helper used to stamp tenant/user/project identity into DB transactions
- `apps/web/server/services/financeDbContext.ts` if a dedicated helper is needed
- `apps/web/server/jobs/*` for purge or recurring finance maintenance jobs
- `apps/web/server/services/auditLogger.ts` call sites for finance events
- `apps/web/server/__tests__/...` and `apps/web/server/routers/...test.ts` for regressions

Implementation notes:
- Add row-level security or an equivalent database backstop to finance tables and retrieval tables.
- Use `ENABLE ROW LEVEL SECURITY` and `FORCE ROW LEVEL SECURITY` where owner bypass would weaken the privacy guarantee.
- Stamp request context explicitly so finance queries always run with the current tenant, user, and project scope.
- Audit upload, OCR start and completion, extraction success and failure, draft creation, draft confirmation, voiding, and purge actions.
- Apply retention to drafts, OCR artifacts, linked documents, and transactions as a single family of finance data.
- Ensure retention and purge also clear any library-backed finance evidence from search indexes and vector artifacts.
- Keep personal data owner-only by default, including against tenant admins unless a separate policy explicitly allows broader access.
- Gate hard enforcement of personal retrieval until legacy rows are backfilled and verified.
- Keep the rollout in phases: text-only drafts, personal locking, OCR drafts, retrieval isolation, then hardening.

Security notes:
- Prompt injection defenses rely on structured outputs, validation, least privilege, and HITL for ambiguous actions.
- File-upload defenses rely on allowlists, signature checks, sandboxing, and bounded processing.
- RLS should be a backstop, not the only guard.

Validation notes:
- Tests should cover personal/work leakage, RLS regressions, idempotent confirmation, retention and purge, sandboxed OCR, and migration ordering.
- Tests should cover OCR request-side abuse controls and cleanup of library/vector artifacts on purge.

## Final Acceptance

- Personal chat creation is locked and visibly marked.
- Text finance entries become drafts, and confirmed transactions drive summaries.
- OCR uploads become draft records with evidence links.
- Daily and monthly summaries are database-derived and timezone-aware.
- RAG evidence lookup respects tenant, project, scope, and ownership filters.
- Legacy rows remain safe until backfilled.
- The implementation stays aligned with the existing SmartSpecPro patterns.
