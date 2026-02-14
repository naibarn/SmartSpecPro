I now have sufficient context to write the section. Let me produce the complete section content.

# Section 03: Per-User Google OAuth -- Incremental Consent

## Overview

This section implements per-user Google OAuth with incremental consent for Drive scopes. Each user can connect their Google account via the Settings page, granting additional Drive/Workspace scopes on top of the basic login scopes. A new `GoogleTokenService` in Python handles token lifecycle (auto-refresh, expiry detection). A new `googleDriveRouter` in Node.js provides tRPC procedures that proxy to the Python backend. The frontend adds an "Integrations" tab to the Settings page.

## Dependencies

- **section-01-admin-config**: Admin must have configured Google OAuth credentials (Client ID, Client Secret, Redirect URI) in `system_settings` under category `oauth`. This section reads those credentials via the existing `get_oauth_config()` function.
- **section-02-database-schema**: The `oauth_connections` table must have the new columns (`status`, `scopes`, `tenant_id`) and the unique constraint on `(user_id, provider)`. The `google_drive_sync_state` table must exist for initial sync assessment (referenced but not heavily used in this section).

## Tests First

### Python Tests -- `python-backend/tests/test_google_token_service.py`

```
@pytest.mark.unit
@pytest.mark.asyncio
class TestGoogleTokenService:
    """Tests for GoogleTokenService token lifecycle management."""

    # Test: get_valid_access_token returns cached token when not expired
    #   - Mock oauth_connections row with token_expires_at > now + 5 min
    #   - Assert returned token matches stored access_token
    #   - Assert no HTTP call to Google token endpoint

    # Test: get_valid_access_token refreshes token when within 5 minutes of expiry
    #   - Mock oauth_connections row with token_expires_at = now + 3 min
    #   - Mock httpx POST to https://oauth2.googleapis.com/token returning new tokens
    #   - Assert new access_token is stored in DB
    #   - Assert new token_expires_at is updated

    # Test: get_valid_access_token raises InvalidGrantError on invalid_grant response
    #   - Mock oauth_connections row with expired token
    #   - Mock httpx POST returning {"error": "invalid_grant"}
    #   - Assert InvalidGrantError is raised
    #   - Assert oauth_connections.status is updated to "expired"

    # Test: get_valid_access_token updates stored token after successful refresh
    #   - Verify DB write with new access_token, refresh_token (if provided), expires_at

    # Test: get_valid_access_token handles concurrent refresh requests (only one refresh)
    #   - Two concurrent calls should not both try to refresh
    #   - Use asyncio.Lock or check-then-update pattern

    # Test: build_drive_auth_url includes correct Drive scopes
    #   - Assert URL contains drive.readonly, drive.file, documents.readonly, spreadsheets.readonly
    #   - Assert URL contains include_granted_scopes=true
    #   - Assert URL contains access_type=offline and prompt=consent

    # Test: build_drive_auth_url sets access_type=offline and prompt=consent
    #   - Parse the returned URL and verify query params

    # Test: exchange_drive_code stores tokens with status=active and scopes list
    #   - Mock code exchange response
    #   - Assert oauth_connections row created/updated with correct scopes and status
```

### Python Tests -- `python-backend/tests/test_oauth_drive_endpoint.py`

```
@pytest.mark.unit
@pytest.mark.asyncio
class TestDriveOAuthEndpoint:
    """Tests for the /api/oauth/google/drive/authorize endpoint."""

    # Test: endpoint returns authorization URL with Drive scopes
    #   - Mock get_oauth_config to return valid credentials
    #   - Call GET /api/oauth/google/drive/authorize with auth header
    #   - Assert response contains authorization_url with correct scopes

    # Test: endpoint returns 503 when Google OAuth not configured
    #   - Mock get_oauth_config returning empty client_id
    #   - Assert 503 response

    # Test: callback endpoint exchanges code and stores encrypted tokens
    #   - Mock token exchange and profile fetch
    #   - Assert oauth_connections created with encrypted tokens
    #   - Assert scopes column populated

    # Test: callback handles reconnection (upsert, not duplicate)
    #   - Pre-insert an oauth_connections row
    #   - Call callback with new code
    #   - Assert single row exists (updated, not duplicated)
    #   - Assert status set back to "active" if was "expired"
```

### Vitest Tests -- `apps/web/server/routers/googleDrive.test.ts`

