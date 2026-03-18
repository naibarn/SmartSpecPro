# Section 05: API Key Service Layer

## Overview

This section creates `apps/web/server/services/userApiKeyService.ts`, a new service module that provides CRUD operations and decryption for user-provided LLM API keys. All keys are encrypted at rest using the existing AES-256-GCM encryption from `crypto.ts` (shared `LLM_ENCRYPTION_KEY`). The service is the sole interface between the tRPC router (section 06) and the `userLlmApiKeys` database table (section 04).

## Dependencies

- **Section 04 (DB Schema and Migration)** must be completed first. This section depends on the `userLlmApiKeys` table existing in `apps/web/drizzle/schema.ts` and the corresponding migration having been applied.
- The existing `apps/web/server/services/crypto.ts` module provides `encrypt()` and `decrypt()` functions (AES-256-GCM, format `iv:authTag:ciphertext`).
- The database is accessed via `getDb()` from `apps/web/server/db.ts`, which returns a lazy Drizzle ORM instance.

## Files to Create/Modify

| File | Action |
|------|--------|
| `apps/web/server/services/userApiKeyService.ts` | **Create** |
| `apps/web/server/services/__tests__/userApiKeyService.test.ts` | **Create** |

## Tests (Write First)

**Test file:** `apps/web/server/services/__tests__/userApiKeyService.test.ts`

The test suite mocks both the database layer (`getDb`) and the encryption module (`crypto.ts`) so that each service function can be tested in isolation without a live database or real encryption key.

### Mock Strategy

- Mock `apps/web/server/db.ts` so `getDb()` returns a fake Drizzle instance with controllable `select`, `insert`, `update`, and `delete` chain methods.
- Mock `apps/web/server/services/crypto.ts` so `encrypt()` returns a deterministic string (e.g., `"mock-encrypted"`) and `decrypt()` returns a known plaintext (e.g., `"sk-original-key"`). This lets tests verify the service calls encrypt/decrypt without needing `LLM_ENCRYPTION_KEY`.
- Import `userLlmApiKeys` from the schema to verify the service passes the correct table reference.

### Test Stubs

```typescript
// apps/web/server/services/__tests__/userApiKeyService.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock crypto.ts before importing the service
vi.mock("../crypto", () => ({
  encrypt: vi.fn((text: string) => `mock-encrypted:${text}`),
  decrypt: vi.fn((_encrypted: string) => "sk-original-key-abcd"),
}));

// Mock getDb
vi.mock("../../db", () => ({
  getDb: vi.fn(),
}));

describe("userApiKeyService", () => {
  describe("setUserApiKey", () => {
    it("encrypts the key using crypto.ts encrypt()");
    it("extracts the last 4 characters as keyHint");
    it("upserts — inserts new row when no existing key for user+provider");
    it("upserts — updates existing row when key already exists for user+provider");
    it("returns { provider, keyHint } and never returns the encrypted value");
  });

  describe("getUserApiKeys", () => {
    it("returns all providers for a user with keyHint only");
    it("returns an empty array when user has no keys");
  });

  describe("deleteUserApiKey", () => {
    it("deletes the row matching userId + provider");
    it("is a no-op (does not throw) when provider entry does not exist");
  });

  describe("decryptUserApiKey", () => {
    it("returns the decrypted key for an existing entry");
    it("returns null when no entry exists for user+provider");
    it("calls crypto.ts decrypt() with the stored apiKeyEncrypted value");
  });
});
```

Each test should:
1. Set up the mock database return values for the specific scenario.
2. Call the service function.
3. Assert the return value shape and content.
4. Assert that `encrypt()` or `decrypt()` was called with the expected arguments where applicable.
5. Assert that the correct Drizzle query builder methods were invoked (e.g., `insert().values()`, `select().from().where()`).

## Implementation Details

**New file:** `apps/web/server/services/userApiKeyService.ts`

### Function Signatures and Behavior

#### `setUserApiKey`

```typescript
async function setUserApiKey(
  userId: number,
  tenantId: string | null,
  provider: string,
  apiKey: string,
): Promise<{ provider: string; keyHint: string }>
```

Behavior:
1. Call `encrypt(apiKey)` from `crypto.ts` to produce the ciphertext.
2. Extract the last 4 characters of `apiKey` as `keyHint`.
3. Use Drizzle's `insert(...).values({...}).onConflictDoUpdate(...)` targeting the `user_llm_api_keys_user_provider_idx` unique index. The conflict update should set `apiKeyEncrypted`, `keyHint`, and `updatedAt` (to `new Date()`).
4. Return `{ provider, keyHint }`. Never include the encrypted or raw key in the return value.

The upsert pattern ensures that a user can call "save" repeatedly for the same provider without errors, and the most recent key always wins.

#### `getUserApiKeys`

```typescript
async function getUserApiKeys(
  userId: number,
): Promise<Array<{ provider: string; keyHint: string | null }>>
```

Behavior:
1. Select `provider` and `keyHint` columns from `userLlmApiKeys` where `userId` matches.
2. Never select `apiKeyEncrypted` -- the encrypted column must not leave this function.
3. Return the array of results. If no rows match, return `[]`.

