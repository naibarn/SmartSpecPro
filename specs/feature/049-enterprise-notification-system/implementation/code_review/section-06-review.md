# Section 06 Review — Phase 5: Escalation Job

## Review Report

### Verdict: APPROVE_WITH_FIXES

---

### Findings

| Severity | File:Line | Issue | Recommended Fix |
|---|---|---|---|
| HIGH | `escalationJob.ts:63-76` | Notification query has no `tenantId` scope — every enabled policy scans ALL tenants' notifications. A policy in tenant A will match and escalate notifications belonging to users in tenant B if their priority and timing align. | Add `eq(userNotifications.userId, /* scoped to tenant users */)` or join `users` on `currentTenantId = policy.tenantId`. Simplest safe fix: add an inner join to restrict `userNotifications` rows to users whose `currentTenantId` matches `policy.tenantId`. |
| HIGH | `escalationJob.ts:84-89` | Role-based target resolution (`escalateToRole`) queries ALL users with that role globally — no `currentTenantId = policy.tenantId` filter. A policy in tenant A configured to escalate to `"admin"` will send notifications to admins in every other tenant. | Add `eq(users.currentTenantId, /* tenantId integer from policy */)`. Note: `policy.tenantId` is a `varchar(36)` but `users.currentTenantId` is `integer` — a cast or lookup is required. |
| HIGH | `escalationJob.ts:25-27` | Feature flag reads `process.env.NOTIFICATION_ESCALATION_ENABLED` directly, bypassing `featureFlags.ts`. The spec states the flag is `notificationEscalationEnabled` (added in section-13) and must be in `TenantFeatureFlags` for per-tenant toggle and audit trail. The current implementation is a global server-side env var with no per-tenant control. | This is a known section-13 dependency. The implementation must document this gap clearly in code and treat the env-var check as a temporary bootstrap only. However, the naming divergence is a contract mismatch: the spec names the flag `notificationEscalationEnabled`; the env var is `NOTIFICATION_ESCALATION_ENABLED`. Align the name now or the section-13 wire-up will be ambiguous. |
| MEDIUM | `escalationJob.ts:138-146` | `metadata` update runs unconditionally even when `targetUserIds` is empty (policy has neither `escalateToUserId` nor `escalateToRole`). This marks the original notification as `escalatedAt` without actually escalating it to anyone, hiding the misconfiguration and making the notification permanently immune from future escalation attempts. | Guard the metadata update: `if (targetUserIds.length > 0) { await db.update(...) }`. Also add a warning log when `targetUserIds` is empty. |
| MEDIUM | `escalationJob.ts:142-145` | `JSON.stringify({ escalatedAt: ..., escalatedTo: ... })` interpolated inline in a Drizzle `sql` template tag produces a raw JSON string literal in the query. This pattern is vulnerable to SQL injection if any key or value contains `'` or `::` characters. The current values are all server-constructed (no user input), but the pattern is fragile. | Use a parameterized Drizzle `sql` binding: `sql`${JSON.stringify({...})}::jsonb`` — but the safer pattern is to pass the JSON as a Drizzle cast: `sql`${db.cast(JSON.stringify({...}), 'jsonb')}`` or use the existing `sql` cast that is already present but verify the string is safely escaped. At minimum, wrap the value in `sql`${sql.param(JSON.stringify({...}))}::jsonb``. |
| MEDIUM | `escalationJob.test.ts:231-249` | The "marks original notification metadata" test only asserts `db.update` was called — it does not verify which notification ID was updated, what the `set` payload contained, or that `escalatedAt`/`escalatedTo` appear in the updated value. The test gives no regression protection for the metadata update contract. | Assert `db.update(...).set.mock.calls[0]` contains `escalatedAt` and that `.where` was called with `eq(userNotifications.id, 10)`. |
| MEDIUM | `escalationJob.test.ts:175-200` | The two "skips already-escalated" tests (lines 175 and 189) are vacuous: they both set `notifications: []` in the mock, making it impossible to distinguish whether the SQL `WHERE` clause is correctly filtering out escalated notifications or whether the mock is simply returning nothing. The tests pass regardless of whether the SQL conditions exist in the implementation. | Provide a notification row with `metadata: { isEscalated: true }` or `metadata: { escalatedAt: "2026-01-01T00:00:00Z" }` in the mock, and verify that `createNotification` is not called. This actually exercises the application-layer guard (if any) rather than trusting the SQL mock. |
| LOW | `escalationJob.ts:397` (spec ref) | The spec requires `logger.info(...)` from the structured logger for `notification_escalated`, `escalation_job_completed`, and `escalation_job_skipped` events. The implementation uses `console.log` and `console.error` throughout. All other jobs and services in this codebase use the structured logger (`import { logger } from "..."`). | Replace `console.log`/`console.error` with the project's structured logger. |
| LOW | `escalationJob.ts:22-23` | Module-level mutable singletons `escalationQueue` and `escalationWorker` are not reset in `shutdownEscalationJob()` if an exception is thrown during `escalationWorker.close()`. If shutdown fails midway, `escalationWorker` remains non-null but the underlying connection may be broken, and a subsequent `initializeEscalationJob()` call would skip re-initialization. | Use a `finally` block or reset to `null` before calling `close()`. |
| LOW | `notificationJobs.ts:26-30` | `shutdownNotificationJobs()` calls `shutdownEscalationJob()` without a try/catch. A shutdown error in one job will prevent subsequent shutdown functions from being called when more jobs are added in sections 10 and 12. | Wrap each shutdown call in try/catch, mirroring the init pattern. |

