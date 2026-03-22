# Feature 048: Auth Token Storage Hardening — Research Findings

## 1. Current Auth Architecture

### Dual Authentication System
SmartSpecPro uses a **dual auth architecture**:

| Component | Storage | Security | Notes |
|-----------|---------|----------|-------|
| **Session Token** | httpOnly Cookie (`app_session_id`) | Secure (HS256 JWT) | Primary auth method |
| **localStorage JWT** | `smartspec_auth_token` | XSS-vulnerable | Tauri desktop fallback only |
| **User Data Cache** | `smartspec_user_data` (localStorage) | Plaintext JSON | Non-sensitive cache |
| **LLM API Keys** | `sessionStorage` (`smartspec_apikey_*`) | XSS-vulnerable | User-provided keys |

### Session Cookie Configuration
**File:** `apps/web/server/_core/cookies.ts:24-83`
- Cookie name: `app_session_id` (from `@shared/const.ts`)
- httpOnly: **true** (mandatory)
- secure: true (HTTPS) / false (localhost)
- sameSite: "none" (HTTPS) / "lax" (HTTP)
- Duration: 30 days (login), 365 days (OAuth)

### Token Creation Flow
**File:** `apps/web/server/routers.ts:280-325`
1. User submits email + password
2. Server creates HS256 JWT via `sdk.createSessionToken()`
3. Sets httpOnly cookie via `res.cookie(COOKIE_NAME, token, cookieOptions)`
4. Returns `{ success: true, user: { id, email, name } }` — NO token in response body

### Token Verification
**File:** `apps/web/server/_core/sdk.ts:198-234`
- Algorithm: HS256 (HMAC with SHA-256)
- Secret: derived from `ENV.cookieSecret` via TextEncoder
- Extracts JTI for revocation tracking
- No database lookup at verification time (only at user fetch)

### Request Authentication Priority
**File:** `apps/web/server/_core/context.ts:27-41`
1. `Authorization: Bearer <token>` header (checked first)
2. `app_session_id` session cookie (fallback)

## 2. authService.ts Deep Dive

**File:** `apps/web/client/src/services/authService.ts` (~320 lines)

### Tauri vs Browser Branching
```
hasTauri() → true:  Use Tauri secure store (safeInvoke)
hasTauri() → false: Fall back to localStorage/sessionStorage
```

### localStorage Keys
| Key | Purpose | Lines |
|-----|---------|-------|
| `smartspec_auth_token` | JWT token fallback | 44, 67, 149 |
| `smartspec_user_data` | Cached user JSON | 87, 115, 150 |
| `smartspec_web_refresh_token` | Legacy (unused?) | 151 |
| `smartspec_web_token_expiry` | Legacy (unused?) | 152 |
| `smartspec_web_user` | Legacy (unused?) | 153 |

### sessionStorage Keys (API Keys)
| Key Pattern | Purpose | Lines |
|-------------|---------|-------|
| `smartspec_apikey_{provider}` | User LLM API keys | 277-319 |
| `oauth_state` | OAuth CSRF token | Separate file |
| `oauth_provider` | OAuth provider name | Separate file |

Providers: `openrouter`, `openai`, `anthropic`, `deepseek`, `google`

### Functions to Modify
| Function | Lines | Current Behavior | Target Behavior (Browser) |
|----------|-------|-----------------|--------------------------|
| `getAuthToken()` | 33-46 | Reads localStorage | Return null (cookie auto-sent) |
| `setAuthToken()` | 58-69 | Writes localStorage | No-op (server sets cookie) |
| `getAuthTokenSync()` | 51-53 | Returns cached | Return null |
| `isTokenExpired()` | 121-136 | Decodes JWT from localStorage | Server ping `/auth/me` |
| `verifyToken()` | 168-195 | Sends Bearer header | Use `credentials: 'include'` |
| `setupAuthInterceptor()` | 200-227 | Injects Bearer | Keep only 401 → logout |
| `setApiKey()` | 277-285 | Writes sessionStorage | tRPC mutation |
| `getApiKey()` | 287-294 | Reads sessionStorage | Not needed (server decrypts) |
| `deleteApiKey()` | 296-304 | Removes sessionStorage | tRPC mutation |
| `logout()` | 141-163 | Clears all keys | Clear legacy + cookies |

