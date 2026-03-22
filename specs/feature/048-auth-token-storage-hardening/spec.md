# Feature 048: Auth Token Storage Hardening

## Problem Statement

SmartSpecPro has two security vulnerabilities in its client-side credential storage:

1. **FE01 — JWT in localStorage (CRITICAL):** The auth token is stored in `localStorage` (`smartspec_auth_token`) as a fallback when not running in Tauri. Any XSS vulnerability on any page grants full session theft with no expiry. While the primary auth mechanism is already httpOnly session cookies (`app_session_id`), the localStorage fallback is still present and creates unnecessary attack surface.

2. **FE07 — LLM API keys in sessionStorage (HIGH):** User-provided third-party API keys (OpenAI, Anthropic, DeepSeek, Google, OpenRouter) are stored in `sessionStorage` (`smartspec_apikey_*`). Any XSS payload can steal all API keys. There is an existing TODO at `authService.ts:272` acknowledging this issue.

## Current Architecture

### Auth Flow (Already Secure for Web)
```
Login → Create HS256 JWT → Set httpOnly cookie (app_session_id) → Browser auto-sends
→ Server verifies via sdk.authenticateRequest() → Database lookup → User context
```

The httpOnly cookie path is **already production-ready**:
- Cookie: `app_session_id`, httpOnly=true, secure=HTTPS, sameSite="none"/"lax"
- Duration: 30 days (login), 365 days (OAuth)
- Server verifies via `jose.jwtVerify()` with HS256

### localStorage JWT (Tauri Fallback Only)
- `authService.ts` has a `hasTauri()` branching pattern
- Every auth function: try Tauri secure store → fall back to localStorage
- Functions affected: `getAuthToken()`, `setAuthToken()`, `getUser()`, `setUser()`, `logout()`
- The fetch interceptor (`setupAuthInterceptor`) sends Bearer token from localStorage on 401

### sessionStorage API Keys
- Keys: `smartspec_apikey_{openrouter|openai|anthropic|deepseek|google}`
- Set via `setProviderApiKey()`, read via `getProviderApiKey()`
- Used by chat UI to let users provide their own LLM API keys
- TODO at line 272: "Move to encrypted server-side storage"

## Scope & Constraints

### In Scope
- Remove localStorage JWT fallback for browser context
- Preserve Tauri secure store integration for desktop app
- Migrate LLM API keys from sessionStorage to server-side encrypted storage
- Create encrypted DB table for user API keys
- Add tRPC endpoints for key CRUD
- Update frontend to use server-side key storage
- Clean up legacy localStorage keys on logout

### Out of Scope
- Changing the httpOnly cookie mechanism (already secure)
- Implementing token rotation or refresh tokens
- Changing JWT algorithm (HS256 is fine for same-server verification)
- Tauri secure store internals

## Technical Design

### Phase 1: Remove localStorage JWT Fallback (Browser)

**Key insight:** The browser auth already works via httpOnly cookies. The localStorage JWT fallback is only needed for Tauri. For browser context, we can simply remove it.

#### Changes to `authService.ts`:

1. **`getAuthToken()`** — In browser (non-Tauri) context, return `null` instead of reading localStorage. The httpOnly cookie is sent automatically by the browser; the client never needs to access the token directly.

2. **`setAuthToken()`** — In browser context, this becomes a no-op. The server sets the httpOnly cookie via `Set-Cookie` response header.

3. **`getUser()` / `setUser()`** — Continue using localStorage for cached user data (non-sensitive: name, email, role). This is a performance optimization, not a security concern. The user object does NOT contain secrets.

4. **`setupAuthInterceptor()`** — Remove the Bearer token injection. In browser context, the httpOnly cookie is sent automatically. The interceptor only needs to handle 401 → logout.

5. **`isTokenExpired()`** — In browser context, this cannot work (no access to httpOnly cookie). Replace with a server ping: `GET /auth/me` with `credentials: 'include'`.

6. **`verifyToken()`** — Already calls `/auth/me` with Bearer header. In browser context, change to `credentials: 'include'` (cookie-based) instead of Bearer header.

7. **Cleanup legacy keys** — On app startup, if running in browser, clear all legacy localStorage keys:
   - `smartspec_auth_token`
   - `smartspec_web_refresh_token`
   - `smartspec_web_token_expiry`
   - `smartspec_web_user`

#### Tauri path (preserved):
- `hasTauri()` branch continues to use Tauri secure store via `safeInvoke()`
- Falls back to localStorage ONLY in Tauri context (not browser)
- Tauri desktop app needs Bearer token because it cannot use cookies across the Tauri webview boundary

### Phase 2: Migrate API Keys to Server-Side Encrypted Storage

#### New Database Table

```sql
CREATE TABLE user_llm_api_keys (
  id SERIAL PRIMARY KEY,
  "userId" INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  "tenantId" VARCHAR(36),
  provider VARCHAR(50) NOT NULL,          -- 'openai', 'anthropic', 'deepseek', 'google', 'openrouter'
  "apiKeyEncrypted" TEXT NOT NULL,        -- AES-256-GCM via crypto.ts
  "keyHint" VARCHAR(8),                   -- Last 4 chars for display (e.g., "...abcd")
  "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE("userId", provider)
);
```

