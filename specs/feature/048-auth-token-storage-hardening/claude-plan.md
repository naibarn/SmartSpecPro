# Feature 048: Auth Token Storage Hardening — Implementation Plan

## Overview

SmartSpecPro has a dual authentication architecture: httpOnly session cookies (secure, primary) and localStorage JWT (insecure, Tauri desktop fallback). This plan removes the browser localStorage fallback while preserving Tauri desktop compatibility, then adds encrypted server-side storage for user-provided LLM API keys.

The work is split into two independent phases that ship separately:
- **Phase 1:** Remove localStorage JWT fallback for browser context
- **Phase 2:** Migrate user LLM API keys from sessionStorage to encrypted database storage

## Background & Motivation

### Security Vulnerabilities

1. **FE01 (CRITICAL):** JWT stored in `localStorage` at key `smartspec_auth_token`. Any XSS vulnerability allows full session theft. The httpOnly cookie already handles auth for browser users — the localStorage path is dead weight.

2. **FE07 (HIGH):** User-provided LLM API keys stored in `sessionStorage` at `smartspec_apikey_{provider}`. These keys grant access to paid external services (OpenAI, Anthropic, etc.). Currently the UI exists but backend doesn't consume user keys — now is the right time to fix storage before activation.

### Why It's Safe to Remove localStorage JWT

The browser auth flow already works entirely via httpOnly cookies:
- Login sets cookie `app_session_id` (httpOnly, secure, sameSite)
- tRPC client auto-sends cookies via `credentials: 'include'`
- `useAuth()` hook calls `trpc.auth.me.useQuery()` — no direct token access
- No frontend component reads the JWT from localStorage for display or API calls

The localStorage path only exists as a fallback in `authService.ts` when `hasTauri()` returns false. Removing it for browser users has zero functional impact.

---

## Phase 1: Remove localStorage JWT Fallback

### 1.1 Architecture Decision

**Strategy:** Modify `authService.ts` to return null/no-op for all token storage operations when running in browser context. Preserve the Tauri secure store path unchanged.

**Detection:** `hasTauri()` already checks `window.__TAURI__`. The branching stays the same; we only change what the browser fallback does.

### 1.2 Changes to authService.ts

**File:** `apps/web/client/src/services/authService.ts`

#### getAuthToken()
- **Tauri path:** Unchanged — reads from Tauri secure store
- **Browser path:** Return `null` instead of reading localStorage. The httpOnly cookie is sent automatically; client code never needs the raw token.
- **Impact:** Functions that call `getAuthToken()` to check "is user logged in" must use a different signal. `verifyToken()` and `isTokenExpired()` are the main callers.

#### setAuthToken(token)
- **Tauri path:** Unchanged — writes to Tauri secure store
- **Browser path:** No-op (do nothing). Server sets the httpOnly cookie via `Set-Cookie` header. The client never needs to store the token.

#### getAuthTokenSync()
- Return `null` in browser context. This function returns the in-memory cached token. Since browser path no longer caches, it returns null.

