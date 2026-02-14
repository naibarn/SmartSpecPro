Now I have all the context needed. Let me generate the section content.

# Section 15: Security Hardening

## Overview

This section implements cross-cutting security measures across the entire Google Drive integration. It validates token encryption, enforces scope verification, hardens input validation, ensures tenant isolation, protects webhook endpoints from CSRF, sanitizes content extracted from Google Drive, establishes a comprehensive audit trail, and introduces a feature flag to gate `drive.readonly` scope features.

This section is designed to be implemented last, as it audits and hardens code written in all prior sections (1-14). It touches multiple files across both the Node.js and Python backends.

## Dependencies

- **Section 14 (Disconnect & Cleanup):** All prior sections must be implemented before this cross-cutting hardening pass.
- **Section 03 (OAuth Consent):** Token encryption is validated against `oauth_connections` records and the `GoogleTokenService`.
- **Section 11 (Sync & Webhooks):** Webhook CSRF validation hardens the webhook handler from that section.
- **Section 06 (Content Extraction):** Content sanitization applies to the `GoogleContentExtractor` output.
- **Section 08 (Virtual References):** Tenant isolation checks are validated on `library_items` and vector store queries.

## Tests First

All tests should be written before implementing the hardening measures. Tests validate that security invariants hold across the integration.

### Python Tests (pytest)

**File:** `/home/dev/projects/SmartSpecPro/python-backend/tests/test_google_drive_security.py`

```python
"""
Security hardening tests for Google Drive integration.

Markers: @pytest.mark.unit, @pytest.mark.auth
"""
import pytest


@pytest.mark.unit
class TestTokenEncryption:
    """Verify all stored OAuth tokens use AES-256-GCM encryption."""

    async def test_oauth_tokens_are_encrypted_not_plaintext(self):
        """
        Retrieve all oauth_connections records with provider='google'.
        Assert that access_token and refresh_token columns contain
        the 'iv:authTag:ciphertext' format (three colon-separated hex
        segments), NOT plaintext JWT or raw token strings.
        """

    async def test_token_service_encrypts_before_storing(self):
        """
        Call GoogleTokenService's internal store method with a known
        plaintext token. Read the DB row back and verify the stored
        value is in AES-256-GCM format (three hex parts separated by
        colons). Decrypt it and verify it matches the original.
        """

    async def test_token_service_decrypts_on_read(self):
        """
        Insert an oauth_connections row with a properly encrypted
        access_token. Call get_valid_access_token and verify it
        returns the plaintext token, proving decryption works.
        """


@pytest.mark.unit
class TestScopeVerification:
    """Verify scope checks before Google API calls."""

    async def test_scope_verification_rejects_missing_drive_scope(self):
        """
        Create an oauth_connections record with scopes='openid email profile'
        (no Drive scopes). Call a function that requires drive.readonly scope
        (e.g., search_drive_files). Assert it raises a ScopeMissingError
        (or similar) rather than making the API call.
        """

    async def test_scope_verification_accepts_valid_scopes(self):
        """
        Create an oauth_connections record with scopes including
        'https://www.googleapis.com/auth/drive.readonly'. Call the
        scope check function. Assert it passes without error.
        """

    async def test_scope_verification_handles_incremental_grant(self):
        """
        Simulate a user who initially had only drive.file scope.
        After re-authorization with drive.readonly added, verify
        the scope check now passes for read operations.
        """


@pytest.mark.unit
class TestTenantIsolation:
    """Verify tenant_id is enforced on all Drive operations."""

    async def test_user_cannot_access_other_tenant_drive_data(self):
        """
        Create virtual references for tenant_A and tenant_B.
        Authenticate as tenant_A user. Attempt to query/access
        a library_item belonging to tenant_B. Assert 403 or empty
        result set.
        """

    async def test_vector_queries_always_include_tenant_id_filter(self):
        """
        Mock the vector store query function. Trigger a semantic
        search for a Drive-indexed document. Assert the query
        payload includes a metadata filter for tenant_id matching
        the authenticated user's tenant.
        """


@pytest.mark.unit
class TestWebhookTokenSecurity:
    """Verify webhook channel token properties."""

    async def test_webhook_token_is_cryptographically_random(self):
        """
        Generate a channel token using the token generation function.
        Assert it is at least 32 bytes (64 hex characters) and
        consists of valid hex characters only.
        """

    async def test_webhook_validation_rejects_wrong_channel_token(self):
        """
        Store a sync state with channel_token='abc123...'. Send a
        webhook request with a different X-Goog-Channel-Token.
        Assert 403 response.
        """


@pytest.mark.unit
class TestContentSanitization:
    """Verify content extracted from Google Drive is sanitized."""

    async def test_sanitization_strips_script_tags(self):
        """
        Pass text containing '<script>alert("xss")</script>' through
        the content sanitizer. Assert the output does not contain
        any <script> tags.
        """

    async def test_sanitization_strips_event_handlers(self):
        """
        Pass text containing 'onclick="malicious()"' and
        'onerror="evil()"' through the sanitizer. Assert event
        handler attributes are removed.
        """

    async def test_sanitization_preserves_legitimate_content(self):
        """
        Pass normal text with markdown formatting, code blocks,
        and non-harmful HTML entities. Assert the content is
        preserved intact.
        """

    async def test_sanitization_handles_embedded_objects(self):
        """
        Pass text containing <iframe>, <object>, <embed> tags.
        Assert they are stripped from the output.
        """


@pytest.mark.unit
class TestAuditTrail:
    """Verify sensitive operations are logged."""

    async def test_audit_log_on_google_connect(self):
        """
        Mock the audit logger. Trigger a successful Google OAuth
        connection. Assert an audit entry is created with
        eventType='google_drive_connect' and the user_id.
        """

    async def test_audit_log_on_google_disconnect(self):
        """
        Mock the audit logger. Trigger a disconnect flow.
        Assert an audit entry is created with
        eventType='google_drive_disconnect'.
        """

    async def test_audit_log_on_token_refresh(self):
        """
        Mock the audit logger. Trigger a token refresh in
        GoogleTokenService. Assert an audit entry is created
        with eventType='google_drive_token_refresh'.
        """
```

