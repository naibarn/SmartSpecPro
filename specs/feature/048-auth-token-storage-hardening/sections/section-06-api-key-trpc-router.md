# Section 06: API Key tRPC Router

## Overview

This section creates a new tRPC router at `apps/web/server/routers/userApiKeys.ts` that exposes three procedures -- `setKey`, `listKeys`, and `deleteKey` -- for managing user-provided LLM API keys. The router is then registered into the main `appRouter` in `apps/web/server/routers.ts`. All procedures require authentication (`protectedProcedure`), and the `setKey` mutation is rate-limited to prevent abuse. No procedure ever returns a decrypted API key.

## Dependencies

- **Section 04 (DB schema):** The `userLlmApiKeys` table must exist in the database before this router can function.
- **Section 05 (API key service):** The service functions `setUserApiKey`, `getUserApiKeys`, and `deleteUserApiKey` from `apps/web/server/services/userApiKeyService.ts` are called by the router procedures. This section assumes those functions exist with the signatures described below.

## Files to Create/Modify

| File | Action |
|------|--------|
| `apps/web/server/routers/userApiKeys.ts` | **Create** -- new tRPC router |
| `apps/web/server/routers.ts` | **Modify** -- import and register the new router |
| `apps/web/server/routers/__tests__/userApiKeys.test.ts` | **Create** -- router tests |

## Tests (Write First)

**Test file:** `apps/web/server/routers/__tests__/userApiKeys.test.ts`

The tests use the `appRouter.createCaller(ctx)` pattern established in the codebase (see `apps/web/server/gallery.test.ts` for the canonical example). The service layer is mocked so tests focus on the router's auth gating, input validation, and response shaping.

### Test stubs

```
describe("userApiKeys router", () => {

  // --- Auth gating ---
  # Test: setKey requires authentication (returns UNAUTHORIZED for unauthenticated context)
  # Test: listKeys requires authentication (returns UNAUTHORIZED for unauthenticated context)
  # Test: deleteKey requires authentication (returns UNAUTHORIZED for unauthenticated context)

  // --- Input validation ---
  # Test: setKey validates provider enum (rejects invalid provider string like "badprovider")
  # Test: setKey validates apiKey length (rejects empty string)
  # Test: setKey validates apiKey max length (rejects strings over 500 chars)

  // --- setKey behavior ---
  # Test: setKey calls service.setUserApiKey with correct args (ctx.user.id, tenantId, provider, apiKey)
  # Test: setKey returns { provider, keyHint, configured: true }
  # Test: setKey does NOT return the apiKey in its response

  // --- listKeys behavior ---
  # Test: listKeys returns array of { provider, keyHint, configured: true }
  # Test: listKeys returns empty array for user with no keys

  // --- deleteKey behavior ---
  # Test: deleteKey removes the key and returns { success: true }
  # Test: deleteKey for non-existent provider still returns { success: true }
})
```

### Mock strategy

- **Mock `userApiKeyService`:** Use `vi.mock("../../services/userApiKeyService")` to replace all exported functions with Vitest mocks. Configure return values per test.
- **Context factories:** Create `createUnauthenticatedContext()` (user: null) and `createAuthenticatedContext()` (user with id, role, tenantId) helper functions following the pattern in `apps/web/server/gallery.test.ts`.
- **Caller pattern:** `const caller = appRouter.createCaller(ctx)` then `await caller.userApiKeys.setKey(...)`.
- For auth tests, call with unauthenticated context and assert the call throws a `TRPCError` with code `"UNAUTHORIZED"`.
- For validation tests, call with authenticated context but invalid input and assert the call throws a `TRPCError` with code `"BAD_REQUEST"`.

### Context factory shape

The authenticated context needs these fields:

```typescript
{
  user: {
    id: 1,
    openId: "test-user",
    email: "user@example.com",
    name: "Test User",
    role: "user",
    // ... standard User fields
  },
  tenantId: "tenant-1",
  req: { ip: "127.0.0.1", headers: {}, cookies: {} },
  res: { clearCookie: vi.fn() },
  userToken: null,
  publicUrl: null,
}
```

## Implementation: Router File

**Create:** `apps/web/server/routers/userApiKeys.ts`

### Imports

The router imports:
- `z` from `"zod"` for input schemas
- `protectedProcedure`, `router` from `"../_core/trpc"`
- `createRateLimitMiddleware` from `"../_core/rateLimitedProcedure"`
- `setUserApiKey`, `getUserApiKeys`, `deleteUserApiKey` from `"../services/userApiKeyService"`
- `resolveTenantIdVarchar` from `"../services/tenantContext"` for multi-tenant support

### Provider enum

Define a shared Zod enum for the allowed LLM providers:

```typescript
const providerEnum = z.enum([
  "openai",
  "anthropic",
  "deepseek",
  "google",
  "openrouter",
]);
```

This is used in both `setKey` and `deleteKey` input schemas for type safety.

### Rate limiting on setKey

Create a rate-limited protected procedure for `setKey` by composing `protectedProcedure` with `createRateLimitMiddleware`. The rate limit should be 10 calls per hour per IP (namespace: `"user-api-key-set"`, limit: 10, windowMs: 3_600_000). This follows the same middleware composition pattern used by `rateLimitedAdminProcedure` in `apps/web/server/_core/trpc.ts`.

The composition is:

```typescript
const rateLimitedProtected = protectedProcedure.use(
  createRateLimitMiddleware({
    namespace: "user-api-key-set",
    limit: 10,
    windowMs: 3_600_000,
  })
);
```

### Procedures

**`setKey`** -- mutation using `rateLimitedProtected`:
- Input schema: `{ provider: providerEnum, apiKey: z.string().min(1).max(500) }`
- Resolve tenantId using `resolveTenantIdVarchar(ctx.tenantId, ctx.user.currentTenantId)`
- Call `setUserApiKey(ctx.user.id, tenantId, input.provider, input.apiKey)`
- Return `{ provider: result.provider, keyHint: result.keyHint, configured: true }`
- The raw `apiKey` from input must never appear in the return value

**`listKeys`** -- query using `protectedProcedure`:
- No input
- Call `getUserApiKeys(ctx.user.id)`
- Map each result to `{ provider, keyHint, configured: true }`
- Return the array

**`deleteKey`** -- mutation using `protectedProcedure`:
- Input schema: `{ provider: providerEnum }`
- Call `deleteUserApiKey(ctx.user.id, input.provider)`
- Return `{ success: true }`

### Export

Export as `export const userApiKeysRouter = router({ setKey, listKeys, deleteKey })`.

## Implementation: Router Registration

**Modify:** `apps/web/server/routers.ts`

Two changes are needed:

1. **Add import** near the other router imports (around line 80-88):
   ```typescript
   import { userApiKeysRouter } from "./routers/userApiKeys";
   ```

2. **Register in appRouter** -- add a new entry in the `appRouter` object. Place it near the existing `apiKeys: apiKeysRouter` line (around line 1800) for logical grouping:
   ```typescript
   userApiKeys: userApiKeysRouter,
   ```

This makes the router accessible as `trpc.userApiKeys.setKey`, `trpc.userApiKeys.listKeys`, and `trpc.userApiKeys.deleteKey` on the client side.

## Security Considerations

- All three procedures use `protectedProcedure`, which throws `UNAUTHORIZED` if `ctx.user` is null. Unauthenticated requests never reach the handler.
- The `setKey` mutation has an additional rate limit (10/hour/IP) to prevent brute-force key enumeration or abuse.
- No procedure ever returns a decrypted API key. The `listKeys` response contains only `provider` and `keyHint` (last 4 chars). The `setKey` response confirms success without echoing back the key.
- The `decryptUserApiKey` function from the service layer is deliberately NOT exposed through any tRPC procedure. It is only for internal server-side use (LLM router integration in a future section).
- Input validation via Zod enum restricts providers to an allowlist, preventing arbitrary strings from reaching the database.
- The `apiKey` input has a max length of 500 to prevent excessively large payloads.

## Verification Checklist

After implementation:

1. Run `cd /home/dev/projects/SmartSpecPro/apps/web && pnpm test -- routers/__tests__/userApiKeys` to confirm all router tests pass.
2. Run `cd /home/dev/projects/SmartSpecPro/apps/web && pnpm check` to confirm no TypeScript errors from the new router or registration.
3. Verify the router is accessible by checking that `appRouter` includes `userApiKeys` (the TypeScript compiler will enforce this if any frontend code references `trpc.userApiKeys`).

## Implementation Notes (Actual)

**Files created:**
- `apps/web/server/routers/userApiKeys.ts` (68 lines)
- `apps/web/server/routers/__tests__/userApiKeys.test.ts` (242 lines)

**Files modified:**
- `apps/web/server/routers.ts` — added import + registration as `userApiKeys: userApiKeysRouter`

**Deviations from plan:**
- Tests use `userApiKeysRouter.createCaller(ctx)` instead of `appRouter.createCaller(ctx)` — avoids pulling in all router dependencies while still exercising the tRPC middleware stack (protectedProcedure auth guard)
- Auth-gating tests match error message "Please login" (the actual requireUser middleware message) instead of "UNAUTHORIZED"
- Input validation tested through caller (BAD_REQUEST propagation) rather than inline Zod schema duplication

**Test count:** 14 tests — 3 auth gating, 4 input validation, 4 setKey/listKeys behavior, 2 deleteKey, 1 security assertion