---

### Contract Compliance

| Check | Status | Notes |
|---|---|---|
| `executeEscalationCheck()` exported for direct testing | PASS | Correctly exported separately from BullMQ wiring |
| `initializeEscalationJob()` idempotent | PASS | Module-level null guard on `escalationQueue` prevents double-init |
| `shutdownEscalationJob()` exported and wired | PASS | Correctly called by `shutdownNotificationJobs()` |
| BullMQ queue name `"notification-escalation"` | PASS | Matches spec exactly |
| BullMQ repeat interval `5 * 60 * 1000` ms | PASS | Correct |
| Worker concurrency: 1 | PASS | Correct |
| `removeOnComplete: { count: 100 }` | PASS | Correct |
| `removeOnFail: { count: 50 }` | PASS | Correct |
| `upsertJobScheduler` used (not `add`) | PASS | Correct BullMQ v5 API for repeatable jobs |
| Redis via `getRealtimeClient().duplicate()` | PASS | Correct pattern, matches other jobs in codebase |
| Feature flag check at start of every run | PASS (partial) | Flag checked but reads env var, not `TenantFeatureFlags` — see HIGH finding |
| `metadata->>'isEscalated' IS DISTINCT FROM 'true'` filter | PASS | Correct SQL idiom for JSONB null-safe exclusion |
| `metadata->>'escalatedAt' IS NULL` filter | PASS | Correct, prevents re-escalation |
| `isRead = false, isDismissed = false` filter | PASS | Correct |
| `createdAt <= cutoff` via `lte()` | PASS | Correct, cutoff computed from `triggerMinutes` |
| `isEscalated: true` in escalation notification metadata | PASS | Set at line 109 |
| `metadata` passed to `createNotification` before `sanitizeMetadata` runs | PASS | `notificationService.ts:302` reads `isEscalated` before sanitization; the bypass works correctly |
| Original notification marked `escalatedAt` + `escalatedTo` | PASS (partial) | Set unconditionally even when `targetUserIds` is empty — see MEDIUM finding |
| Tenant isolation in notification query | FAIL | No `tenantId` scope — see HIGH finding |
| Tenant isolation in role-based target resolution | FAIL | No `currentTenantId` filter on user query — see HIGH finding |
| `notificationJobs.ts` init module wraps each job in try/catch | PASS | Correct |
| `_core/index.ts` integration | PASS | Import and call pattern correct, wrapped in try/catch |
| All 10 spec-required `executeEscalationCheck` test cases present | PASS | All 10 tests listed in spec are implemented |
| `initializeEscalationJob` idempotency test present | PASS | Present but relies on mock call count — see test quality note |
| Structured logger used | FAIL | `console.log`/`console.error` used throughout — see LOW finding |

---

### Summary

The core escalation logic is functionally correct: the SQL filtering for unacknowledged notifications, the `isEscalated` metadata bypass through `createNotification`, BullMQ wiring, idempotent initialization, and the per-target try/catch for resilient delivery are all implemented as specified. The two blocking issues are tenant isolation failures: the notification scan and the role-based target query both operate across all tenants, meaning a policy configured in one tenant can read and escalate notifications from, and deliver escalation notifications to, users in a completely different tenant. These must be fixed before merge. The test suite's coverage of already-escalated notification filtering is vacuous and should be strengthened, but this is not a blocker.
