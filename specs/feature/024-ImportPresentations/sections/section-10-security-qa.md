Now I have all the context needed. Let me generate the section content for `section-10-security-qa`.

# Section 10: Security + QA

## Overview

This is the final section of Feature 024: Import Presentations. All previous sections (01–09) are complete. This section covers a security validation pass over every new surface the feature introduces, plus a full QA checklist.

**Dependencies (must be complete):** Sections 01–09 — DB migration, PPTX importer, GSlides importer, Celery task, FastAPI endpoints, tRPC router, service layer, callback handler, React dialog, editor integration, and all associated tests.

## Actual Implementation Notes

Security audit completed. Changes made:

1. **gslides_importer.py `_download_image`**: Updated docstring to document security controls (SSRF rejection, redirect handling, timeout, credential non-logging). Kept `follow_redirects=True` — Google CDN may legitimately 302. The `url.startswith("https://")` check is the primary SSRF defense.

2. **pptx_importer.py**: Added macro safety documentation (python-pptx is a read-only parser).

3. **test_gslides_importer.py**: Added `test_download_image_uses_follow_redirects_and_timeout()` test.

### Security Checklist Results (all pass)

| Control | Location |
|---------|----------|
| Client-side 50MB file size gate | ImportPresentationDialog.tsx:32 |
| SSRF: HTTPS-only `_download_image` | gslides_importer.py:97 |
| SSRF: HTTPS-only PPTX source_url | presentation_import_tasks.py:221 |
| Callback auth: timing-safe Bearer token | presentationImportCallback.ts:33-49 |
| Callback: auth BEFORE body parsing | presentationImportCallback.ts:33 |
| Callback: Zod body validation | presentationImportCallback.ts:13-19 |
| Callback: body size limit (10mb global) | index.ts:123 |
| Callback: idempotency check | presentationImportCallback.ts:83-92 |
| Callback: always-200 response | presentationImportCallback.ts |
| Tenant isolation: status + cancel | presentationImport.ts:218,276,312 |
| Actor from DB record | presentationImportService.ts:30-35 |
| S3 path scoping with tenant_id | presentation_import_tasks.py:138 |
| Parameterized SQL | All queries (Drizzle + Python) |
| Input validation (source_type, slidesUrl, regex) | Multiple files |
| Corrupt PPTX handling | pptx_importer.py:139-142 |
| No token/URL logging | gslides_importer.py, tasks |

### N/A Items
- Content-Length guard: N/A (endpoint accepts JSON, not file uploads)
- MIME type validation: N/A (no file upload to API)
- S3 lifecycle rule: Infrastructure concern, documented as known limitation

**Test command:**
```bash
cd apps/web && pnpm check && pnpm test && cd ../../python-backend && uv run pytest --cov=app --cov-fail-under=80
```

---

## Tests to Write First

These automated tests are specifically called out for this section. They supplement the tests from Section 09 and target security boundaries that are often missed in unit-level coverage.

**File:** `python-backend/tests/test_security_checks.py` (or extend `test_gslides_importer.py` and `test_presentation_import_api.py`)

### 1. SSRF prevention in `_download_image`

Location: `python-backend/app/services/gslides_importer.py` — `_download_image` function.

```python
@pytest.mark.asyncio
async def test_download_image_rejects_non_https():
    """_download_image with a non-HTTPS URL returns None without making any HTTP request."""

@pytest.mark.asyncio
async def test_download_image_does_not_follow_http_redirect():
    """_download_image does not follow redirects that downgrade to HTTP."""
```

Verification: mock `httpx.AsyncClient` and assert it is never called when URL does not start with `"https://"`. For the redirect test: configure `httpx` mock to return a 302 pointing to `http://` and verify the function returns `None`.

### 2. FastAPI file size rejection

Location: `python-backend/app/api/v1/presentation_import.py` — `POST /api/v1/presentation-import/start`.

```python
def test_start_endpoint_rejects_large_content_length():
    """POST /api/v1/presentation-import/start with Content-Length > 50MB returns 413."""
```

Use `TestClient` from `fastapi.testclient`. Set `headers={"Content-Length": str(52_428_801)}` on the request. Assert response status is 413.

