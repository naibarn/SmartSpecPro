# Section 05 Review — API Key Service Layer
# Feature 048: Auth Token Storage Hardening

**Reviewer:** SSP Reviewer Agent (CMD-8)
**Date:** 2026-03-19
**Branch:** `codex/feature-044-multimodal-chat-memory` (section-05 commits)
**Files reviewed:**
- `apps/web/server/services/userApiKeyService.ts` (new, 112 lines)
- `apps/web/server/services/__tests__/userApiKeyService.test.ts` (new, 239 lines)

**Section-04 prerequisite check:** The two blocking issues flagged in the section-04 review
(missing `.notNull()` on timestamps and missing `export type` declarations) are confirmed
fixed in the current `schema.ts` (lines 6638–6639 and 6645–6646). Section-05 builds on a
correct foundation.

---

## Summary

The implementation is a close, correct match for the section plan. All four functions are
present with the exact signatures specified. Encryption is correctly delegated to `crypto.ts`,
the `apiKeyEncrypted` column never appears in list or return values outside `decryptUserApiKey`,
and the `decryptUserApiKey` function carries the `INTERNAL ONLY` doc comment required by the
plan. The upsert pattern targets the correct unique index columns, and the test suite covers
every stub listed in the plan. There are no critical security defects.

Two issues require changes before merging: a short-key edge case in `setUserApiKey` that
produces a misleading `keyHint`, and missing `null`-guard in `decryptUserApiKey` when the
stored `apiKeyEncrypted` column value itself is `null` (which the schema allows, since
`keyHint` is nullable and the plan says `apiKeyEncrypted` is `NOT NULL`, but the Drizzle
inferred type still includes `null` for `apiKeyEncrypted` if the column definition were ever
relaxed — see finding below for the precise issue). One medium concern around DB-not-initialized
test coverage gap in three of the four functions is also flagged.

---

## Findings

| Severity | File:Line | Issue | Recommended Fix |
|---|---|---|---|
| MEDIUM | `userApiKeyService.ts:20` | `apiKey.slice(-4)` on a string shorter than 4 characters does not throw — it silently returns the entire string. If a caller passes `"abc"` (3 chars), `keyHint` is `"abc"` (3 chars). If a caller passes `""` (empty string), `keyHint` is `""` and `encrypt("")` will silently encrypt an empty value with no error. The router (section 06) is expected to validate input length via Zod, but the service has no independent guard, which means any future caller bypassing the router can store a zero-length or too-short key that passes the DB constraints (no minimum enforced on `apiKeyEncrypted text NOT NULL`) and produces a hint that is fewer than 4 characters without any indication that the key was invalid. | Add a minimum-length guard at the top of `setUserApiKey`: `if (!apiKey || apiKey.length < 4) throw new Error("API key must be at least 4 characters");`. Add a corresponding test: `it("throws when apiKey is shorter than 4 characters")`. |
| MEDIUM | `userApiKeyService.ts:47–57` | `getUserApiKeys` has no corresponding "throws when db is not initialized" test. The same `getDb() → null` guard is present in the implementation (line 50) and is tested for `setUserApiKey` (test line 120), but `getUserApiKeys`, `deleteUserApiKey`, and `decryptUserApiKey` have no parallel test. If a future refactor removes that guard from one function, the missing tests will not catch it. | Add `it("throws when db is not initialized")` tests for `getUserApiKeys`, `deleteUserApiKey`, and `decryptUserApiKey`, mirroring the pattern at test line 120. |
| MEDIUM | `userApiKeyService.ts:53` | `decryptUserApiKey` reads `rows[0].apiKeyEncrypted` (line 53 of the diff, `rows[0].apiKeyEncrypted`). The Drizzle inferred type for a `text("apiKeyEncrypted").notNull()` column is `string`, so TypeScript will not flag a null dereference here. However, the section plan (and section-04 review) noted that the `keyHint` column on the same table is nullable — meaning Drizzle's `$inferSelect` for `UserLlmApiKey` has `keyHint: string | null`. The `apiKeyEncrypted` column IS `.notNull()` in schema.ts so the inferred type is `string`, not `string | null`. This is fine AS LONG AS the section-04 schema fix (`.notNull()` on `apiKeyEncrypted`) is confirmed applied (it is). No code change needed, but this is a fragile dependency: if someone later makes `apiKeyEncrypted` nullable in the schema, `decrypt(null)` would crash with "Cannot read properties of null" rather than returning null. | Add a JSDoc or inline comment on `decryptUserApiKey` noting that it assumes `apiKeyEncrypted` is non-null by schema constraint. No code change required at this time. |
| LOW | `userApiKeyService.ts:32` | The `onConflictDoUpdate` target is `[userLlmApiKeys.userId, userLlmApiKeys.provider]`. This correctly matches the unique index `user_llm_api_keys_user_provider_idx` defined in schema.ts. However, Drizzle's `onConflictDoUpdate` uses column references, not the index name string, so if the unique index columns ever change (e.g., `tenantId` is added to the uniqueness constraint in a future section), the upsert will silently stop working (Postgres will throw a unique violation on the new constraint while the old one passes). This is acceptable for now but should be noted in the section-06 contract. | No immediate change required. Document in the section plan's "future considerations" that expanding the unique index to include `tenantId` requires updating the `onConflictDoUpdate` target. |
| LOW | `userApiKeyService.test.ts:103–112` | The "upserts — updates existing row" test (line 102 of the diff) is functionally identical to the "upserts — inserts new row" test at line 74. Both verify that `onConflictDoUpdate` is called; neither test distinguishes the insert vs. update path because the mock does not simulate a conflict. The test comment at line 103 acknowledges this (`// Same as above — the onConflictDoUpdate handles both cases`), which is honest, but it means the test suite does not verify that the upserted values on the update path (specifically the new `keyHint` and `updatedAt`) are what was set in the `set:` clause. | Strengthen the update test by asserting on the `set:` payload of `onConflictDoUpdate` with a different key value from the insert test (already done at line 95–98 for insert; add a parallel assertion in the update test at line 111). |
| LOW | `userApiKeyService.test.ts:136–161` | `getUserApiKeys` tests do not assert that `apiKeyEncrypted` is NOT present in the return value. The service intentionally limits the `select` to `{ provider, keyHint }` — this is the central security property of that function. A test like `expect(result[0]).not.toHaveProperty("apiKeyEncrypted")` would guard against a future regression where a developer adds `apiKeyEncrypted` to the select clause. | Add `expect(result[0]).not.toHaveProperty("apiKeyEncrypted")` to the "returns all providers for a user" test. |
| INFO | `userApiKeyService.ts:1–112` | The file has no export for the `UserLlmApiKey` or `InsertUserLlmApiKey` types (those live in `schema.ts` and are exported from there per section-04 fix). This is correct — the service should not re-export schema types. Confirmed the service imports the table reference `userLlmApiKeys` but not the inferred types, which is consistent with other services in the codebase. No action required. | None. |
| INFO | `userApiKeyService.ts:12` | The `tenantId` parameter in `setUserApiKey` is accepted and stored verbatim with no validation. The section plan documents this as intentional (nullable for single-tenant deployments). The section-04 schema review raised a concern about this column lacking an FK and using a camelCase DB column name — those issues remain unresolved at the schema level. The service correctly passes `tenantId` through without attempting to validate it, which is the right behavior given the schema. | No service-layer change needed. Resolution is tracked at the schema level (section-04 MEDIUM finding). |