#### isTokenExpired()
- **Tauri path:** Unchanged — decodes JWT from secure store
- **Browser path:** Cannot decode httpOnly cookie (JavaScript can't access it). Replace with a lightweight server check: `fetch('/api/auth/me', { credentials: 'include' })`. Return `true` if 401, `false` if 200.

#### verifyToken()
- **Tauri path:** Unchanged — sends Bearer header
- **Browser path:** Already calls `/auth/me`. Change from `Authorization: Bearer` to `credentials: 'include'` so the httpOnly cookie is sent instead.

#### setupAuthInterceptor()
- Remove Bearer token injection. The interceptor only needs to handle 401/403 → auto-logout. Cookies are sent automatically by the browser.

#### logout()
- Add cleanup of all legacy localStorage keys on logout
- Keep the Tauri `clear_all_credentials` call
- Clear: `smartspec_auth_token`, `smartspec_user_data`, `smartspec_web_refresh_token`, `smartspec_web_token_expiry`, `smartspec_web_user`

### 1.3 Startup Cleanup

**File:** `apps/web/client/src/App.tsx` (or a dedicated `cleanupLegacyAuth.ts`)

On app startup (once, idempotent):
1. If `!hasTauri()` and `localStorage.getItem('smartspec_auth_token')` exists:
   - Remove all legacy localStorage keys
   - The user's httpOnly cookie session may still be valid — they won't need to re-login if the cookie exists
   - If the cookie doesn't exist (or expired), the normal auth flow redirects to login

### 1.4 tRPC Client Configuration

**Verify** that the tRPC client in `apps/web/client/src/lib/trpc.ts` already uses `credentials: 'include'` in its httpLink configuration. If not, add it. This ensures the httpOnly cookie is sent with every tRPC request.

### 1.5 Server-Side Compatibility

**No server changes needed.** The server already accepts both Bearer tokens and session cookies (context.ts lines 27-41). Removing the Bearer token from browser requests just means the cookie path is always used.

### 1.6 Error Handling

- If `verifyToken()` server ping fails (network error): treat as "not authenticated" → redirect to login
- If user has a valid httpOnly cookie but `getAuthToken()` returns null: this is expected — the user IS authenticated (cookie sent automatically), they just can't inspect the token client-side

---

## Phase 2: Encrypted API Key Storage

### 2.1 Database Schema

**File:** `apps/web/drizzle/schema.ts`

New table `userLlmApiKeys`:

```typescript
export const userLlmApiKeys = pgTable("user_llm_api_keys", {
  id: serial("id").primaryKey(),
  userId: integer("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  tenantId: varchar("tenantId", { length: 36 }),
  provider: varchar("provider", { length: 50 }).notNull(),
  apiKeyEncrypted: text("apiKeyEncrypted").notNull(),
  keyHint: varchar("keyHint", { length: 8 }),
  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updatedAt", { withTimezone: true }).defaultNow(),
}, (t) => [
  uniqueIndex("user_llm_api_keys_user_provider_idx").on(t.userId, t.provider),
  index("user_llm_api_keys_user_idx").on(t.userId),
]);
```

**Design rationale:**
- `apiKeyEncrypted`: AES-256-GCM via existing `crypto.ts` (format: `iv:authTag:ciphertext`)
- `keyHint`: Last 4 characters of the key, stored in plaintext for UI display ("...abcd")
- `userId + provider` unique constraint: one key per provider per user
- `tenantId`: Optional, for multi-tenant isolation
- Follows existing pattern used by `llmProviders.apiKeyEncrypted`, `channelCredentials.credentialsEncrypted`, etc.

### 2.2 Service Layer

**New file:** `apps/web/server/services/userApiKeyService.ts`

Functions:

```typescript
async function setUserApiKey(userId: number, tenantId: string | null, provider: string, apiKey: string): Promise<{ provider: string; keyHint: string }>
```
- Encrypt `apiKey` with `encrypt()` from `crypto.ts`
- Extract last 4 chars as `keyHint`
- Upsert into `userLlmApiKeys` (unique on userId + provider)
- Return `{ provider, keyHint }` — never return the encrypted or decrypted key

```typescript
async function getUserApiKeys(userId: number): Promise<Array<{ provider: string; keyHint: string | null }>>
```
- Query all keys for user
- Return only `{ provider, keyHint }` — never decrypt

```typescript
async function deleteUserApiKey(userId: number, provider: string): Promise<void>
```
- Delete the row matching userId + provider

```typescript
async function decryptUserApiKey(userId: number, provider: string): Promise<string | null>
```
- Internal use only — called by LLM router when user opts to use their own key
- Returns decrypted key or null if not found
- **Never exposed via tRPC** — only called server-side

### 2.3 tRPC Router

**New file:** `apps/web/server/routers/userApiKeys.ts`

Three procedures, all `protectedProcedure`:

1. **`setKey`** — mutation
   - Input: `{ provider: z.enum(["openai", "anthropic", "deepseek", "google", "openrouter"]), apiKey: z.string().min(1).max(500) }`
   - Calls `setUserApiKey()` with `ctx.user!.id` and `ctx.tenantId`
   - Returns `{ provider, keyHint, configured: true }`

2. **`listKeys`** — query
   - No input
   - Calls `getUserApiKeys()` with `ctx.user!.id`
   - Returns `[{ provider, keyHint, configured: true }]`

3. **`deleteKey`** — mutation
   - Input: `{ provider: z.enum([...]) }`
   - Calls `deleteUserApiKey()` with `ctx.user!.id` and input.provider
   - Returns `{ success: true }`

**Security rules:**
- Never return decrypted keys in any response
- Rate-limit `setKey` (10 per hour per user)
- Log key operations to audit log (provider + userId, not the key value)

### 2.4 Register Router

**File:** `apps/web/server/routers.ts` (or wherever routers are merged)

Add `userApiKeys` to the tRPC router merge.

### 2.5 Frontend Changes

#### UserAPIKeysPanel.tsx
**File:** `apps/web/client/src/components/settings/UserAPIKeysPanel.tsx`

Replace sessionStorage calls with tRPC:
- "Save key" button → `trpc.userApiKeys.setKey.mutate({ provider, apiKey })`
- Key list → `trpc.userApiKeys.listKeys.useQuery()`
- "Delete key" button → `trpc.userApiKeys.deleteKey.mutate({ provider })`
- Display `keyHint` (e.g., "sk-...abcd") instead of masked sessionStorage value

#### authService.ts — Remove API Key Functions
- Remove `setApiKey()`, `getApiKey()`, `deleteApiKey()`, `listStoredApiKeys()`, `hasApiKey()`
- Remove all `sessionStorage` references for API keys
- Keep Tauri-specific API key functions if they're separate (they use native secure store)

### 2.6 LLM Router Integration

**File:** `apps/web/server/services/llmRouter.ts`

When the user-key feature is activated:
1. Check if the request includes `useUserKey: true` (or a feature flag)
2. Call `decryptUserApiKey(userId, provider)` to get the user's key
3. If found, use it instead of the admin-configured provider key
4. If not found, fall back to admin key (existing behavior)

This integration is additive — it doesn't change existing behavior until explicitly enabled.

### 2.7 Migration Strategy

Since user API keys in sessionStorage are **not active in production** (per interview), there is no data to migrate. The migration is clean:
1. Deploy Phase 2 code
2. Users who had keys in sessionStorage lose them (acceptable — feature wasn't active)
3. Users configure keys fresh via the new encrypted UI

---

## File Change Summary

### Phase 1 (3-4 files)
| File | Change Type | Description |
|------|------------|-------------|
| `apps/web/client/src/services/authService.ts` | Modify | Remove localStorage fallback for browser, keep Tauri path |
| `apps/web/client/src/App.tsx` | Modify | Add startup cleanup of legacy localStorage keys |
| `apps/web/client/src/lib/trpc.ts` | Verify | Ensure `credentials: 'include'` is set |
| New test file | Create | Tests for browser vs Tauri auth paths |

### Phase 2 (7-8 files)
| File | Change Type | Description |
|------|------------|-------------|
| `apps/web/drizzle/schema.ts` | Modify | Add `userLlmApiKeys` table |
| Migration SQL | Create | Generated by `drizzle-kit generate` |
| `apps/web/server/services/userApiKeyService.ts` | Create | CRUD + decrypt functions |
| `apps/web/server/routers/userApiKeys.ts` | Create | tRPC router with 3 procedures |
| `apps/web/server/routers.ts` | Modify | Register new router |
| `apps/web/client/src/services/authService.ts` | Modify | Remove sessionStorage API key functions |
| `apps/web/client/src/components/settings/UserAPIKeysPanel.tsx` | Modify | Use tRPC instead of sessionStorage |
| New test files | Create | Service + router tests |

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| Tauri app breaks after Phase 1 | Low | High | hasTauri() branching unchanged; only browser path modified |
| Users lose active sessions after Phase 1 | Expected | Low | Re-login is acceptable (per interview) |
| Encryption key mismatch | Low | Critical | Uses same LLM_ENCRYPTION_KEY as all other encrypted fields |
| sessionStorage keys lost | Expected | None | Feature not active in production |
| tRPC client doesn't send cookies | Low | High | Verify `credentials: 'include'` in trpc setup |
