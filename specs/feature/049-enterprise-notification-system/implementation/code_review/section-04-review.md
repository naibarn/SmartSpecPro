## Review Report

### Verdict: APPROVE_WITH_FIXES

---

### Findings

| Severity | File:Line | Issue | Recommended Fix |
|---|---|---|---|
| HIGH | `alertRules.test.ts:60082` | `checkAdmin` inline function excludes `domain_admin` from the allowed set, asserting `expect(checkAdmin("domain_admin")).toBe(false)`. The real `adminProcedure` in `_core/trpc.ts:84` explicitly allows `domain_admin`. The test validates a wrong policy and will give false confidence that domain admins are correctly blocked. | Remove the inline `checkAdmin` helper. Instead call the router through a test caller built with `domain_admin` role context and assert it does NOT throw `UNAUTHORIZED`. The test for `user` role should throw. |
| HIGH | `notificationPreferences.test.ts` | `snoozeCategory` — "rejects mutedUntil timestamps in the past" is listed in the plan (§1.2) and the implementation guards against it at runtime (`notificationPreferences.ts:60615`), but the test file contains no test case for this path. The guard exists but is entirely untested. | Add: `it("rejects mutedUntil timestamps in the past", async () => { ... })` calling `snoozeCategory` with `mutedUntil: new Date(Date.now() - 1000).toISOString()` and asserting a `BAD_REQUEST` TRPCError is thrown. |
| HIGH | `alertRules.test.ts` + `notificationPreferences.test.ts` | All tRPC router test cases are structural assertions (inline object filters, local Zod re-declarations) rather than calls through a real or mocked router caller. Auth guards (`adminProcedure`, `protectedProcedure`) and tenant isolation (`eq(alertRules.tenantId, ctx.tenantId)`) are never exercised. The tests cannot catch a regression where `adminProcedure` is replaced with `publicProcedure` or a tenant clause is dropped. | Use the chainable DB mock pattern documented in §8 (see `persona.test.ts`) with `appRouter.createCaller(ctx)`. At minimum, the three plan-required isolation tests (rules scoped to tenant, preferences scoped to user, auth gate) must call through the actual procedures. |
| MEDIUM | `alertRules.test.ts:60082` | "requires admin role" test is vacuous: it asserts a locally-defined boolean function, not the tRPC procedure. The same issue exists for `listRules`, `createRule`, `updateRule`, `deleteRule`, and all escalation policy admin checks. | Replace with caller-based tests that pass a non-admin context and assert `UNAUTHORIZED`. |
| MEDIUM | `alertRules.test.ts` | `updateRule` and `deleteRule` plan tests for "rejects update/delete for rule belonging to different tenant" are missing from the implementation. The router logic is correct but the test gap means a future regression in tenant scoping would not be caught. | Add tests that call `updateRule` / `deleteRule` with an `id` belonging to `tenant-2` from a `tenant-1` context and assert `NOT_FOUND`. |
| MEDIUM | `alertRules.test.ts` + `notificationPreferences.test.ts` | Plan §1.2 tests `upsertPreference` — "creates a new preference if none exists", "updates existing preference", and `snoozeCategory` — "sets mutedUntil to provided future timestamp" are all listed but none are implemented as real call-through tests. Only Zod shape tests exist. | Add upsert/snooze tests using a mocked DB caller that asserts the correct `onConflictDoUpdate` path is taken. |
| MEDIUM | `0104_mean_power_man.sql` | A second migration file exists as a no-op (`SELECT 1;`) with the comment "tenantId type already fixed in 0103". This implies there was an initial type mismatch that was corrected in-place in `0103` rather than in a separate patch. Leaving a no-op migration in the journal is harmless at runtime but creates journal noise and signals a messy iteration. This is a process issue, not a blocking bug, but it should be noted. | If the journal entry for `0104` can be safely removed before merge (i.e., no one has run it yet), remove both the SQL file and its journal entry. If it has already been applied to any environment, leave it and add a comment explaining its purpose. |
| LOW | `alertRules.ts:60362` | `updateEscalationPolicy` refine guard: `if (d.escalateToRole === null && d.escalateToUserId === null) return false` — this only rejects the case where both are explicitly set to `null`. If the client sends a partial update with neither field present (both `undefined`), the guard passes, which is correct for partial updates. However, if the stored row already has both set to null and the update contains `escalateToRole: null, escalateToUserId: null`, it is rightly blocked. This is defensible but slightly underdocumented. | Add an inline comment explaining why `undefined` is allowed (partial update semantics), to prevent future developers from "fixing" this by also blocking `undefined`. |
| LOW | `notificationPreferences.ts:60591` | `values as any` cast on the insert (and again on `set:`) suppresses TypeScript's type checking on the upsert payload. This hides potential mismatches between dynamically-built `values` object and the Drizzle insert type. | Type the `values` object as `InsertNotificationPreference` (imported from schema) and build it with typed keys, avoiding the need for `as any`. |
| LOW | `roomIntentRouter.ts` + tests | `roomIntentRouter.ts`, `roomIntentRouter.test.ts`, and `roomIntentRouter.enhanced.test.ts` are entirely out of scope for Section 04 (Phase 5 schema). They belong to Spec 051 (Team Room Chat Pipeline). Including them here conflates two features in a single section diff and makes the migration history harder to read. | These changes should be extracted into their own commit / section diff under Spec 051. They do not need to block this section. |