---

## Contract Compliance

| Check | Status | Notes |
|---|---|---|
| All 4 functions present with exact signatures from plan | PASS | `setUserApiKey`, `getUserApiKeys`, `deleteUserApiKey`, `decryptUserApiKey` all present |
| `encrypt()` called before storing key | PASS | `userApiKeyService.ts:19` — `encrypt(apiKey)` before any DB write |
| `apiKeyEncrypted` never returned by `getUserApiKeys` | PASS | Select clause limited to `{ provider, keyHint }` (lines 52–55) |
| `apiKeyEncrypted` never returned by `setUserApiKey` | PASS | Returns `{ provider, keyHint }` only (line 40) |
| `decryptUserApiKey` has INTERNAL ONLY comment | PASS | JSDoc at line 43 of diff: "INTERNAL ONLY — never expose via tRPC or HTTP endpoint." |
| `decrypt()` return value of `""` mapped to `null` | PASS | `if (!decrypted) return null` at line 54 |
| Upsert targets correct unique index columns `(userId, provider)` | PASS | `target: [userLlmApiKeys.userId, userLlmApiKeys.provider]` matches `user_llm_api_keys_user_provider_idx` |
| `updatedAt: new Date()` set on upsert conflict path | PASS | `set: { ..., updatedAt: new Date() }` at line 36 |
| `getDb() → null` guard present in all 4 functions | PASS | Lines 11–12, 50–51, 65–66, 93–94 |
| `decryptUserApiKey` not imported by any router file | PASS | Grep confirms only `userApiKeyService.ts` and its test file reference this function |
| All named exports match plan spec | PASS | `export async function` on all four; no default export |
| Imports match plan spec (`eq`, `and`, `getDb`, `userLlmApiKeys`, `encrypt`, `decrypt`) | PASS | Lines 1–4 of diff |
| Test file mocks `crypto.ts` and `getDb` before service import | PASS | `vi.mock` calls at lines 10–22 of test diff, before service import at line 31 |
| All test stubs from plan are implemented (not left as empty `it(...)`) | PASS | All 11 stubs from the plan are fully implemented |
| `encrypt` called with `LLM_ENCRYPTION_KEY` (via `crypto.ts` — no key passed directly) | PASS | Service calls `encrypt(apiKey)` with no `envKeyOverride`; key sourcing is `crypto.ts`'s responsibility |
| No plaintext key in any return value or log statement | PASS | No `console.log`, no key in return shapes |

---

## Verdict

**PASS_WITH_NOTES**

The implementation is correct and secure. The two MEDIUM findings (short-key guard and
missing DB-not-initialized tests for 3 of 4 functions) should be fixed before section-06
builds on this service, because section-06 will wire `setUserApiKey` to a tRPC mutation
that relies on the service for input safety. The two LOW findings are quality improvements
that do not block section-06 but are recommended before the feature branch is merged to
`main`. No security defects were found.

**Blocking for section-06:** Address the MEDIUM findings before wiring the tRPC router.
**Non-blocking:** LOW and INFO findings can be addressed in a follow-up commit on this branch.
