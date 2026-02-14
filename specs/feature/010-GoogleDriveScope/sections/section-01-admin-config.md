I now have a thorough understanding of all the relevant files, patterns, and conventions. Let me generate the section content.

# Section 01: Admin Configuration -- Google OAuth App Settings

## Overview

This section adds the ability for platform admins to configure Google Cloud OAuth credentials (Client ID, Client Secret, Redirect URI) through the existing Admin Settings page. These credentials are required before any user can connect their Google account (Section 03). The pattern follows exactly how SMTP and Stripe credentials are already configured: values stored in the `system_settings` table under a category, with sensitive values encrypted via `encrypt()` from `crypto.ts`. The Python backend loads these dynamically from the database (with environment variable fallback) so no restart is needed when the admin changes configuration.

## Dependencies

- **No dependencies on other sections.** This section is part of Batch 1 (foundation) and can be implemented independently.
- **Blocks:** Section 03 (OAuth Consent) depends on these credentials being available.

## Files to Modify

| File | Action | Description |
|------|--------|-------------|
| `/home/dev/projects/SmartSpecPro/apps/web/server/routers/systemSettings.ts` | Modify | Add `saveGoogleOAuthConfig`, `getGoogleOAuthConfig`, `testGoogleConnection` mutations. Extend `settingCategorySchema` if needed. |
| `/home/dev/projects/SmartSpecPro/apps/web/client/src/pages/AdminSettings.tsx` | Modify | Add "Google Drive" section within the existing OAuth tab (or as a new sub-section), including "Test Connection" button. |
| `/home/dev/projects/SmartSpecPro/python-backend/app/core/oauth_config.py` | Modify | Extend to load Google Drive-specific scoped config from DB, with env var fallback, DB taking precedence. |

## Files to Create (Tests)

| File | Description |
|------|-------------|
| `/home/dev/projects/SmartSpecPro/apps/web/server/systemSettings.googleOAuth.test.ts` | Vitest tests for the backend mutations |
| `/home/dev/projects/SmartSpecPro/python-backend/tests/test_oauth_config.py` | pytest tests for the Python config loader |

---

## Tests (Write First)

### Vitest -- systemSettings router (`/home/dev/projects/SmartSpecPro/apps/web/server/systemSettings.googleOAuth.test.ts`)

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Tests for Google OAuth admin configuration in systemSettings router.
 *
 * These tests validate that:
 * 1. Google OAuth config (clientId, clientSecret, redirectUri) can be saved
 * 2. clientSecret is stored encrypted (isSensitive: true)
 * 3. Only admin users can save/read Google OAuth config
 * 4. getGoogleOAuthConfig returns a masked clientSecret for display
 * 5. testGoogleConnection validates credential format before calling Google
 * 6. testGoogleConnection returns an error for invalid credentials
 *
 * Mocking strategy:
 * - Mock `../db` (getDb) to return an in-memory mock DB with select/insert/update
 * - Mock `../services/crypto` for encrypt/decrypt
 * - Mock `fetch` for the Google token info endpoint test
 */

describe("saveGoogleOAuthConfig", () => {
  it("stores client_id, client_secret (encrypted), and redirect_uri in system_settings under 'oauth' category");
  it("rejects non-admin users with an authorization error");
  it("updates existing records when config already exists (upsert behavior)");
  it("stores clientSecret with isSensitive: true");
});

describe("getGoogleOAuthConfig", () => {
  it("returns clientId and redirectUri in plaintext");
  it("returns masked clientSecret for display (never reveals actual secret)");
  it("returns googleClientSecretConfigured: true when secret exists");
  it("returns googleClientSecretConfigured: false when secret is not set");
});

describe("testGoogleConnection", () => {
  it("validates credential format before calling Google (rejects empty clientId)");
  it("validates credential format before calling Google (rejects empty clientSecret)");
  it("returns success when Google token info endpoint responds 200");
  it("returns error with message when Google rejects credentials");
});
```

### Vitest -- AdminSettings UI (add to existing component tests or in a new file)

These tests are descriptive stubs. The implementer should use React Testing Library with the existing Vitest setup.

```typescript
/**
 * Component tests for Google OAuth admin configuration panel.
 *
 * Tests:
 * - GoogleOAuthConfigPanel renders form fields for client_id, client_secret, redirect_uri
 * - GoogleOAuthConfigPanel shows "Saved" toast on successful save
 * - GoogleOAuthConfigPanel shows "Test Connection" button and handles success/failure states
 * - redirect_uri field defaults to "https://smartaihub.app/auth/callback/google"
 * - "Test Connection" button is disabled when clientId or clientSecret is empty
 */
