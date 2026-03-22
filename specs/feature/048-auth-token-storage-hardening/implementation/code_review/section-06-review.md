# Section 06 Review — API Key tRPC Router
# Feature 048: Auth Token Storage Hardening

**Reviewer:** SSP Reviewer Agent (CMD-8)
**Date:** 2026-03-19
**Branch:** `codex/feature-044-multimodal-chat-memory` (section-06 commits)
**Files reviewed:**
- `apps/web/server/routers/userApiKeys.ts` (new, 68 lines)
- `apps/web/server/routers/__tests__/userApiKeys.test.ts` (new, 215 lines)
- `apps/web/server/routers.ts` (modified — import + registration)

**Section-05 prerequisite check:** The two MEDIUM issues flagged as "blocking for section-06"
in the section-05 review are confirmed fixed in the current `userApiKeyService.ts`:
- Short-key guard is present at line 16–18: `if (!apiKey || apiKey.length < 4) throw new Error(...)`.
- DB-not-initialized guards are present in all four service functions (lines 21, 53, 73, 96).

Section-06 builds on a correct, hardened service layer.

---

## Summary

The router implementation is a faithful, precise match for the section plan. All three
procedures (`setKey`, `listKeys`, `deleteKey`) are present with the exact signatures,
rate limiting, and response shapes specified. The `providerEnum` allowlist correctly
prevents arbitrary provider strings from reaching the database. The `setKey` response
deliberately excludes the raw `apiKey`. Rate limiting composition is correct and reuses
the same `createRateLimitMiddleware` pattern established elsewhere in the codebase.
Registration in `routers.ts` is correct and placed adjacent to the existing `apiKeys`
router entry as the plan specifies.

One MEDIUM issue requires a fix before this section is merged: the test suite does not
use the `appRouter.createCaller(ctx)` pattern required by the plan and by the project's
canonical testing approach (see `gallery.test.ts`). Instead it calls the mocked service
functions directly. This means the three critical auth-gating tests (unauthenticated
context → UNAUTHORIZED) required by the plan are entirely absent — the actual
`protectedProcedure` guard is never exercised by any test in this file. Additionally,
the rate-limit middleware mock is wired but never actually invoked through a procedure
call, making the rate-limit mock coverage illusory.

A second MEDIUM issue: the `deleteKey` procedure has no rate limit, which is correct per
the plan and is not a gap. However, the test suite does not test that the
`user-api-key-set` namespace is used (not a generic one), meaning a future refactor that
changes the namespace would not be caught.

---

## Findings

| Severity | File:Line | Issue | Recommended Fix |
|---|---|---|---|
| MEDIUM | `userApiKeys.test.ts:139–143` | Tests do not use `appRouter.createCaller(ctx)`. The plan (section-06, "Mock strategy") explicitly requires the `appRouter.createCaller(ctx)` pattern and states "For auth tests, call with unauthenticated context and assert the call throws a `TRPCError` with code `UNAUTHORIZED`." The current tests call the mocked service functions directly (`await setUserApiKey(1, "tenant-1", "openai", "sk-test...")`) — they bypass the tRPC stack entirely. This means `protectedProcedure` is never invoked by any test. If a developer accidentally changed `protectedProcedure` to `publicProcedure`, no test would catch the regression. | Rewrite the `describe("userApiKeys router — service delegation")` suite to use `appRouter.createCaller(ctx)` with a fully-typed context. Add `createUnauthenticatedContext()` (user: null) and call `await caller.userApiKeys.setKey(...)` to exercise the auth guard. Mirror the pattern at `apps/web/server/gallery.test.ts:26–60`. |
| MEDIUM | `userApiKeys.test.ts` (entire file — no unauthenticated tests) | Zero unauthenticated-context tests exist. The plan lists three required auth-gating tests: `setKey requires authentication`, `listKeys requires authentication`, `deleteKey requires authentication`. These are the highest-value tests in a security context — they prove the gate is locked. None are implemented. | Add the three UNAUTHORIZED tests using an unauthenticated caller context (user: null), consistent with the plan stubs at section-06 lines 31–33. |
| LOW | `userApiKeys.test.ts:253–301` | The input-validation tests (`providerEnum rejects invalid provider`, `apiKey rejects empty string`, etc.) instantiate fresh Zod schemas inline using `require("zod")` rather than testing the actual enum defined in `userApiKeys.ts`. The schema duplicated in the test (e.g., `z.enum(["openai","anthropic","deepseek","google","openrouter"])`) must be kept in sync manually with the router. If a provider is added or removed in the router, the test continues to pass silently without catching the drift. | Import the router's `providerEnum` schema and re-use it in tests, or (preferred) use the caller pattern and pass invalid provider strings to `caller.userApiKeys.setKey(...)` — tRPC will propagate the `BAD_REQUEST` ZodError automatically. |
| LOW | `userApiKeys.test.ts:304–317` | The `decryptUserApiKey is NOT imported in the router` test (line 305–308) imports the router module at runtime (`await import("../userApiKeys")`) and checks `expect(routerSource).not.toHaveProperty("decryptUserApiKey")`. This test is checking that the exported namespace of the module does not include a `decryptUserApiKey` property — which is trivially true because `decryptUserApiKey` is never imported into `userApiKeys.ts` in the first place, so the module namespace could never expose it. The test passes regardless of whether `decryptUserApiKey` is actually called internally (e.g., in a future inline lambda). A more meaningful test would assert that the tRPC caller has no procedure named `decryptKey` (i.e., `expect(Object.keys(userApiKeysRouter)).not.toContain("decryptKey")`). | Replace with: `expect(Object.keys(userApiKeysRouter)).not.toContain("decryptKey")`. This tests the actual tRPC procedure surface, not the module export namespace. |
| LOW | `userApiKeys.ts:376–383` | `listKeys` calls `getUserApiKeys(ctx.user.id)` without passing `tenantId`. The service signature is `getUserApiKeys(userId: number)` — by design, list scope is per-user, not per-tenant. This is consistent with the plan. However, the spec's multi-tenant rationale for `setKey` (which does pass `tenantId`) implies a user in multiple tenants could store keys scoped per-tenant. The current `listKeys` will return ALL keys for that `userId` across all tenants, which may leak the existence of keys from a different tenant context. | This is a design decision, not a defect. Flag as a known limitation: `getUserApiKeys` is intentionally user-scoped. If multi-tenant key isolation is required in a future section, the `listKeys` procedure and service must be updated to filter by `tenantId`. Add a comment to this effect in `listKeys`. |
| INFO | `routers.ts:9` | The diff also imports `inviteCodeRouter` and adds invite code logic to the `register` mutation. These changes are outside the scope of section-06 and appear to be from a separate feature. They have no impact on the `userApiKeys` router. | No action needed for section-06 review. The invite code changes should be reviewed independently. |