### TypeScript Tests (Vitest)

**File:** `/home/dev/projects/SmartSpecPro/apps/web/server/security/googleDriveSecurity.test.ts`

```typescript
/**
 * Security hardening tests for Google Drive integration (Node.js side).
 *
 * Covers: input validation, tenant isolation, feature flag gating.
 */
import { describe, it, expect, vi } from "vitest";

describe("Google Drive Security - Input Validation", () => {
  it("all tRPC mutations validate input with Zod schemas", () => {
    /**
     * Import the googleDriveRouter. For each mutation procedure,
     * attempt to call with invalid input (empty strings, wrong types,
     * missing required fields). Assert each call throws a ZodError
     * or TRPCError with code 'BAD_REQUEST'.
     */
  });

  it("rejects file IDs with path traversal characters", () => {
    /**
     * Call openForEditing / read operations with file IDs containing
     * '../', '..\\', null bytes, or other traversal patterns.
     * Assert rejection before any Google API call is made.
     */
  });

  it("rejects excessively long input strings", () => {
    /**
     * Call search with a query string >1000 characters.
     * Assert rejection with appropriate error.
     */
  });
});

describe("Google Drive Security - Tenant Isolation", () => {
  it("Drive operations verify tenantId matches authenticated user", () => {
    /**
     * Mock the authentication context with tenantId='tenant_A'.
     * Attempt to call a Drive procedure that references data
     * belonging to tenantId='tenant_B'. Assert the operation
     * fails with a forbidden/not-found error.
     */
  });

  it("virtual reference creation enforces tenant scoping", () => {
    /**
     * Call createVirtualDriveReference. Assert the created
     * library_items and library_links records contain the
     * correct tenant_id from the authenticated context.
     */
  });
});

describe("Google Drive Security - Feature Flag Gating", () => {
  it("driveReadonlyScopeApproved flag gates MCP tools", () => {
    /**
     * Set system_settings driveReadonlyScopeApproved=false.
     * Attempt to call search_drive_files or list_drive_folder
     * MCP tools. Assert they return a 'feature not available'
     * error or are excluded from tool discovery.
     */
  });

  it("driveReadonlyScopeApproved flag gates federated search", () => {
    /**
     * Set driveReadonlyScopeApproved=false. Call
     * federatedSearch with includeGoogleDrive=true.
     * Assert the Drive API leg is skipped and
     * driveResultsStatus='feature_disabled'.
     */
  });

  it("driveReadonlyScopeApproved flag gates sync/webhooks", () => {
    /**
     * Set driveReadonlyScopeApproved=false. Attempt to
     * start initial sync. Assert it is blocked with
     * an appropriate error message.
     */
  });

  it("edit-in-Google (drive.file scope) works regardless of flag", () => {
    /**
     * Set driveReadonlyScopeApproved=false. Call openForEditing.
     * Assert it proceeds normally because editing only uses
     * drive.file scope, not drive.readonly.
     */
  });
});

describe("Google Drive Security - Webhook CSRF Protection", () => {
  it("webhook validates all three Google headers", () => {
    /**
     * Send a POST to /api/webhooks/gdrive with valid
     * X-Goog-Channel-ID and X-Goog-Resource-ID but
     * invalid X-Goog-Channel-Token. Assert 403 response.
     */
  });

  it("webhook rejects requests missing required headers", () => {
    /**
     * Send a POST to /api/webhooks/gdrive without any
     * Google headers. Assert 403 response.
     */
  });
});
```