```
describe("googleDriveRouter", () => {
  // Test: getConnectionStatus returns "not_connected" when no oauth_connection exists
  //   - Mock Python backend GET /api/internal/google-drive/connection-status
  //   - Assert response has status: "not_connected"

  // Test: getConnectionStatus returns "connected" with email and scopes when connected
  //   - Mock backend returning connected status with email and scopes array
  //   - Assert response includes email, scopes, connectedAt

  // Test: getConnectionStatus returns "expired" when connection status is expired
  //   - Mock backend returning expired status
  //   - Assert response has status: "expired"

  // Test: getAuthUrl returns valid Google OAuth URL with correct scopes
  //   - Mock backend returning auth URL
  //   - Assert URL contains expected scope parameters

  // Test: completeOAuth exchanges code for tokens and stores encrypted
  //   - Mock backend POST with code
  //   - Assert success response

  // Test: completeOAuth handles duplicate connection (upsert, not error)
  //   - Mock backend returning success even when connection exists
  //   - Assert no error thrown

  // Test: disconnect calls Python backend and returns success
  //   - Mock backend DELETE
  //   - Assert success response
});
```

### Vitest Tests -- Settings UI (component tests)

```
describe("IntegrationsTab", () => {
  // Test: renders Google Drive card with Connect button when not connected
  //   - Mock getConnectionStatus returning "not_connected"
  //   - Assert "Connect Google Drive" button is visible

  // Test: shows Connected status with email when connected
  //   - Mock getConnectionStatus returning "connected" with email
  //   - Assert email displayed, Disconnect button visible

  // Test: shows "Connection expired" banner with Reconnect button when expired
  //   - Mock getConnectionStatus returning "expired"
  //   - Assert warning banner with "Reconnect" button visible

  // Test: Connect button opens popup with OAuth URL
  //   - Mock getAuthUrl returning a URL
  //   - Simulate click, assert window.open called with URL
});
```

## Implementation Details

### 1. Python Backend -- GoogleTokenService

**File to create:** `/home/dev/projects/SmartSpecPro/python-backend/app/services/google_token_service.py`

This service manages the Google OAuth token lifecycle for per-user Drive connections. It is separate from the login OAuth flow (which creates/authenticates users) -- this service manages tokens for already-authenticated users who want to use Google Drive features.

Key class: `GoogleTokenService`

Methods to implement:

- `__init__(self, db: AsyncSession)` -- takes a database session.

- `async get_valid_access_token(self, user_id: int) -> str` -- returns a valid access token for the user. Checks `oauth_connections` for the user's Google connection. If the token expires within 5 minutes, refreshes it using the stored `refresh_token` by calling `POST https://oauth2.googleapis.com/token` with `grant_type=refresh_token`. On `invalid_grant` error from Google, sets `oauth_connections.status = "expired"` and raises `InvalidGrantError`. Uses the OAuth config from `get_oauth_config(db)` for `client_id` and `client_secret`. Stores the new access token and expiry back to the DB.

- `async build_drive_auth_url(self, user_id: int) -> dict` -- builds the Google OAuth authorization URL with incremental Drive scopes. The URL includes these query parameters:
  - `client_id` from system_settings
  - `redirect_uri` -- uses a Drive-specific callback path (e.g., `https://smartaihub.app/auth/callback/google-drive`)
  - `response_type=code`
  - `scope` -- the Drive scopes: `https://www.googleapis.com/auth/drive.readonly https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/documents.readonly https://www.googleapis.com/auth/spreadsheets.readonly`
  - `include_granted_scopes=true` -- for incremental consent
  - `access_type=offline` -- to get a refresh token
  - `prompt=consent` -- to force consent screen (ensures refresh token is always returned)
  - `state` -- signed CSRF token (reuse existing `generate_oauth_state()`)

  Returns `{"authorization_url": url, "state": state}`.

- `async exchange_drive_code(self, user_id: int, code: str, state: str) -> dict` -- exchanges the authorization code for tokens. Validates the state parameter. Calls `POST https://oauth2.googleapis.com/token` with the code. Stores/updates `oauth_connections` with:
  - `access_token`, `refresh_token`, `token_expires_at`
  - `status = "active"`
  - `scopes` -- the granted scopes (comma-separated string)
  - Uses upsert logic: if a Google connection already exists for this user, update it; otherwise insert.
  Returns the user's Google email and granted scopes.

- `async get_connection_status(self, user_id: int) -> dict` -- returns the current connection status. Queries `oauth_connections` for provider="google" and the user. Returns `{"status": "not_connected" | "connected" | "expired", "email": str | None, "scopes": list[str], "connectedAt": str | None}`.

- `async disconnect(self, user_id: int) -> bool` -- removes the Google connection. This is the simple version (Section 14 adds full cleanup). For now: delete the `oauth_connections` row for provider="google" and the user.

Custom exception class to define in the same file or a shared exceptions module:

```python
class InvalidGrantError(Exception):
    """Raised when Google returns invalid_grant during token refresh."""
    pass
```

Token encryption: The existing `oauth_connections` model stores `access_token` and `refresh_token` as plaintext `Text` columns. For this feature, tokens should be encrypted using the `smartspecweb_crypto` module before storage and decrypted on read. However, the existing OAuth flow stores them in plaintext. To maintain backward compatibility while improving security, the `GoogleTokenService` should encrypt new Drive tokens using `encrypt_smartspecweb()` (the Node.js-compatible encryption function) and decrypt on read. If `encrypt_smartspecweb` does not exist yet, implement it in `python-backend/app/core/smartspecweb_crypto.py` alongside the existing `decrypt_smartspecweb()` function, using the same AES-256-GCM algorithm and `LLM_ENCRYPTION_KEY`.

### 2. Python Backend -- Drive OAuth Endpoint

**File to modify:** `/home/dev/projects/SmartSpecPro/python-backend/app/api/oauth.py`

Add two new endpoints:

- `GET /api/oauth/google/drive/authorize` -- requires authentication (`current_user: User = Depends(get_current_user)`). Calls `GoogleTokenService.build_drive_auth_url(user_id)` and returns the URL and state.

- `POST /api/oauth/google/drive/callback` -- requires authentication. Accepts `{"code": str, "state": str}`. Calls `GoogleTokenService.exchange_drive_code(user_id, code, state)`. Returns the connection result.

- `GET /api/oauth/google/drive/status` -- requires authentication. Calls `GoogleTokenService.get_connection_status(user_id)`. Returns the status object.

- `DELETE /api/oauth/google/drive/disconnect` -- requires authentication. Calls `GoogleTokenService.disconnect(user_id)`. Returns `{"success": true}`.

These endpoints follow the same pattern as the existing `google_authorize` and `google_callback` endpoints but target authenticated users adding Drive scopes, not creating new accounts.

### 3. Node.js Backend -- googleDriveRouter

**File to create:** `/home/dev/projects/SmartSpecPro/apps/web/server/routers/googleDrive.ts`

Create a tRPC router with procedures that proxy to the Python backend. This follows the existing pattern where the Node.js backend proxies certain requests to Python (similar to `workflowRouter`, `approvalsRouter`).

Procedures to implement:

- `getConnectionStatus` -- `protectedProcedure.query` that calls Python `GET /api/oauth/google/drive/status` with the user's auth token. Returns `{status, email, scopes, connectedAt}`.

- `getAuthUrl` -- `protectedProcedure.query` that calls Python `GET /api/oauth/google/drive/authorize`. Returns `{authorizationUrl, state}`.

- `completeOAuth` -- `protectedProcedure.input(z.object({code: z.string(), state: z.string()})).mutation` that calls Python `POST /api/oauth/google/drive/callback` with the code and state. Returns success/failure.

- `disconnect` -- `protectedProcedure.mutation` that calls Python `DELETE /api/oauth/google/drive/disconnect`. Returns success/failure.

For the proxy calls, use the same internal HTTP pattern used elsewhere in the codebase: call `fetch(PY_BACKEND + path)` with a short-lived Bearer JWT signed via `signBearerToken()` that carries the user's `id` and `tenantId`. The Python backend authenticates via `get_current_user` which reads the JWT.

### 4. Register the Router

**File to modify:** `/home/dev/projects/SmartSpecPro/apps/web/server/routers.ts`

Add the import and registration:

```typescript
import { googleDriveRouter } from "./routers/googleDrive";
```

And in the `appRouter`:

```typescript
// Google Drive integration
googleDrive: googleDriveRouter,
```

### 5. Frontend -- Integrations Tab in Settings

**File to modify:** `/home/dev/projects/SmartSpecPro/apps/web/client/src/pages/Settings.tsx`

Add a new tab `'integrations'` to the `SettingsTab` type. Add the tab button in the sidebar navigation. The Integrations tab contains a "Google Drive & Workspace" card component.

**File to create:** `/home/dev/projects/SmartSpecPro/apps/web/client/src/components/settings/GoogleDrivePanel.tsx`

This component renders the Google Drive connection card within the Integrations tab. It has three visual states:

1. **Not Connected**: Shows a "Connect Google Drive" button with a description of what connecting enables (edit Word/Excel in Google Docs/Sheets, AI search of Drive files, etc.). Clicking the button opens a popup window to the OAuth consent screen.

2. **Connected**: Shows the connected Google email, granted scopes as badges, connection date, and a "Disconnect" button. Also shows basic stats placeholders (indexed files count, last sync time) that will be populated by later sections.