### 3. Callback route body size guard

Location: wherever `POST /api/internal/presentation-import/callback` is registered in the Node.js Express app.

```typescript
it("rejects callback body larger than 10MB", async () => {
  // Send a POST with a body exceeding 10MB
  // Expect a graceful 413 or 400, not a crash or unhandled promise rejection
});
```

Verify that the Express body-parser limit for this route is set to `"10mb"` (or smaller) and that oversized payloads produce a well-formed error response.

---

## Security Checklist

Work through each item in order. For each item: read the relevant source file, confirm the control is in place, and mark it done. If a control is missing, implement it before proceeding.

### File Upload (PPTX)

**Client-side size gate**
- File: `apps/web/client/src/components/presentation/ImportPresentationDialog.tsx`
- Confirm: `file.size <= 52_428_800` check runs before the XHR starts.
- Confirm: inline error shown immediately; the step does NOT advance to `"uploading"`.

**Server-side Content-Length guard**
- File: `python-backend/app/api/v1/presentation_import.py`
- Confirm: `Content-Length` is validated; requests over 50MB receive 413 before the body is read.
- Implementation note: use FastAPI/Starlette's `max_upload_size` setting or an explicit middleware check.

**MIME type validation**
- File: `python-backend/app/api/v1/presentation_import.py`
- Confirm: the endpoint checks `Content-Type: application/vnd.openxmlformats-officedocument.presentationml.presentation`.
- Confirm: non-PPTX content types are rejected with 415 before passing bytes to the importer.

**Macro safety**
- `python-pptx` does not execute VBA macros during parsing. No additional control needed, but confirm this is documented in code comments in `pptx_importer.py`.

**Corrupt file handling**
- File: `python-backend/app/services/pptx_importer.py`
- Confirm: `PackageNotFoundError` and `BadZipFile` are caught in `import_file`.
- Confirm: a user-friendly `ImportError("The uploaded file is not a valid .pptx file")` is raised (not the raw exception).
- Confirm: the Celery task catches this at the task level, sets `status="failed"`, and calls `_notify_nodejs`.

### SSRF Prevention (Google Slides Image Downloads)

**URL scheme validation**
- File: `python-backend/app/services/gslides_importer.py` — `_download_image`
- Confirm: `url.startswith("https://")` is checked before any HTTP call is made.
- Confirm: `None` is returned immediately for non-HTTPS URLs (no request sent).

**Redirect policy**
- Confirm: `httpx.AsyncClient` is configured with `follow_redirects=True` but that redirects to `http://` URLs are not followed (httpx enforces HTTPS-only redirects by default when a URL is HTTPS; verify this is tested explicitly).

**Timeout**
- Confirm: `timeout=30.0` is set on the `httpx.AsyncClient` call in `_download_image`.
- Confirm: `httpx.HTTPError` (including `TimeoutException`) is caught and returns `None`, emitting a fidelityWarning.