```

### pytest -- oauth_config (`/home/dev/projects/SmartSpecPro/python-backend/tests/test_oauth_config.py`)

```python
"""
Tests for Google OAuth config loader (oauth_config.py).

Tests validate:
1. load_google_oauth_config reads from DB system_settings table
2. Falls back to env vars when DB config is missing
3. DB config takes precedence over env vars when both exist
4. Decrypts sensitive values (clientSecret) correctly using smartspecweb_crypto

Mocking strategy:
- Mock the AsyncSession.execute() to return controlled rows
- Mock decrypt_smartspecweb() to validate it's called for sensitive fields
- Mock os.getenv() for env var fallback tests
"""
import pytest
from unittest.mock import AsyncMock, patch, MagicMock


@pytest.mark.unit
@pytest.mark.asyncio
async def test_load_google_oauth_config_reads_from_db():
    """get_oauth_config returns values from system_settings when rows exist."""
    pass


@pytest.mark.unit
@pytest.mark.asyncio
async def test_load_google_oauth_config_falls_back_to_env_vars():
    """get_oauth_config uses env vars when DB returns no rows."""
    pass


@pytest.mark.unit
@pytest.mark.asyncio
async def test_load_google_oauth_config_db_takes_precedence():
    """When both DB and env vars have a value, DB value wins."""
    pass


@pytest.mark.unit
@pytest.mark.asyncio
async def test_load_google_oauth_config_decrypts_sensitive_values():
    """Values with isSensitive=True are passed through decrypt_smartspecweb."""
    pass
```

---

## Implementation Details

### 1. Backend: systemSettings Router Changes

**File:** `/home/dev/projects/SmartSpecPro/apps/web/server/routers/systemSettings.ts`

The existing router already has `getOAuthSettings`, `updateOAuthSettings`, and `getOAuthConfigDecrypted` procedures that handle Google OAuth credentials under the `"oauth"` category. The existing keys are: `googleClientId`, `googleClientSecret`, `googleRedirectUri` (alongside GitHub equivalents).

**What already exists and what needs to change:**

The current `getOAuthSettings` and `updateOAuthSettings` procedures already handle storing and retrieving Google OAuth credentials. The existing implementation follows the correct pattern:
- `googleClientSecret` is stored encrypted with `isSensitive: true`
- `googleClientId` and `googleRedirectUri` are stored in plaintext
- Masked values are returned for display

**New procedure to add -- `testGoogleOAuthConnection`:**

Add a new `adminProcedure` mutation that validates the stored Google OAuth credentials by making a lightweight API call to Google. The approach:

1. Read `googleClientId` and `googleClientSecret` from `system_settings` (category `"oauth"`).
2. Decrypt the client secret using `decrypt()`.
3. Validate format: client ID should match `*.apps.googleusercontent.com` pattern, client secret should not be empty.
4. Make a test request to the Google OAuth token info endpoint. A practical approach is to call the Google discovery document endpoint (`https://accounts.google.com/.well-known/openid-configuration`) to verify the OAuth infrastructure is reachable, then validate the client ID format. A full credential validation is not possible without a token exchange, so the test should confirm:
   - Client ID format is valid
   - Client Secret is non-empty and decryptable
   - Google OAuth endpoints are reachable
5. Return `{ success: boolean, message: string }`.

The procedure signature should follow the same pattern as `testStripeConnection` and `testSmtpConnection`:

```typescript
testGoogleOAuthConnection: adminProcedure.mutation(async () => {
  // 1. Read settings from DB
  // 2. Decrypt client secret
  // 3. Validate format
  // 4. Test connectivity to Google OAuth endpoints
  // 5. Return { success, message }
})
```

**Redirect URI default:** When displaying the redirect URI in the admin panel, if no value is stored, default to `https://smartaihub.app/auth/callback/google`. This default should also be shown as placeholder text in the UI.

### 2. Frontend: AdminSettings.tsx Changes

**File:** `/home/dev/projects/SmartSpecPro/apps/web/client/src/pages/AdminSettings.tsx`

The existing OAuth tab (lines 816-974) already has Google OAuth fields (Client ID, Client Secret, Redirect URI). The changes needed are:

**Add a "Google Drive Integration" info section** within the existing OAuth tab, below the current Google OAuth fields. This section should:
- Display a note explaining that these same Google OAuth credentials are used for Google Drive integration
- State that the OAuth app must have the following APIs enabled in Google Cloud Console: Google Drive API, Google Docs API, Google Sheets API, Google Slides API
- Include a "Test Connection" button that calls the new `testGoogleOAuthConnection` mutation