3. **Expired**: Shows a warning banner explaining the connection has expired, with a "Reconnect" button that re-triggers the OAuth flow.

OAuth popup flow implementation:
- Call `trpc.googleDrive.getAuthUrl.useQuery()` to get the OAuth URL.
- On "Connect" click, open a popup window (`window.open(authUrl, '_blank', 'width=600,height=700')`).
- The popup redirects to the callback URL after user approves.
- The callback page (see below) exchanges the code and closes the popup.
- The parent window detects the popup closing and refetches `getConnectionStatus` to update the UI.

**File to create:** `/home/dev/projects/SmartSpecPro/apps/web/client/src/pages/GoogleDriveCallback.tsx`

A minimal page that handles the OAuth callback redirect. It:
1. Extracts `code` and `state` from the URL query parameters.
2. Calls `trpc.googleDrive.completeOAuth.mutate({code, state})`.
3. Shows a brief "Connecting..." spinner, then "Connected!" or error message.
4. Calls `window.close()` to close the popup after a short delay.

Register this page in the router (`App.tsx`) at path `/auth/callback/google-drive`.

### 6. Error Handling -- invalid_grant

When the Python `GoogleTokenService` detects an `invalid_grant` error during token refresh:

1. The `oauth_connections.status` is set to `"expired"`.
2. Any sync or webhook operations for this user are paused (relevant in later sections, but the status field enables this).
3. Existing virtual references and vectors are preserved (not deleted).
4. The frontend `getConnectionStatus` query returns `status: "expired"`, which triggers the expired banner with a "Reconnect" button.

The "Reconnect" button re-uses the same OAuth flow as initial connection (open popup, go through consent, exchange code). The `exchange_drive_code` method uses upsert logic, so reconnecting updates the existing `oauth_connections` row rather than creating a duplicate.

## File Summary

| File | Action | Description |
|------|--------|-------------|
| `/home/dev/projects/SmartSpecPro/python-backend/app/services/google_token_service.py` | Create | GoogleTokenService class with token lifecycle management |
| `/home/dev/projects/SmartSpecPro/python-backend/app/api/oauth.py` | Modify | Add 4 new Drive OAuth endpoints |
| `/home/dev/projects/SmartSpecPro/python-backend/tests/test_google_token_service.py` | Create | Unit tests for GoogleTokenService |
| `/home/dev/projects/SmartSpecPro/python-backend/tests/test_oauth_drive_endpoint.py` | Create | Unit tests for Drive OAuth endpoints |
| `/home/dev/projects/SmartSpecPro/apps/web/server/routers/googleDrive.ts` | Create | tRPC router proxying to Python backend |
| `/home/dev/projects/SmartSpecPro/apps/web/server/routers/googleDrive.test.ts` | Create | Vitest tests for googleDriveRouter |
| `/home/dev/projects/SmartSpecPro/apps/web/server/routers.ts` | Modify | Register googleDriveRouter in appRouter |
| `/home/dev/projects/SmartSpecPro/apps/web/client/src/pages/Settings.tsx` | Modify | Add 'integrations' tab |
| `/home/dev/projects/SmartSpecPro/apps/web/client/src/components/settings/GoogleDrivePanel.tsx` | Create | Google Drive connection card component |
| `/home/dev/projects/SmartSpecPro/apps/web/client/src/pages/GoogleDriveCallback.tsx` | Create | OAuth callback popup page |
| `/home/dev/projects/SmartSpecPro/apps/web/client/src/App.tsx` | Modify | Add route for `/auth/callback/google-drive` |

## Key Implementation Notes

- The `google_authorize` endpoint in `oauth.py` currently uses scopes `openid email profile` for login. The new Drive endpoints use completely different scopes and serve a different purpose (feature enablement vs. authentication). They must be separate endpoints.
- The `include_granted_scopes=true` parameter is critical for incremental consent -- it tells Google to merge the new Drive scopes with any previously granted scopes (like `openid email profile` from login), rather than replacing them.
- The `prompt=consent` parameter ensures Google always shows the consent screen and always returns a `refresh_token`. Without this, Google only returns a `refresh_token` on the first authorization, which would break reconnection flows.
- The redirect URI for Drive OAuth (`/auth/callback/google-drive`) is different from the login OAuth redirect URI (`/auth/callback/google`). This separation is important because the callback handling logic differs: login callbacks create sessions, while Drive callbacks just store tokens for an already-authenticated user.
- Token encryption: while the existing OAuth model stores tokens as plaintext, the `GoogleTokenService` should encrypt Drive tokens. If adding `encrypt_smartspecweb()` to the crypto module is deferred, at minimum document this as a security TODO for section-15-security-hardening.