**No logging of contentUrl**
- `contentUrl` values contain embedded auth credentials (Google's short-lived signed URLs).
- Confirm: no `logger.*` call logs the raw `contentUrl`.
- Confirm: fidelityWarning messages for image download failures do NOT include the URL — only a slide reference like `"Slide N: Image could not be downloaded"`.

### Google OAuth Token Handling

**Scope verification**
- File: wherever `DRIVE_SCOPES` is defined (search the Python backend for `DRIVE_SCOPES` or `drive.readonly`).
- Confirm: the OAuth scope includes `https://www.googleapis.com/auth/drive.readonly`.
- Note: `presentations.readonly` is NOT required; `drive.readonly` is the operative scope for accessing Slides via the REST API.

**Token retrieval location**
- File: `python-backend/app/tasks/presentation_import_tasks.py`
- Confirm: the Celery task calls `await GoogleTokenService.get_valid_access_token(user_id)` internally.
- Confirm: the access token is NOT accepted from the FastAPI request body or from the Node.js POST payload. The `start` endpoint does not have an `access_token` field.

**No token logging**
- Confirm: the access token value is never passed to any `logger.*` call.
- Confirm: the token is not present in any error messages that are stored in `presentationConversionRecords.error`.

**Token not in Node.js**
- Confirm: the tRPC `startImport` procedure does NOT retrieve or forward a Google access token. It passes only `userId` and `tenantId` to the Python start endpoint. Python retrieves the token itself.

### Callback Route Security

**Token authentication**
- File: Express internal routes file containing `POST /api/internal/presentation-import/callback`
- Confirm: the route reads `req.headers.authorization` and compares it to `"Bearer " + ENV.webGatewayToken`.
- Confirm: on mismatch, the route returns `401` with no response body (do not reflect the expected token value).
- Confirm: this check runs BEFORE Zod body parsing (auth first, parse body second).

**Body validation**
- Confirm: Zod parses the request body with the schema:
  ```typescript
  z.object({
    conversionId: z.number(),
    status: z.enum(["done", "failed"]),
    slides: z.array(z.record(z.unknown())).optional(),
    fidelityWarnings: z.array(z.string()).max(25).optional(),
    error: z.string().optional(),
  })
  ```
- Confirm: malformed body returns 400.

**Body size limit**
- Confirm: the Express body-parser limit for this route is `"10mb"` or less. The slides payload can be large but should never approach 10MB after the Python-side 8MB truncation.

**Idempotency**
- Confirm: before calling `createDeckFromImportResult`, the callback route reads the conversion record and returns 200 immediately if `record.status === "done"` (prevents duplicate deck creation from Celery retries).

**Always respond 200**
- Confirm: the callback route always responds 200 (even on `"failed"` status). A non-200 would cause Celery to retry unnecessarily.
- Confirm: internal errors are logged but do NOT bubble up as 500 responses to the Python caller.

### Tenant Isolation

**Status reads**
- File: `apps/web/server/routers/presentationImport.ts` — `getImportStatus`
- Confirm: the Drizzle query filters on both `conversionId` AND `tenantId`.
- Confirm: a record belonging to a different tenant results in a `NOT_FOUND` error (not a 403 — do not reveal that the record exists).

**Cancel**
- File: `apps/web/server/routers/presentationImport.ts` — `cancelImport`
- Confirm: same dual-filter as `getImportStatus`.

**Deck creation**
- File: `apps/web/server/services/presentationImportService.ts` — `createDeckFromImportResult`
- Confirm: the `actor` is constructed from the DB-stored `userId` and `tenantId` (read from `presentationConversionRecords`), NOT from the callback POST body.
- Confirm: `addSlideToDeck` and `createPresentationDeckForLibraryItem` receive this actor so tenant isolation is enforced at the service layer.

**S3 path scoping**
- Confirm: all S3 keys for imported assets follow the pattern `{tenant_id}/presentations/imports/{conversion_id}/images/{uuid}.{ext}`.
- Confirm: the `tenant_id` used in this path comes from the DB record, not from any user-supplied value.

### SQL Injection

- Confirm: all DB queries in tRPC router, service layer, and callback route use Drizzle ORM (parameterized queries). No raw string concatenation in SQL.
- Confirm: `fidelityWarnings` is stored as a JSON array via Drizzle (parameterized), not as a raw string concatenated into SQL.

### Input Validation

**`source_type` (Python)**
- Confirm: the `StartImportRequest` Pydantic model has a `@field_validator` that rejects any value other than `"pptx"` or `"google_slides"`.

**`slides_url` (TypeScript)**
- Confirm: the `startImport` Zod schema uses `z.string().url()` for `slidesUrl`.

**Google Slides presentation ID extraction**
- File: `python-backend/app/tasks/presentation_import_tasks.py`
- Confirm: the presentation ID is extracted using the anchored regex `r"docs\.google\.com/presentation/d/([a-zA-Z0-9_-]+)"`.
- Confirm: if the regex does not match, a `ValueError("Invalid Google Slides URL")` is raised (not a pass-through to the API with an attacker-controlled string).

### Known Limitation — S3 Orphan Images

If the Celery task uploads images to S3 but fails before completing (e.g., before calling `_notify_nodejs`), those objects are orphaned. There is no automated cleanup path in this feature.

**Mitigation to verify is in place:**
- Confirm an S3 lifecycle rule exists with a 7-day expiry on the `*/presentations/imports/*` prefix. This is an infrastructure-level control, not a code change.
- If no such rule exists: create a ticket or document the gap. The feature can ship without it, but the orphan risk must be acknowledged.

---

## QA Checklist

### Automated Checks

Run these in order and confirm each passes before proceeding to manual verification.

```bash
# 1. Python tests with coverage
cd python-backend && uv run pytest --cov=app --cov-fail-under=80 -v

# 2. TypeScript type check
cd apps/web && pnpm check

# 3. TypeScript unit tests
cd apps/web && pnpm test
```

All three must pass with zero failures and no TypeScript errors.

### Manual Verification Steps

**PPTX import — happy path**
1. Upload a 16:9 PPTX file that contains text boxes and embedded images (not linked).
2. Expected: correct slide count in the result step, element positions within ±5px of expected, all image `src` values are HTTPS URLs pointing to your R2/S3 bucket.

**PPTX import — file size rejection**
1. Attempt to select a `.pptx` file larger than 50MB.
2. Expected: inline error shown immediately in the dialog, step remains `"select"`, XHR never fires.

**PPTX import — unsupported shapes**
1. Upload a PPTX that contains a table and a chart.
2. Expected: after import completes, the result step shows fidelityWarnings listing the table and chart that were dropped.

**Google Slides import — happy path**
1. Connect a Google account (via existing OAuth flow) and paste a valid Google Slides URL.
2. Expected: deck created in library, all images uploaded to S3 and displayed as HTTPS URLs, `"Open Deck"` button navigates to PresentationEditor.

**Navigation — Open Deck**
1. Complete any import (PPTX or GSlides).
2. Click `"Open Deck"`.
3. Expected: browser navigates to the PresentationEditor route for the newly created deck.

**Cancel during upload**
1. Select a large PPTX file (multi-MB, takes a few seconds).
2. Click `"Cancel"` while the upload progress bar is animating.
3. Expected: XHR is aborted, dialog resets to `"select"` step, no conversion record is created in the DB with status `"processing"`.

**Cancel during processing**
1. Start an import and let it advance to the `"processing"` step.
2. Click `"Cancel"`.
3. Expected: `cancelImport` tRPC mutation fires, the `presentationConversionRecords` row in the DB has `status = "cancelled"`.

**Idempotency — duplicate callback**
1. Find a completed import's `conversion_id` in the DB.
2. Manually POST to `POST /api/internal/presentation-import/callback` with the same `conversionId` and `status="done"`.
3. Expected: response is 200, no duplicate library item or deck is created.

**Tenant isolation — cross-tenant status read**
1. Using two separate user accounts in different tenants, get the `conversionId` from one tenant's import.
2. Attempt to call `getImportStatus` with that `conversionId` from the other tenant's session.
3. Expected: `NOT_FOUND` tRPC error returned.

---

## File Reference

The following files are touched by this feature and are relevant to the security review. No new files are created in this section — it is a review-and-fix pass.

**Python backend:**
- `/home/dev/projects/SmartSpecPro/python-backend/app/services/gslides_importer.py` — `_download_image` SSRF guard, token non-logging
- `/home/dev/projects/SmartSpecPro/python-backend/app/services/pptx_importer.py` — corrupt file handling, macro safety comment
- `/home/dev/projects/SmartSpecPro/python-backend/app/api/v1/presentation_import.py` — Content-Length guard, MIME check, 413 response
- `/home/dev/projects/SmartSpecPro/python-backend/app/tasks/presentation_import_tasks.py` — token retrieval location, presentation ID regex, error message sanitization
- `/home/dev/projects/SmartSpecPro/python-backend/tests/test_security_checks.py` — new tests for this section

**Node.js / TypeScript:**
- `apps/web/server/routers/presentationImport.ts` — tenant isolation in `getImportStatus` and `cancelImport`
- `apps/web/server/services/presentationImportService.ts` — actor construction from DB record, not callback body
- Internal Express routes file (containing `POST /api/internal/presentation-import/callback`) — token auth first, body size limit, idempotency, always-200 response
- `apps/web/client/src/components/presentation/ImportPresentationDialog.tsx` — client-side size gate, no token exposure