## Implementation Details

### 1. Token Encryption Validation

**Files to modify:**
- `/home/dev/projects/SmartSpecPro/python-backend/app/services/google_token_service.py` (created in Section 03)

The `GoogleTokenService` must use AES-256-GCM encryption (via `smartspecweb_crypto`) for all token storage. This is a validation step -- verify the existing implementation:

- All calls to store `access_token` and `refresh_token` in `oauth_connections` must encrypt via `smartspecweb_crypto.encrypt_smartspecweb()` (or the Node.js `encrypt()` if stored from the Node side).
- All reads of `access_token`/`refresh_token` must decrypt before use.
- Add a startup validation check: on first use, the `GoogleTokenService` should attempt to decrypt a stored token. If decryption fails (returns empty string), log a CRITICAL error and refuse to serve tokens. This catches misconfigured `LLM_ENCRYPTION_KEY` early.

The existing `OAuthConnection` model at `/home/dev/projects/SmartSpecPro/python-backend/app/models/oauth.py` stores tokens in `access_token` and `refresh_token` columns as `Text`. The comments say "encrypted in production" but there is no enforcement. Add explicit encrypt/decrypt calls in the `GoogleTokenService`.

The existing encryption utilities are:
- Node.js: `encrypt()`/`decrypt()` in `/home/dev/projects/SmartSpecPro/apps/web/server/services/crypto.ts` -- uses AES-256-GCM with `LLM_ENCRYPTION_KEY`, format `iv:authTag:ciphertext` (hex).
- Python: `decrypt_smartspecweb()` in `/home/dev/projects/SmartSpecPro/python-backend/app/core/smartspecweb_crypto.py` -- decrypts Node.js encrypted data using same `LLM_ENCRYPTION_KEY`.

Ensure the Python side also has an `encrypt_smartspecweb()` function for encrypting new tokens stored from the Python OAuth callback. If it does not exist yet, add it following the same AES-256-GCM pattern.

### 2. Scope Verification

**Files to create/modify:**
- `/home/dev/projects/SmartSpecPro/python-backend/app/services/google_token_service.py` (modify)
- `/home/dev/projects/SmartSpecPro/python-backend/app/services/google_scope_guard.py` (create)

Create a scope guard utility that checks whether a user's stored OAuth scopes include the required scope before making API calls.

