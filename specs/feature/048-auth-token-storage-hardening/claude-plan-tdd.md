# Feature 048: Auth Token Storage Hardening — TDD Plan

Testing framework: **Vitest** (TypeScript/React), **pytest** (Python — not needed for this feature)
Test commands: `cd apps/web && pnpm test`

---

## Phase 1: Remove localStorage JWT Fallback

### 1.2 authService.ts Changes

**Test file:** `apps/web/client/src/services/__tests__/authService.test.ts`

```
# Test: getAuthToken() returns null in browser context (no Tauri)
# Test: getAuthToken() reads from Tauri secure store when hasTauri() is true
# Test: setAuthToken() is no-op in browser context
# Test: setAuthToken() writes to Tauri secure store when hasTauri() is true
# Test: getAuthTokenSync() returns null in browser context
# Test: isTokenExpired() makes server ping in browser context
# Test: isTokenExpired() returns true when server returns 401
# Test: isTokenExpired() returns false when server returns 200
# Test: isTokenExpired() returns true on network error
# Test: verifyToken() uses credentials:'include' in browser context
# Test: verifyToken() uses Bearer header in Tauri context
# Test: setupAuthInterceptor() does not inject Bearer token
# Test: setupAuthInterceptor() triggers logout on 401 response
# Test: setupAuthInterceptor() skips logout for /auth/login paths
# Test: logout() clears all legacy localStorage keys
# Test: logout() calls Tauri clear_all_credentials when available
```

Mock strategy:
- Mock `hasTauri()` to control Tauri vs browser branching
- Mock `fetch` for server ping tests
- Mock `localStorage` and `safeInvoke` for storage tests

### 1.3 Startup Cleanup

**Test file:** `apps/web/client/src/__tests__/legacyAuthCleanup.test.ts`

```
# Test: cleanup removes smartspec_auth_token from localStorage in browser
# Test: cleanup removes all 5 legacy keys from localStorage
# Test: cleanup does NOT run in Tauri context
# Test: cleanup is idempotent (safe to call multiple times)
# Test: cleanup does not affect other localStorage keys
```

### 1.4 tRPC Client

**Test file:** Verify in existing tRPC setup test or add assertion

```
# Test: tRPC httpLink includes credentials:'include'
```

---

## Phase 2: Encrypted API Key Storage

### 2.2 Service Layer

**Test file:** `apps/web/server/services/__tests__/userApiKeyService.test.ts`

```
# Test: setUserApiKey encrypts key with crypto.ts encrypt()
# Test: setUserApiKey extracts last 4 chars as keyHint
# Test: setUserApiKey upserts (update if exists, insert if new)
# Test: setUserApiKey returns { provider, keyHint } — never the encrypted value
# Test: getUserApiKeys returns all providers for user with hints only
# Test: getUserApiKeys returns empty array for user with no keys
# Test: deleteUserApiKey removes the correct provider entry
# Test: deleteUserApiKey is no-op for non-existent provider
# Test: decryptUserApiKey returns decrypted key for existing entry
# Test: decryptUserApiKey returns null for non-existent entry
# Test: decryptUserApiKey uses crypto.ts decrypt()
```

Mock strategy:
- Mock database (getDb) with in-memory test doubles
- Mock `encrypt()`/`decrypt()` from crypto.ts to verify they're called correctly

### 2.3 tRPC Router

**Test file:** `apps/web/server/routers/__tests__/userApiKeys.test.ts`

```
# Test: setKey requires authentication (returns 401 for unauthenticated)
# Test: setKey validates provider enum (rejects invalid provider)
# Test: setKey validates apiKey length (rejects empty)
# Test: setKey calls service.setUserApiKey with correct args
# Test: setKey returns { provider, keyHint, configured: true }
# Test: setKey does NOT return the apiKey in response
# Test: listKeys returns array of { provider, keyHint, configured }
# Test: listKeys returns empty array for user with no keys
# Test: deleteKey removes the key and returns { success: true }
# Test: deleteKey for non-existent provider still returns success
```

Mock strategy:
- Use `createCaller` pattern from existing router tests
- Mock userApiKeyService functions

### 2.5 Frontend — UserLlmKeysPanel

**Test file:** `apps/web/client/src/components/settings/__tests__/UserLlmKeysPanel.test.tsx`

```
# Test: renders list of configured providers from listKeys query
# Test: displays keyHint for configured providers
# Test: save button calls setKey mutation with provider and apiKey
# Test: delete button calls deleteKey mutation with provider
# Test: shows success toast after saving key
# Test: shows error toast on save failure
# Test: does NOT display raw API key values
# Test: input field clears after successful save
```

Mock strategy:
- Mock tRPC hooks (useQuery, useMutation)
- Use React Testing Library for component tests

### 2.1 Database Schema

```
# Test: migration creates user_llm_api_keys table
# Test: unique constraint on (userId, provider) prevents duplicates
# Test: cascade delete removes keys when user is deleted
```

Verification: Run `pnpm db:push` and check table exists with correct schema.
