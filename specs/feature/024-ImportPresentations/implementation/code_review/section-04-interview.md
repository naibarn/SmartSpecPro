# Code Review Interview: Section 04

## Decisions

### H1: user_id/tenant_id cross-validation strategy
**Asked user.** Decision: **Validate body matches auth** (keep body fields, add cross-check).
→ Auto-fix: Added `if request.user_id != current_user.id or request.tenant_id != current_user.currentTenantId: raise HTTPException(403)` in `start_import`.

## Auto-fixes Applied

### H2: Add tenant_id filter to `_update_conversion`
Added `AND tenant_id = :tid` to the UPDATE WHERE clause in `_update_conversion`. Threads `tenant_id` through `_import_async` → `_update_conversion` to prevent forged `conversion_id` overwriting another tenant's record.

### H3: SSRF protection on PPTX download (S04-05)
Added HTTPS-only validation before `httpx.AsyncClient().get(s3_url)`. Raises `ValueError` for non-HTTPS URLs. Removed `follow_redirects=True` to prevent redirect-based SSRF.

### M1: Explicit None guard in `_run_pptx_import` (S04-08)
Added `if source_item_id is None: raise ValueError("source_item_id is required for PPTX import")` at the top of `_run_pptx_import` before the DB query, producing a clear error message.

### N1: Simplified `cancel_import` endpoint (S04-15)
Removed the redundant `try/except ImportError` inside `cancel_import`. The endpoint now logs the cancellation intent and returns `{"cancelled": True}` with a clear comment explaining that `celery_task_id` is not stored in the schema.

## Let-go (with rationale)

### S04-03: Empty WEB_GATEWAY_TOKEN startup validation
The project does not currently enforce all env vars at startup. Adding a module-level RuntimeError could break the test runner which doesn't set this var. Deferred to a later hardening pass.

### S04-04: Cancel endpoint not actually revoking Celery tasks
Requires adding `celery_task_id varchar` column to `presentation_conversion_records` (a DB schema change outside this section's scope). Documented in code comment. Tracked as known gap.

### S04-06: Celery retry idempotency
The spec explicitly delegates idempotency to Section 06's callback handler. Adding a status pre-check would require an extra DB round-trip on every task run. Deferred to Section 06.

### S04-07: f-string SQL construction
Column names in the SET clause are hardcoded string literals — no injection risk. Added `_ALLOWED_UPDATE_COLUMNS` frozenset as a reference guard comment.

### S04-09: Double JSON serialization
Performance optimization deferred; the hot path is dominated by the import itself (~seconds), not serialization overhead (~ms).

### S04-10: error=None in status response
No `error` column in the `presentation_conversion_records` schema from Section 01. The `error` field is delivered via Node.js callback, not via this polling endpoint. Documented in code comment.

### S04-11: Per-slide progress reporting
Requires modifying the `PptxImporter` and `GSlidesImporter` constructors (already committed in sections 02/03) to accept an `on_progress` callback. Tracked as known gap in section doc.

### S04-14: HttpError not in user-visible exception allowlist
Low priority. Google API errors surface as "Import failed due to an internal error" today. A future pass can add `HttpError` translation with localized messages.

## Test Additions

- `test_mismatched_user_id_returns_403` — forged user_id returns 403
- `test_mismatched_tenant_id_returns_403` — forged tenant_id returns 403