#### `deleteUserApiKey`

```typescript
async function deleteUserApiKey(
  userId: number,
  provider: string,
): Promise<void>
```

Behavior:
1. Delete from `userLlmApiKeys` where `userId` and `provider` both match.
2. If no rows are affected (key did not exist), silently succeed -- no error thrown.

#### `decryptUserApiKey`

```typescript
async function decryptUserApiKey(
  userId: number,
  provider: string,
): Promise<string | null>
```

Behavior:
1. Select `apiKeyEncrypted` from `userLlmApiKeys` where `userId` and `provider` both match.
2. If no row found, return `null`.
3. Call `decrypt(row.apiKeyEncrypted)` from `crypto.ts`.
4. If `decrypt()` returns an empty string (decryption failure), return `null`.
5. Otherwise return the decrypted plaintext API key.

This function is **internal only** -- it is never exposed via tRPC. It will be called by `llmRouter.ts` (section 2.6 of the plan) when the user-key feature is activated.

### Exports

All four functions should be named exports:

```typescript
export {
  setUserApiKey,
  getUserApiKeys,
  deleteUserApiKey,
  decryptUserApiKey,
};
```

### Imports Required

The service file needs these imports:

- `encrypt`, `decrypt` from `./crypto`
- `getDb` from `../db`
- `userLlmApiKeys` from `../../drizzle/schema`
- `eq`, `and` from `drizzle-orm`

### Drizzle Query Patterns

The service follows the same query patterns used throughout the codebase. Key examples:

**Upsert (setUserApiKey):**
Use `db.insert(userLlmApiKeys).values({...}).onConflictDoUpdate({ target: [userLlmApiKeys.userId, userLlmApiKeys.provider], set: { apiKeyEncrypted, keyHint, updatedAt: new Date() } })`.

**Select specific columns (getUserApiKeys):**
Use `db.select({ provider: userLlmApiKeys.provider, keyHint: userLlmApiKeys.keyHint }).from(userLlmApiKeys).where(eq(userLlmApiKeys.userId, userId))`.

**Delete with compound condition (deleteUserApiKey):**
Use `db.delete(userLlmApiKeys).where(and(eq(userLlmApiKeys.userId, userId), eq(userLlmApiKeys.provider, provider)))`.

**Select single row for decrypt (decryptUserApiKey):**
Use `db.select({ apiKeyEncrypted: userLlmApiKeys.apiKeyEncrypted }).from(userLlmApiKeys).where(and(eq(userLlmApiKeys.userId, userId), eq(userLlmApiKeys.provider, provider))).limit(1)`. Check if the result array has length 0 before attempting decrypt.

### Security Considerations

- The `decryptUserApiKey` function must only be called server-side by other services (e.g., `llmRouter.ts`). It must never be wired to a tRPC procedure or HTTP endpoint.
- The `getUserApiKeys` function intentionally omits `apiKeyEncrypted` from the select clause so encrypted key material never travels to the router layer.
- The `keyHint` (last 4 chars) is the only key-derived value stored in plaintext. This is consistent with the existing pattern used by `apiKeys.keyPrefix` in `apiKeyService.ts`.
- All encryption uses the project-wide `LLM_ENCRYPTION_KEY` via `crypto.ts`, matching the pattern used by `llmProviders.apiKeyEncrypted`, `channelCredentials.credentialsEncrypted`, `webhookEndpoints`, and TOTP secrets.

### Error Handling

- If `getDb()` returns `null` (database not initialized), all functions should throw a descriptive error. This matches the existing convention -- `getDb()` returning null indicates a startup sequencing problem.
- If `encrypt()` throws (missing `LLM_ENCRYPTION_KEY`), let it propagate -- the caller (tRPC router) will catch it and return an appropriate error response.
- `decrypt()` never throws; it returns `""` on failure. The service maps this to `null` for a cleaner API.

## Verification

After implementation:

1. Run `cd /home/dev/projects/SmartSpecPro/apps/web && pnpm vitest run server/services/__tests__/userApiKeyService.test.ts` to verify all tests pass.
2. Run `cd /home/dev/projects/SmartSpecPro/apps/web && pnpm check` to verify no TypeScript errors were introduced.
3. Confirm that `decryptUserApiKey` is not imported by any router file yet (it will be used in a future LLM router integration, not in this section).

## Implementation Notes (Actual)

**Files created:**
- `apps/web/server/services/userApiKeyService.ts` (116 lines)
- `apps/web/server/services/__tests__/userApiKeyService.test.ts` (253 lines)

**Deviations from plan:**
- Added minimum length guard: `setUserApiKey` now throws if `apiKey.length < 4` (code review finding — prevents storing empty/short keys that bypass router validation)
- Added DB-not-initialized tests for all 4 functions (plan only had it for `setUserApiKey`)
- Added `apiKeyEncrypted` not-present assertion in `getUserApiKeys` test for security regression protection

**Test count:** 19 tests (plan had 11 stubs; 8 additional tests added for edge cases and DB guard coverage)