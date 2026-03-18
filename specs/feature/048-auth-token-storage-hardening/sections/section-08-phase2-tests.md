# Section 08: Phase 2 Tests

## Overview

This section covers writing Vitest tests for all Phase 2 (Encrypted API Key Storage) components: the service layer (`userApiKeyService.ts`), the tRPC router (`userApiKeys.ts`), and the frontend panel (`UserLlmKeysPanel.tsx`). These tests verify encryption, CRUD operations, auth gating, input validation, and UI behavior.

**Phase:** Phase 2 -- Encrypted API Key Storage
**Dependencies:** Sections 05 (API Key Service), 06 (tRPC Router), 07 (Frontend Panel) must be implemented first.

---

## Test Files to Create

| File | Tests | Layer |
|------|-------|-------|
| `apps/web/server/services/__tests__/userApiKeyService.test.ts` | 11 tests | Service (encrypt/decrypt, CRUD) |
| `apps/web/server/routers/__tests__/userApiKeys.test.ts` | 10 tests | tRPC Router (auth, validation, delegation) |
| `apps/web/client/src/components/settings/__tests__/UserLlmKeysPanel.test.tsx` | 8 tests | Frontend (render, save, delete, display) |

---

## Test 1: Service Layer -- `userApiKeyService.test.ts`

**File:** `apps/web/server/services/__tests__/userApiKeyService.test.ts`

### Mock Strategy

- Mock `../../db` to provide a fake `getDb` returning chainable Drizzle query builders
- Mock `../crypto` to intercept `encrypt()` and `decrypt()` without needing a real encryption key. Mock `encrypt` returns `"encrypted::{input}"` and `decrypt` reverses it.
- Mock `../../../drizzle/schema` to provide the `userLlmApiKeys` table reference.

### Test Stubs

```
describe("userApiKeyService", () => {

  describe("setUserApiKey", () => {
    # Test: encrypts the API key using crypto.ts encrypt()
    # Test: extracts last 4 characters as keyHint
    # Test: upserts (inserts if new, updates if exists)
    # Test: returns { provider, keyHint } -- never the encrypted value
  })

  describe("getUserApiKeys", () => {
    # Test: returns all providers for user with hints only
    # Test: returns empty array for user with no keys
  })

  describe("deleteUserApiKey", () => {
    # Test: removes the correct provider entry
    # Test: is a no-op for non-existent provider (no error thrown)
  })

  describe("decryptUserApiKey", () => {
    # Test: returns decrypted key for existing entry
    # Test: returns null for non-existent entry
    # Test: calls crypto.ts decrypt() with the stored apiKeyEncrypted value
  })
})
```

### Mock Setup Pattern

Follow the existing pattern from `apps/web/server/services/__tests__/apiKeyService.test.ts`. Mocks must be declared with `vi.mock()` before any imports. Use `vi.mocked()` for typed mock access. Call `vi.clearAllMocks()` in `beforeEach`.

---

## Test 2: tRPC Router -- `userApiKeys.test.ts`

**File:** `apps/web/server/routers/__tests__/userApiKeys.test.ts`

### Mock Strategy

- Mock `../../services/userApiKeyService` to provide fake implementations of all service functions
- Use the `appRouter.createCaller(ctx)` pattern from existing tests
- Create `createUnauthenticatedContext()` and `createAuthenticatedContext()` helpers

### Test Stubs

```
describe("userApiKeys router", () => {

  describe("setKey", () => {
    # Test: requires authentication (unauthenticated context returns UNAUTHORIZED)
    # Test: validates provider enum (rejects invalid provider)
    # Test: validates apiKey length (rejects empty string)
    # Test: calls service.setUserApiKey with correct args
    # Test: returns { provider, keyHint, configured: true }
    # Test: does NOT return the apiKey in response
  })

  describe("listKeys", () => {
    # Test: returns array of { provider, keyHint, configured: true }
    # Test: returns empty array for user with no keys
  })

  describe("deleteKey", () => {
    # Test: removes the key and returns { success: true }
    # Test: non-existent provider still returns { success: true }
  })
})
```

---

## Test 3: Frontend Panel -- `UserLlmKeysPanel.test.tsx`

**File:** `apps/web/client/src/components/settings/__tests__/UserLlmKeysPanel.test.tsx`

### Environment Directive

```typescript
/**
 * @vitest-environment jsdom
 */
```

### Mock Strategy

- Mock tRPC hooks for `userApiKeys.listKeys.useQuery`, `userApiKeys.setKey.useMutation`, `userApiKeys.deleteKey.useMutation`
- Use `@testing-library/react` with `render`, `screen`, `fireEvent`/`userEvent`
- Wrap in `QueryClientProvider` with retry disabled
- Mock `sonner` toast for notification verification

### Test Stubs

```
describe("UserLlmKeysPanel", () => {
  # Test: renders list of configured providers from listKeys query
  # Test: displays keyHint for configured providers (e.g., "...abcd")
  # Test: save button calls setKey mutation with provider and apiKey
  # Test: delete button calls deleteKey mutation with provider
  # Test: shows success toast after saving key
  # Test: shows error toast on save failure
  # Test: does NOT display raw API key values in the DOM
  # Test: input field clears after successful save
})
```

---

## Running the Tests

```bash
cd /home/dev/projects/SmartSpecPro/apps/web && pnpm test
```

To run only Phase 2 test files:

```bash
cd /home/dev/projects/SmartSpecPro/apps/web && pnpm vitest run \
  server/services/__tests__/userApiKeyService.test.ts \
  server/routers/__tests__/userApiKeys.test.ts \
  client/src/components/settings/__tests__/UserLlmKeysPanel.test.tsx
```

---

## Verification Checklist

1. All 11 service layer tests pass (encrypt/decrypt delegation, CRUD behavior, return shapes)
2. All 10 router tests pass (auth gating, input validation, service delegation, response contracts)
3. All 8 frontend tests pass (rendering, mutations, toasts, no secret leakage, input clearing)
4. No test reads or writes real database rows -- all DB access is mocked
5. No test requires `LLM_ENCRYPTION_KEY` -- crypto functions are mocked
6. No test leaks API key values in assertions (use masked test values like `"sk-test1234abcd"`)