---

### Contract Compliance

| Check | Status | Notes |
|---|---|---|
| `protectedProcedure` on all user-facing preference procedures | PASS | `getPreferences`, `upsertPreference`, `snoozeCategory` all use `protectedProcedure` |
| `adminProcedure` on all alert rules and escalation policy procedures | PASS | All 8 procedures in `alertRulesRouter` use `adminProcedure` |
| Tenant isolation: every alert rules query scoped to `ctx.tenantId` | PASS | `eq(alertRules.tenantId, tenantId)` present in all 4 procedures; guard throws `BAD_REQUEST` when `tenantId` is null |
| Tenant isolation: every escalation policy query scoped to `ctx.tenantId` | PASS | Same pattern applied consistently |
| User isolation: preference queries scoped to `ctx.user.id` | PASS | `eq(notificationPreferences.userId, ctx.user.id)` in all 3 procedures |
| Operator allowlist (S7): `z.enum(["gt","lt","gte","lte","eq"])` | PASS | Enforced in `operatorSchema`, applied to `createRuleInput` and `updateRuleInput` |
| No `eval()` / string interpolation of operator | PASS | Router never evaluates operator values |
| Redis cache invalidation on preference upsert | PASS | `redis.del(notification:prefs:${userId}:${category})` called; error silently ignored (correct) |
| `onConflictDoUpdate` for `upsertPreference` | PASS | Targeting `[userId, category]` unique index; `set` payload excludes `userId`/`category` (only mutable fields) |
| `snoozeCategory` rejects past timestamps at runtime | PASS | Guard present in implementation |
| `snoozeCategory` rejects past timestamps in tests | FAIL | Test missing — see HIGH finding |
| `createEscalationPolicy` `.refine()` requires at least one target | PASS | `.refine((d) => d.escalateToRole || d.escalateToUserId)` present on create |
| `updateEscalationPolicy` `.refine()` handles partial update correctly | PASS | Only rejects when both are explicitly `null` |
| `NOTIFICATION_CATEGORIES` exported from `schema.ts` | PASS | Exported and imported by router and tests |
| Type exports: `NotificationPreference`, `AlertRule`, `EscalationPolicy` | PASS | All 6 type exports present |
| Router registration in `routers.ts` | PASS | Both routers imported and registered under correct keys |
| Migration sequence: `0103` follows prior `0102` prefix | PASS | `0103_calm_vermin.sql` is correct next sequence; snapshot `prevId` matches |
| FK types match referenced columns | PASS | `tenants.id` is `varchar(36)` — migration and schema both use `varchar(36)` (plan incorrectly said `integer`, implementation is correct) |
| `doublePrecision` imported for threshold column | PASS | Added to drizzle-orm/pg-core import |
| Plan §7 confirms no feature flags required in this section | PASS | No featureFlags.ts changes in diff |

---

### Summary

The three schema tables, all column definitions, indexes, FK constraints, and both routers are implemented correctly and match the plan. Operator injection (S7), tenant isolation, and user-scoping are all properly applied. The primary concern is test quality: all tRPC router tests are structural assertions against locally re-declared schemas rather than calls through the actual procedures, meaning the auth gates and tenant isolation clauses are never exercised. Two specific test cases required by the plan are missing (past-timestamp rejection for `snoozeCategory`; cross-tenant update/delete rejection for alert rules). The `domain_admin` RBAC assertion in the admin role test contradicts the real middleware. The out-of-scope `roomIntentRouter` changes bundled into this diff should be extracted to avoid conflation with Spec 051 work.