---

## Contract Compliance

| Check | Status | Notes |
|---|---|---|
| `userApiKeys.ts` file created at the correct path | PASS | `apps/web/server/routers/userApiKeys.ts` |
| `protectedProcedure` used for all three procedures | PASS | Lines 342, 376, 385 — all use `protectedProcedure` or `rateLimitedProtected` (which composes `protectedProcedure`) |
| `setKey` uses `rateLimitedProtected` (rate-limited) | PASS | `rateLimitedProtected` at line 351 |
| Rate limit config: namespace `"user-api-key-set"`, limit 10, windowMs 3_600_000 | PASS | Lines 343–348 match plan exactly |
| `listKeys` and `deleteKey` use base `protectedProcedure` (no rate limit) | PASS | Correct per plan |
| `providerEnum` restricts to exact 5 providers from plan | PASS | `openai`, `anthropic`, `deepseek`, `google`, `openrouter` — matches plan exactly |
| `setKey` input: `{ provider: providerEnum, apiKey: z.string().min(1).max(500) }` | PASS | Lines 353–356 |
| `setKey` resolves `tenantId` via `resolveTenantIdVarchar` | PASS | Lines 359–362 |
| `setKey` returns `{ provider, keyHint, configured: true }` — no raw key | PASS | Lines 369–373 |
| `listKeys` maps results to `{ provider, keyHint, configured: true }` | PASS | Lines 378–382 |
| `deleteKey` input: `{ provider: providerEnum }` | PASS | Line 386 |
| `deleteKey` returns `{ success: true }` | PASS | Line 389 |
| `decryptUserApiKey` NOT imported in router | PASS | Only `setUserApiKey`, `getUserApiKeys`, `deleteUserApiKey` imported (lines 328–331) |
| Import registered in `routers.ts` | PASS | Line 10 of diff |
| Registered as `userApiKeys: userApiKeysRouter` in `appRouter` | PASS | Line 93 of diff, adjacent to `apiKeys: apiKeysRouter` |
| Auth-gating tests (unauthenticated → UNAUTHORIZED) | FAIL | No unauthenticated context tests exist; plan requires 3 |
| Tests use `appRouter.createCaller(ctx)` pattern | FAIL | Direct service mock calls used instead |
| Input validation tested via caller (BAD_REQUEST propagation) | PARTIAL | Schemas tested inline, not through tRPC stack |

---

## Verdict

**NEEDS_CHANGES**

The router implementation itself is correct, secure, and a faithful match for the plan.
The `protectedProcedure` guard, rate limiting, provider allowlist, and response shaping
are all implemented as specified. The registration in `routers.ts` is correct.

The blocking gap is the test suite. The plan explicitly requires `appRouter.createCaller(ctx)`
with an unauthenticated context to verify auth gating, but no such tests exist. The tests
that do exist call mocked service functions directly and therefore prove nothing about the
tRPC middleware stack. The three highest-value tests in a security review — verifying that
unauthenticated callers receive `UNAUTHORIZED` — are entirely absent.

**Required before merge:**
1. Rewrite the service-delegation describe block to use `appRouter.createCaller(ctx)`.
2. Add the three missing auth-gating tests with `createUnauthenticatedContext()`.

**Can be addressed in a follow-up commit (non-blocking):**
3. Replace the inline `require("zod")` schema duplication in validation tests with caller-based `BAD_REQUEST` assertions.
4. Replace the `decryptUserApiKey` module-export test with a procedure-surface assertion.
5. Add a comment to `listKeys` documenting the intentional user-scoped (not tenant-scoped) query.
