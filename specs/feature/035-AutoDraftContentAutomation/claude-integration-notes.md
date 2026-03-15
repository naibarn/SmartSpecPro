# Integration Notes: Opus Review Feedback

## Suggestions Integrated

### 1. Synthetic JWT Scope Restrictions (Critical → INTEGRATED)
**Opus said:** Use `signBearerToken` with explicit scope like `["auto-draft:execute"]` and add `origin: "auto-draft-agent"` claim.
**Action:** Updated Section 2 to use scoped JWT with `signBearerToken` from `_core/tokens.ts`. Added audit trail requirement.

### 2. Scheduler Architecture (Critical → INTEGRATED)
**Opus said:** Existing scheduler uses Cloud Tasks, not BullMQ polling.
**Action:** Updated Section 5 to investigate and follow the existing scheduler pattern (Cloud Tasks or BullMQ depending on `USE_CLOUD_TASKS` config). Not blindly assuming BullMQ.

### 3. `generateAIDraft()` Returns void (Critical → INTEGRATED)
**Opus said:** Function returns void, need post-completion data gathering from Redis/DB.
**Action:** Updated Section 2 with explicit post-completion steps: read Redis progress key, query deck/task records, sum credits from provider_usage_log.

### 4. Concurrency Lock Conflict (High → INTEGRATED)
**Opus said:** Existing `ai_draft_lock:{userId}` conflicts with new semaphore (max 3).
**Action:** Updated Section 2 to note the existing lock must be modified or the semaphore aligned. For auto-draft, the per-user lock should use a different key or be scope-aware.

### 5. `builtin-skill-discovery` Registration (High → INTEGRATED)
**Opus said:** Missing from Section 6's tool registration list.
**Action:** Added to Section 6. Clarified: if Spec 034 already registers it, skip; if not, Section 8's stub must also add the registration.

### 6. Batch Failure Recovery (High → INTEGRATED)
**Opus said:** No partial batch failure handling.
**Action:** Updated plan with batch processing semantics: sequential processing, per-item result tracking, partial success reporting, batch_id tracking.

### 7. Webhook HMAC for schedule-draft (High → INTEGRATED)
**Opus said:** `auto_draft_schedules` missing `webhookSecretEncrypted`.
**Action:** Added column to Section 5's table definition.

### 8. Feature Flag Client Exposure (Medium → INTEGRATED)
**Opus said:** No tRPC endpoint to expose feature flag to frontend.
**Action:** Added a tRPC procedure requirement to Section 1.

### 9. Observability (Missing → INTEGRATED)
**Opus said:** No structured logging or audit events for new endpoints.
**Action:** Added observability requirements to each section: audit log events, traceId propagation.

### 10. Database Safety Protocol (Missing → INTEGRATED)
**Opus said:** No rollback strategy mentioned.
**Action:** Added reference to Database Safety Protocol for both schema changes (Sections 5 and 10).

### 11. Agent Seed Idempotency (Medium → INTEGRATED)
**Opus said:** Use upsert, not insert.
**Action:** Updated Section 7 to use idempotent upsert keyed on slug.

### 12. `PresentationActor` Construction (Medium → INTEGRATED)
**Opus said:** Specify DB query and fail-fast for deactivated users.
**Action:** Updated Section 2 with user verification step.

## Suggestions NOT Integrated

### 13. Shared Types Location (Medium → NOT INTEGRATED)
**Opus said:** Should clarify `apps/web/shared/` vs `packages/shared/`.
**Reason:** `apps/web/shared/` is the correct location. The `@shared/` alias already maps to `apps/web/shared/`. Other feature types use this pattern (e.g., `apps/web/shared/presentation/aiTypes.ts`). No change needed.

### 14. Rate Limiting Pattern (Low → NOT INTEGRATED)
**Opus said:** Reuse existing `createRateLimitMiddleware`.
**Reason:** The existing middleware is designed for HTTP endpoint rate limiting. The auto-draft rate limit needs to be enforced inside `auto_draft_pipeline()` itself (not only the handler) so the Content Automation batch path cannot bypass it. Redis INCR+EXPIRE is the correct pattern here — more flexible than middleware.

### 15. Credit Estimation Pre-flight (Missing → DEFERRED)
**Opus said:** Pre-flight credit check to avoid mid-way failure.
**Reason:** Good idea but complex. The cost depends on model choice, slide count, and media type — all determined by the agent during execution. Deferring to a future enhancement. The existing pipeline already handles `CreditInsufficientError` gracefully.

### 16. Timeout Cleanup (Medium → PARTIALLY INTEGRATED)
**Opus said:** Define cleanup behavior for timeout/abort.
**Reason:** The existing `ai_draft_cancel:{taskId}` mechanism handles cancellation. For timeout, the deck may be partially created but Redis lock auto-expires (120s TTL). Added a note about this but full cleanup is complex and matches existing manual-mode behavior.

### 17. Row Limit Clarification (Low → NOT INTEGRATED)
**Opus said:** 100 data rows + 1 header vs 100 total.
**Reason:** SheetJS `sheetRows: 101` means 100 data rows + 1 header. Papa Parse with `header: true` excludes the header row from the row count. This is an implementation detail, not a plan-level concern.

### 18. npm Dependencies (Low → NOTED)
**Opus said:** Add xlsx and papaparse as dependencies.
**Reason:** Implementation detail. Implementer will handle `pnpm add papaparse xlsx`.