#### Drizzle Schema

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
]);
```

#### tRPC Endpoints (`routers/userApiKeys.ts`)

```typescript
// Save or update a user's API key for a provider
setKey: protectedProcedure
  .input(z.object({
    provider: z.enum(["openai", "anthropic", "deepseek", "google", "openrouter"]),
    apiKey: z.string().min(1).max(500),
  }))
  .mutation(async ({ input, ctx }) => {
    // Encrypt with crypto.ts AES-256-GCM
    // Upsert into userLlmApiKeys
    // Return { provider, keyHint, configured: true }
  }),

// Get configured providers (never return the actual key)
listKeys: protectedProcedure
  .query(async ({ ctx }) => {
    // Return [{ provider, keyHint, configured: true }]
  }),

// Delete a key
deleteKey: protectedProcedure
  .input(z.object({
    provider: z.enum(["openai", "anthropic", "deepseek", "google", "openrouter"]),
  }))
  .mutation(async ({ ctx }) => {
    // Delete from userLlmApiKeys
  }),
```

**Security rules:**
- NEVER return decrypted keys in API responses
- Only return `{ configured: true/false, keyHint: "...abcd" }`
- Decrypt server-side only when making LLM API calls
- Log key access events (provider, userId, timestamp) but NEVER log the key value

#### Frontend Changes

1. **`UserAPIKeysPanel.tsx`** — Replace sessionStorage calls with tRPC mutations:
   - `setProviderApiKey(provider, key)` → `trpc.userApiKeys.setKey.mutate({ provider, apiKey })`
   - `getProviderApiKey(provider)` → Not needed (server decrypts when calling LLM)
   - Display `keyHint` instead of masked key from sessionStorage

2. **`authService.ts`** — Remove `setProviderApiKey()`, `getProviderApiKey()`, and all `sessionStorage` references for API keys.

3. **LLM call path** — Currently, the frontend may pass API keys to the server. After migration:
   - Frontend sends `{ provider: "openai", useUserKey: true }` in the request
   - Server looks up the user's encrypted key, decrypts, and uses it for the API call
   - Key never leaves the server

#### Migration Path

On first load after deployment:
1. Check if any `smartspec_apikey_*` keys exist in sessionStorage
2. If yes, offer to migrate them to server-side storage via `setKey` mutation
3. After successful migration, clear sessionStorage keys
4. Show confirmation toast

## Risk Assessment

| Change | Risk | Mitigation |
|--------|------|-----------|
| Remove localStorage JWT (browser) | LOW — httpOnly cookie already works | Feature-flag: `DISABLE_LOCALSTORAGE_JWT=true` |
| Preserve Tauri path | LOW — no changes to Tauri flow | Test desktop app separately |
| New DB table | MEDIUM — schema change | Follow Database Safety Protocol |
| API key encryption | LOW — uses existing crypto.ts | Same encryption as all other secrets |
| sessionStorage migration | MEDIUM — users lose keys if migration fails | Keep sessionStorage as read-only fallback for 1 release |

## Verification Plan

### Phase 1 Tests
- [ ] Browser login works with only httpOnly cookies (no localStorage)
- [ ] Browser logout clears all legacy keys
- [ ] `getAuthToken()` returns null in browser context
- [ ] 401 interceptor still triggers logout
- [ ] Tauri login/logout still works via secure store
- [ ] No auth token visible in `window.localStorage` after login (browser)

### Phase 2 Tests
- [ ] `setKey` encrypts and stores in DB
- [ ] `listKeys` returns hints, never actual keys
- [ ] `deleteKey` removes from DB
- [ ] LLM calls use server-decrypted user keys
- [ ] Migration from sessionStorage works
- [ ] sessionStorage cleared after migration
- [ ] XSS simulation: no API keys accessible from `document.cookie`, `localStorage`, or `sessionStorage`

## Files Affected

### Phase 1 (6 files)
- `apps/web/client/src/services/authService.ts` — Main changes
- `apps/web/client/src/hooks/useAuth.ts` — May need adjustments for token check
- `apps/web/client/src/_core/hooks/useAuth.ts` — Alternative auth hook location
- `apps/web/client/src/App.tsx` — Startup cleanup of legacy keys
- `apps/web/server/_core/context.ts` — Verify cookie-only path works
- Tests for auth flows

### Phase 2 (8+ files)
- `apps/web/drizzle/schema.ts` — New table
- `apps/web/server/routers/userApiKeys.ts` — New router
- `apps/web/server/services/userApiKeyService.ts` — New service
- `apps/web/client/src/services/authService.ts` — Remove sessionStorage
- `apps/web/client/src/components/settings/UserAPIKeysPanel.tsx` — UI changes
- `apps/web/server/services/llmRouter.ts` — Use server-side keys
- `apps/web/server/_core/llmRoutes.ts` — Use server-side keys
- Migration files + tests

## Dependencies

- `crypto.ts` (AES-256-GCM) — already exists, used for all encrypted storage
- `LLM_ENCRYPTION_KEY` env var — already configured
- Database migration infrastructure (Drizzle) — already in place

## Estimated Complexity

- **Phase 1:** Small-medium (3-5 files, mostly simplification/removal)
- **Phase 2:** Medium (new table, new router, frontend updates, LLM call path changes)
- **Total:** Medium — 2 phases, can be shipped independently