**Add the Test Connection button** below the existing Google OAuth form fields (before the GitHub OAuth section). The button should:
- Be disabled when `googleClientId` is empty or when a test is in progress
- Show a loading spinner during the test
- Show success/error toast based on the response

**Add the `testGoogleOAuthConnection` mutation hook:**

```typescript
const testGoogleOAuthMutation = trpc.systemSettings.testGoogleOAuthConnection.useMutation({
  onSuccess: (data) => {
    if (data.success) {
      toast.success(data.message);
    } else {
      toast.error(data.message);
    }
  },
  onError: (err) => {
    toast.error(`Test failed: ${err.message}`);
  },
});
```

**UI placement:** The Test Connection button should be placed within the Google OAuth section, similar to how the SMTP "Test Connection" button appears in the SMTP tab. A suggested layout:

```
[Google OAuth section header]
  Client ID input
  Client Secret input (with eye toggle, "Configured" badge)
  Redirect URI input (default placeholder: https://smartaihub.app/auth/callback/google)

  [Info box: "These credentials enable Google Drive & Workspace integration.
   Ensure Google Drive API, Docs API, Sheets API, and Slides API are enabled
   in your Google Cloud Console project."]

  [Test Connection button]    [Save OAuth Settings button]
```

The existing Save button at line 960 should remain. The Test Connection button is additive.

### 3. Python Backend: oauth_config.py Changes

**File:** `/home/dev/projects/SmartSpecPro/python-backend/app/core/oauth_config.py`

The existing `get_oauth_config()` function already handles the core pattern correctly:
- Reads from `system_settings` table where `category = 'oauth'`
- Decrypts sensitive values using `decrypt_smartspecweb()`
- Falls back to environment variables for missing keys
- DB values take precedence over env vars

**Changes needed:**

The existing code is mostly sufficient for Section 01. The key enhancement is to ensure that:

1. The default redirect URI for Google should be updated from `http://localhost:3000/auth/callback/google` (line 64) to `https://smartaihub.app/auth/callback/google` for production readiness. The env var fallback should still use the env var value if set, but the hardcoded default should reflect the production domain.

2. Add a convenience function for loading just the Google-specific config, which later sections (Section 03 for OAuth consent, Section 07 for MCP tools) will use:

```python
async def get_google_oauth_config(db: AsyncSession) -> Dict[str, str]:
    """
    Get Google-specific OAuth config (clientId, clientSecret, redirectUri).
    
    Returns dict with keys:
        googleClientId, googleClientSecret, googleRedirectUri
    
    Raises ValueError if clientId or clientSecret are not configured.
    """
    # Delegates to get_oauth_config and filters to Google keys
    # Validates required fields are present
```

3. Add the `_SENSITIVE_KEYS` set already includes `"googleClientSecret"` (line 19 of the existing file), so no change is needed there.

**Dynamic loading (no restart):** The existing implementation already loads config fresh from the DB on each call to `get_oauth_config()`. There is no caching layer that would require a restart. This satisfies the requirement that Python backend reads credentials dynamically.

### 4. Storage Pattern Details

All Google OAuth credentials are stored in the existing `system_settings` table (no schema changes required for this section):

| category | key | isSensitive | Example value |
|----------|-----|-------------|---------------|
| `oauth` | `googleClientId` | `false` | `123456789.apps.googleusercontent.com` |
| `oauth` | `googleClientSecret` | `true` | `(encrypted via AES-256-GCM)` |
| `oauth` | `googleRedirectUri` | `false` | `https://smartaihub.app/auth/callback/google` |

This uses the same category (`oauth`) as the existing Google login credentials. The keys are already defined in the current `updateOAuthSettings` and `getOAuthSettings` procedures. The existing infrastructure fully supports this -- no new categories or schema changes are needed.

### 5. Key Decisions Summary

- **No new `system_settings` category needed.** Google OAuth credentials already use the `"oauth"` category. The `settingCategorySchema` enum already includes `"oauth"`.
- **Same credentials for login and Drive.** The Google OAuth Client ID / Secret configured here are used for both Google social login (existing) and Google Drive integration (new). The difference is in the scopes requested, which is handled in Section 03 (incremental consent).
- **Redirect URI default.** Defaults to `https://smartaihub.app/auth/callback/google` (production domain). Configurable via the admin UI or `GOOGLE_REDIRECT_URI` env var.
- **Test Connection is best-effort.** Full credential validation requires a token exchange flow. The test validates format and Google endpoint reachability.
- **Python reads dynamically.** No caching, no restart required. Each call to `get_oauth_config()` or `get_google_oauth_config()` reads fresh from the DB.