```python
# google_scope_guard.py - stub

DRIVE_READONLY_SCOPE = "https://www.googleapis.com/auth/drive.readonly"
DRIVE_FILE_SCOPE = "https://www.googleapis.com/auth/drive.file"
DOCS_READONLY_SCOPE = "https://www.googleapis.com/auth/documents.readonly"
SHEETS_READONLY_SCOPE = "https://www.googleapis.com/auth/spreadsheets.readonly"

class ScopeMissingError(Exception):
    """Raised when the user's OAuth grant does not include a required scope."""
    def __init__(self, required_scope: str, granted_scopes: list[str]):
        ...

async def verify_scopes(user_id: int, required_scopes: list[str], db) -> None:
    """
    Load the user's oauth_connections record for provider='google'.
    Parse the 'scopes' column (comma-separated string, added in Section 02).
    Raise ScopeMissingError if any required scope is missing.
    """
```

Integration points:
- MCP tools (`search_drive_files`, `read_drive_file`, `list_drive_folder`) must call `verify_scopes(user_id, [DRIVE_READONLY_SCOPE], db)` before executing.
- Edit operations (`openForEditing`) must call `verify_scopes(user_id, [DRIVE_FILE_SCOPE], db)`.
- Content extraction calls should verify appropriate scopes (e.g., `DOCS_READONLY_SCOPE` for Docs).

Handle scope changes gracefully: if scopes are insufficient, return a structured error that the frontend can display with a "Grant additional permissions" button pointing to the incremental consent URL.

### 3. Input Validation Hardening

**Files to modify:**
- `/home/dev/projects/SmartSpecPro/apps/web/server/routers/googleDrive.ts` (created in Section 03)
- `/home/dev/projects/SmartSpecPro/python-backend/app/mcp/google_drive_mcp.py` (created in Section 09)

All tRPC procedures in `googleDriveRouter` must have strict Zod input schemas. Verify and harden:

```typescript
// Example Zod schemas for googleDrive.ts input validation

const driveFileIdSchema = z
  .string()
  .min(1)
  .max(256)
  .regex(/^[a-zA-Z0-9_-]+$/, "Invalid file ID format");

const searchQuerySchema = z
  .string()
  .min(1)
  .max(500)
  .transform((s) => s.trim());

const folderIdSchema = z
  .string()
  .max(256)
  .regex(/^[a-zA-Z0-9_-]*$/)
  .optional();
```

Key validation rules:
- **File IDs**: Alphanumeric + hyphens + underscores only, max 256 chars. Reject path traversal patterns (`../`, `..\\`, null bytes `%00`).
- **Search queries**: Max 500 characters, trimmed, no embedded control characters.
- **Folder selections (JSONB)**: Validate as array of valid folder ID strings, max 100 entries.
- **Cell ranges (Sheets)**: Validate against pattern `^[A-Z]+[0-9]+:[A-Z]+[0-9]+$` or sheet name format.

For Python Pydantic models in MCP tools, apply equivalent validation:

```python
# Pydantic validation for MCP tool inputs
from pydantic import BaseModel, Field, field_validator
import re

class DriveFileInput(BaseModel):
    file_id: str = Field(..., min_length=1, max_length=256)

    @field_validator("file_id")
    @classmethod
    def validate_file_id(cls, v: str) -> str:
        if not re.match(r'^[a-zA-Z0-9_-]+$', v):
            raise ValueError("Invalid file ID format")
        return v
```

### 4. Tenant Isolation Enforcement

**Files to modify:**
- `/home/dev/projects/SmartSpecPro/apps/web/server/routers/googleDrive.ts`
- `/home/dev/projects/SmartSpecPro/apps/web/server/services/federatedSearch.ts` (created in Section 10)
- `/home/dev/projects/SmartSpecPro/python-backend/app/mcp/google_drive_mcp.py`
- `/home/dev/projects/SmartSpecPro/python-backend/app/tasks/google_drive_tasks.py` (created in Section 11)

The existing library router at `/home/dev/projects/SmartSpecPro/apps/web/server/routers/library.ts` already resolves `tenantId` using `resolveLibraryTenantId()` and enforces it on all queries. Apply the same pattern to all Google Drive operations:

- Every tRPC procedure in `googleDriveRouter` must resolve `tenantId` from the authenticated context and include it in all database queries (WHERE clauses, INSERT values).
- `createVirtualDriveReference` must stamp `tenant_id` on both `library_items` and `library_links`.
- Vector store queries must always include a `tenant_id` metadata filter. This applies to both semantic search and federated search.
- Python Celery tasks must receive `tenant_id` as a task argument and use it in all DB and vector store operations.
- Cross-tenant data access must be impossible even if a user supplies another tenant's `driveFileId`.

Add a helper function in the `googleDrive.ts` router (similar to existing `resolveLibraryTenantId`):

```typescript
async function assertDriveTenantAccess(
  ctx: { tenantId: unknown; user: { id: number; currentTenantId?: unknown } },
  resourceTenantId: string
): Promise<void> {
  /**
   * Resolve the authenticated user's tenantId.
   * Compare against the resourceTenantId.
   * Throw TRPCError({ code: 'FORBIDDEN' }) on mismatch.
   */
}
```

### 5. Webhook CSRF Protection

**Files to modify:**
- `/home/dev/projects/SmartSpecPro/apps/web/server/routes/webhooks.ts` (created in Section 11)

The webhook handler must perform triple validation on every incoming request from Google. This was described in Section 11 but this section adds defense-in-depth:

- Validate `X-Goog-Channel-ID` matches a stored `google_drive_sync_state.channel_id`.
- Validate `X-Goog-Resource-ID` matches the stored `resource_id` for that channel.
- Validate `X-Goog-Channel-Token` matches the stored `channel_token` (32-byte cryptographically random hex string).
- All three must match the SAME sync state record. If any one is missing or mismatched, return `403 Forbidden` immediately.
- Use constant-time comparison for the channel token to prevent timing attacks:

```typescript
import crypto from "crypto";

function secureCompare(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
}
```

- Rate-limit the webhook endpoint itself (e.g., 100 requests per minute per IP) to prevent abuse.
- Log all rejected webhook attempts to the audit log with the source IP and the headers that failed validation.

### 6. Content Sanitization

**Files to modify:**
- `/home/dev/projects/SmartSpecPro/python-backend/app/services/google_content_extractor.py` (created in Section 06)

Add a sanitization step after content extraction and before storage/embedding. Create a dedicated sanitization function:

**File to create:** `/home/dev/projects/SmartSpecPro/python-backend/app/services/google_drive_content_sanitizer.py`

