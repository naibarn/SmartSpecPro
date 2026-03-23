# Section 07 — Internal API Update: Code Review

**Feature:** 058-agency-creator-intelligence-upgrade
**Section:** 07 — Internal API Update (`/api/internal/agency/create`)
**Reviewer:** SSP Reviewer Agent (CMD-8)
**Date:** 2026-03-24

---

## Review Report

### Verdict: APPROVE_WITH_FIXES

### Findings

| Severity | File:Line | Issue | Recommended Fix |
|---|---|---|---|
| HIGH | `_core/logger.ts:38` | `debugError` logs the full raw error object to `console.error` (line 38: `console.error(..., error)`). The `error` object may carry an `err.message` that embeds field values — e.g., a Postgres unique-violation message includes the conflicting slug value derived from agency `name`. The spec (F05) required a structured logger that limits the emitted content to 200 chars. `debugError` passes the entire error object unbounded. | Truncate before logging: `console.error(..., String(error?.message ?? "").slice(0, 200))` in `debugError`, or switch to the pattern the spec prescribes: `logger.error("internal_agency_create_failed", { error: String(err?.message ?? "").slice(0, 200) })`. |
| MEDIUM | `_core/index.ts:1071-1072` | `objective` and `sharedInstructions` are defaulted to empty string `""` at insert even when the caller passes `undefined` (no value supplied). The spec example also defaults to `""`, but the Drizzle schema column for both is `text` (nullable, no `notNull()`). Storing `""` instead of `NULL` for missing optional fields diverges from every other optional text column in the same insert (e.g., `description` at line 1070 inserts `null` when absent). This inconsistency will confuse consumers that distinguish "not provided" from "empty". | Use `objective: objective || null` (and same for `sharedInstructions`) to keep consistent with `description`, or explicitly document the empty-string sentinel convention. |
| MEDIUM | `server/__tests__/internalAgencyCreate.test.ts:166-197` | The "insert data mapping" describe block tests only pure JavaScript truncation arithmetic — it never imports or exercises the actual endpoint handler or Drizzle insert. The spec required integration-style tests confirming the field values are actually *saved to `agencies`*. The tests as written would pass even if the insert line was accidentally deleted. | Add a test that mounts the handler (or mocks `db.insert`) and asserts `objective` and `sharedInstructions` appear in the values passed to `tx.insert(agenciesTable)`. |
| MEDIUM | `server/__tests__/internalAgencyCreate.test.ts:190-197` | The error-response test (`"error response does not contain raw error message"`) only asserts that two hardcoded string literals are not substrings of each other. It does not exercise the catch block or assert the response body returned by the handler. This test is vacuous — it would pass whether or not the sanitisation fix was applied. | Replace with a handler-level test: inject an error during the insert, call the endpoint, and assert `res.body.error === "Internal server error"`. |
| LOW | `_core/index.ts:994` | The 400 validation-error response leaks Zod issue messages to the caller: `details: bodyParse.error.issues.map(i => i.message).join(", ")`. While this is an internal-only endpoint (protected by `__internalAuth`), the messages can include field values (e.g. `"String must contain at most 2000 character(s)"`). This was pre-existing and is not regressed by this section, but the fix opportunity was present. | Out of scope for this section; log to note for a follow-up hardening pass. |
| LOW | `_core/index.ts:1051` | `modelRequirements: a.modelRequirements ?? undefined` — using `?? undefined` is a no-op (the right-hand side of `??` only fires when the left is `null`/`undefined`, so the result is always `a.modelRequirements` or `undefined`). The expression is harmless but misleading. | Simplify to `modelRequirements: a.modelRequirements` for clarity. |
| LOW | `server/__tests__/internalAgencyCreate.test.ts` | The test file imports `z` from `"zod"` and re-declares the full schema locally (lines 11-59) rather than importing it from `_core/index.ts`. If the production schema changes (e.g., a new max length), the test will silently continue to pass against its own stale copy. | Export `agencyCreateSchema` from `_core/index.ts` (or a shared module) and import it in the test, so schema drift is caught automatically. |

---

### Contract Compliance

| Requirement | Status | Notes |
|---|---|---|
| `objective` added to Zod schema (max 2000) | PASS | Implemented at line 957. |
| `sharedInstructions` added to Zod schema (max 10000) | PASS | Implemented at line 958. |
| `modelRequirements` added to agent Zod schema | PASS | Implemented at lines 973-982. |
| `objective` passed to agencies INSERT | PASS | Line 1071. |
| `sharedInstructions` passed to agencies INSERT | PASS | Line 1072. |
| `modelRequirements` passed to agencyAgents INSERT | PASS | Line 1051, passed via `agentRows` into `tx.insert(agencyAgents)`. |
| Length enforcement at insert point (F08) | PASS | `.slice(0, 2000)` and `.slice(0, 10000)` applied. |
| `console.error` replaced with structured logger (F05) | CONDITIONAL | `debugError` is used, which stops raw error leaking to the HTTP response. However, `debugError` still passes the full error object to `console.error` internally — does not satisfy the spec's 200-char limit requirement. |
| Error response sanitized (generic message only) | PASS | `res.status(500).json({ error: "Internal server error" })` — raw `err.message` no longer returned to caller. |
| Drizzle schema columns exist for `objective`/`sharedInstructions` | PASS | Both columns are present in `agencies` table (`schema.ts` lines 4748-4749). |
| `modelRequirements` column exists in `agencyAgents` | PASS | `json("modelRequirements")` present at `schema.ts` line 4879. |
| Auth guard unchanged (internal token check) | PASS | No changes to the `__internalAuth` / tenant verification block. |
| Tenant isolation unchanged | PASS | `tenantId` resolution and cross-tenant guard are untouched. |

---

### Summary

The core correctness fix is sound: `objective`, `sharedInstructions`, and `modelRequirements` are now properly accepted by the Zod schema and passed through to the database inserts, resolving the CRITICAL stripping issue identified in the plan review. The error-response sanitisation correctly prevents raw database error messages from leaking to the caller.

Two issues require attention before merge. The HIGH finding is that `debugError` still passes the full error object to `console.error` unbounded — the spec's F05 requirement for a 200-char cap on logged error content is not fully satisfied. The most impactful MEDIUM finding is that the test suite does not actually exercise the handler; the "insert mapping" and "error response" tests are constant-value assertions that would pass even if the production fix was reverted. These tests give a false confidence signal and should be replaced with handler-level assertions before this section is considered complete.