### Key Consumers of getAuthToken()
- `useAuth` hook (`apps/web/client/src/_core/hooks/useAuth.ts`) — Does NOT read tokens directly, uses `trpc.auth.me.useQuery()`
- tRPC client — Auto-attaches cookies via `credentials: 'include'`
- `verifyToken()` — Sends to `/auth/me` for validation

**Key Finding:** No frontend component directly reads the localStorage JWT for display or API calls. It's only used by authService internals.

## 3. Existing Encrypted Storage Patterns

### AES-256-GCM Encryption (crypto.ts)
**File:** `apps/web/server/services/crypto.ts`
- Algorithm: AES-256-GCM
- IV: 12 bytes (random per encryption)
- Auth Tag: 16 bytes
- Format: `iv:authTag:ciphertext` (all hex)
- Key: SHA-256 of `LLM_ENCRYPTION_KEY` env var

### Existing Encrypted Columns in Schema
| Table | Column | Purpose |
|-------|--------|---------|
| `llmProviders` | `apiKeyEncrypted` | Admin LLM provider keys |
| `mediaProviders` | `apiKeyEncrypted` | Media provider keys |
| `sttProviders` | `apiKeyEncrypted` | STT provider keys |
| `channelCredentials` | `credentialsEncrypted` | Channel integration credentials |
| `webhookTriggers` | `authSecretEncrypted` | Webhook secrets |
| `apiWebhookEndpoints` | `secretEncrypted` | Endpoint secrets |
| `workflowSecrets` | `encryptedValue` | Per-tenant workflow secrets |
| `systemSettings` | `value` (when `isSensitive=true`) | System-wide sensitive config |

### Public API Keys (Hash-Only Pattern)
**File:** `apps/web/drizzle/schema.ts:5455-5485`
- Table: `apiKeys`
- Stores only SHA-256 hash (`keyHash`), never plaintext
- Used for user-facing API keys (external access)
- Different pattern from what we need (we need reversible encryption)

## 4. LLM Request Path for User API Keys

### Current State
User-provided API keys from sessionStorage are **NOT currently used** in the production LLM request flow. The system uses admin-configured provider keys only.

### Admin Key Flow
**File:** `apps/web/server/services/llmRouter.ts:54-192`
1. Query `modelProviderMap` + `llmProviders` for enabled providers
2. Decrypt `apiKeyEncrypted` via `decrypt()` from crypto.ts
3. Pass decrypted key in-memory to LLM provider SDK
4. Key never returned to client or logged

### Future User Key Flow (to implement)
1. Frontend sends `{ provider: "openai", useUserKey: true }` in request
2. Server looks up `userLlmApiKeys` by userId + provider
3. Decrypts `apiKeyEncrypted` via crypto.ts
4. Uses decrypted key for the specific LLM API call
5. Key never leaves server memory

## 5. Test Infrastructure

### Existing Auth Tests
- `apps/web/server/auth.logout.test.ts` — Cookie clearing test
- `apps/web/server/__tests__/auth-cookies.test.ts` — Cookie security tests
- Pattern: `createAuthContext()` helper for mocked auth

### Test Patterns for Encrypted Data
- No existing tests for encrypt/decrypt directly
- Provider key tests mock at the service level
- Vitest with `@vitest/coverage-v8`

## 6. Impact Analysis

### Files That Read Auth Tokens from localStorage
Only `authService.ts` reads from localStorage. No other file directly accesses `smartspec_auth_token`.

### Files That Read API Keys from sessionStorage
Only `authService.ts` accesses sessionStorage for API keys. Consumer components call `getApiKey(provider)` / `setApiKey(provider, key)`.

### Components Using API Key Functions
- `apps/web/client/src/components/settings/UserAPIKeysPanel.tsx` — UI for managing keys
- Potentially chat components that allow user to provide their own key

### Minimal Blast Radius
Since all localStorage/sessionStorage access is centralized in `authService.ts`, the migration has a small, well-contained blast radius.