```python
# google_drive_content_sanitizer.py - stub

def sanitize_drive_content(raw_text: str) -> str:
    """
    Sanitize text extracted from Google Drive files before storage.

    Strips:
    - <script> tags and their content
    - HTML event handlers (onclick, onerror, onload, etc.)
    - <iframe>, <object>, <embed> tags
    - javascript: URIs
    - Data URIs with executable MIME types
    - Null bytes and control characters (except newlines/tabs)

    Preserves:
    - Plain text content
    - Markdown formatting (headings, lists, bold, italic, code)
    - Non-harmful HTML entities (&amp;, &lt;, etc.)
    - Code blocks (content within ``` fences is preserved as-is)

    Returns sanitized text.
    """
```

The existing `InputSanitizer` at `/home/dev/projects/SmartSpecPro/python-backend/app/core/input_sanitization.py` provides XSS pattern lists. Reuse those patterns but apply them in a content-aware way (do not strip things like `SELECT` from extracted document content -- that is SQL injection prevention, not relevant for stored content that will not be used in SQL queries).

The sanitizer should be called in `GoogleContentExtractor.extract()` as the final step before returning text, and also in `processGoogleDriveIndexJob` before chunking and embedding.

### 7. Audit Trail

**Files to modify:**
- `/home/dev/projects/SmartSpecPro/apps/web/server/services/auditLogger.ts` -- extend `AuditEventType`
- `/home/dev/projects/SmartSpecPro/apps/web/server/routers/googleDrive.ts`
- `/home/dev/projects/SmartSpecPro/python-backend/app/services/google_token_service.py`

Extend the existing JSONL audit logger to support Google Drive events. The existing `AuditEventType` union at `/home/dev/projects/SmartSpecPro/apps/web/server/services/auditLogger.ts` currently includes: `llm_request`, `llm_response`, `llm_stream_end`, `media_request`, `media_response`, `library_mutation`, `rollout_gate`, `skill_detect`, `skill_execute`, `error`.

Add new event types:

```typescript
export type AuditEventType =
  | "llm_request"
  | "llm_response"
  // ... existing types ...
  | "google_drive_connect"
  | "google_drive_disconnect"
  | "google_drive_token_refresh"
  | "google_drive_data_access"
  | "google_drive_sync"
  | "google_drive_webhook"
  | "google_drive_edit";
```

Events to log (with `traceId`, `userId`, timestamp):

| Operation | Event Type | Key Metadata |
|-----------|-----------|--------------|
| User connects Google | `google_drive_connect` | email, scopes granted |
| User disconnects Google | `google_drive_disconnect` | files_removed_count |
| Token refreshed | `google_drive_token_refresh` | success/failure, expires_at |
| File content accessed (MCP read) | `google_drive_data_access` | file_id, operation, credits_charged |
| Sync started/completed | `google_drive_sync` | files_total, files_processed, errors |
| Webhook received (valid) | `google_drive_webhook` | channel_id, change_type |
| Webhook rejected (invalid) | `google_drive_webhook` | rejection_reason, source_ip |
| Edit session opened | `google_drive_edit` | library_item_id, drive_file_id |
| Edit session saved back | `google_drive_edit` | library_item_id, version_created |

For Python-side operations (token refresh, content access), log to the Python backend's structured logger (structlog) with the same fields, so the audit trail is available in both log destinations.

### 8. Feature Flag: `driveReadonlyScopeApproved`

**Files to modify:**
- `/home/dev/projects/SmartSpecPro/apps/web/server/routers/systemSettings.ts`
- `/home/dev/projects/SmartSpecPro/apps/web/server/routers/googleDrive.ts`
- `/home/dev/projects/SmartSpecPro/apps/web/server/services/federatedSearch.ts`
- `/home/dev/projects/SmartSpecPro/apps/web/server/routes/webhooks.ts`
- `/home/dev/projects/SmartSpecPro/python-backend/app/mcp/google_drive_mcp.py`

Google's `drive.readonly` scope requires restricted scope verification with a third-party security assessment (4-6 weeks). Until approved, features that require this scope must be gated.

Store the flag in `system_settings` under category `oauth`, key `driveReadonlyScopeApproved`, value `"true"` or `"false"` (default `"false"`).

**Features gated by the flag (require `drive.readonly`):**
- MCP tools: `search_drive_files`, `read_drive_file`, `read_sheet_data`, `list_drive_folder`, `get_drive_file_info` (Section 09)
- Federated search Drive API leg (Section 10)
- Incremental sync and webhooks (Section 11)
- Initial sync (Section 11)

**Features NOT gated (use `drive.file` scope only):**
- OAuth connection (Section 03) -- can connect with just `drive.file`
- Edit in Google Docs/Sheets (Section 07) -- only accesses files the app creates
- Admin configuration (Section 01)
- Credit billing (Section 04)
- Budget protection (Section 05)

Implementation approach -- create a helper function:

```typescript
// In googleDrive.ts or a shared utility

async function isDriveReadonlyApproved(): Promise<boolean> {
  /**
   * Read system_settings where category='oauth' and
   * key='driveReadonlyScopeApproved'. Return true only
   * if value is exactly 'true'. Cache for 5 minutes.
   */
}
```

Each gated procedure/service should check this flag early and return a descriptive error:

```typescript
if (!await isDriveReadonlyApproved()) {
  throw new TRPCError({
    code: "PRECONDITION_FAILED",
    message: "Google Drive read access is pending verification. "
           + "Edit-in-Google features are available. "
           + "Contact admin when drive.readonly scope is approved.",
  });
}
```

For federated search, when the flag is false and `includeGoogleDrive` is requested, skip the Drive API leg and set `driveResultsStatus: "feature_disabled"` so the UI can display an appropriate message.

For MCP tool discovery, exclude Drive read tools from the tool list when the flag is false, so the LLM does not attempt to call them.

## File Summary

### New Files

| File | Purpose |
|------|---------|
| `/home/dev/projects/SmartSpecPro/python-backend/tests/test_google_drive_security.py` | Python security tests |
| `/home/dev/projects/SmartSpecPro/apps/web/server/security/googleDriveSecurity.test.ts` | TypeScript security tests |
| `/home/dev/projects/SmartSpecPro/python-backend/app/services/google_scope_guard.py` | Scope verification utility |
| `/home/dev/projects/SmartSpecPro/python-backend/app/services/google_drive_content_sanitizer.py` | Content sanitization for Drive text |

### Modified Files

| File | Change |
|------|--------|
| `/home/dev/projects/SmartSpecPro/python-backend/app/services/google_token_service.py` | Add encrypt/decrypt enforcement, startup validation, audit logging on refresh |
| `/home/dev/projects/SmartSpecPro/apps/web/server/routers/googleDrive.ts` | Add Zod input validation hardening, tenant isolation assertions, feature flag checks, audit logging |
| `/home/dev/projects/SmartSpecPro/apps/web/server/services/auditLogger.ts` | Add Google Drive event types to `AuditEventType` union |
| `/home/dev/projects/SmartSpecPro/apps/web/server/routes/webhooks.ts` | Add constant-time token comparison, rate limiting, rejection logging |
| `/home/dev/projects/SmartSpecPro/apps/web/server/services/federatedSearch.ts` | Add `driveReadonlyScopeApproved` flag check, `feature_disabled` status |
| `/home/dev/projects/SmartSpecPro/apps/web/server/routers/systemSettings.ts` | Add `driveReadonlyScopeApproved` to oauth category settings |
| `/home/dev/projects/SmartSpecPro/python-backend/app/services/google_content_extractor.py` | Integrate content sanitizer as final extraction step |
| `/home/dev/projects/SmartSpecPro/python-backend/app/mcp/google_drive_mcp.py` | Add scope verification, feature flag check, input validation, audit logging |
| `/home/dev/projects/SmartSpecPro/python-backend/app/tasks/google_drive_tasks.py` | Ensure tenant_id is passed and enforced in all task operations |
| `/home/dev/projects/SmartSpecPro/python-backend/app/core/smartspecweb_crypto.py` | Add `encrypt_smartspecweb()` function if not already present |

## Implementation Checklist

1. Write all test stubs (Python and TypeScript) as specified above.
2. Add `encrypt_smartspecweb()` to Python crypto module if missing; verify all token store/load paths use it.
3. Create `google_scope_guard.py` with `verify_scopes()` and `ScopeMissingError`.
4. Integrate scope checks into MCP tools, edit operations, and content extraction entry points.
5. Harden all Zod schemas in `googleDrive.ts` (file ID regex, query length limits, folder selections).
6. Harden all Pydantic models in MCP tools (file ID validation, range format checks).
7. Add `assertDriveTenantAccess()` helper and apply to all Drive router procedures.
8. Verify tenant_id is passed to and enforced in all Python Celery tasks.
9. Verify vector store queries always include tenant_id metadata filter.
10. Add constant-time comparison to webhook token validation.
11. Add webhook endpoint rate limiting and rejection audit logging.
12. Create `google_drive_content_sanitizer.py` and integrate into `GoogleContentExtractor.extract()`.
13. Extend `AuditEventType` with Google Drive event types.
14. Add audit logging calls at all sensitive operation points (connect, disconnect, refresh, data access, sync, webhook, edit).
15. Add `driveReadonlyScopeApproved` flag to `system_settings` and create `isDriveReadonlyApproved()` helper.
16. Gate MCP tools, federated search Drive leg, and sync/webhook features behind the flag.
17. Ensure edit-in-Google works regardless of flag state.
18. Run all tests and verify they pass.