# Section 06 -- Phase 5: Escalation Job

## Section ID
`section-06-phase5-escalation-job`

## Dependencies
- **section-04-phase5-schema-preferences** -- provides `escalationPolicies` table in `drizzle/schema.ts`
- **section-05-phase5-preference-delivery** -- provides `createNotification()` with `isEscalated` metadata bypass logic, `mapToCategory()` helper

## Goal
Create a BullMQ recurring escalation job that runs every 5 minutes, checking for unacknowledged critical notifications that exceed each escalation policy's trigger window, and creating escalation notifications to the designated targets. Also create a centralized `notificationJobs.ts` initialization module for all notification-related recurring jobs.

## Feature Flag
`notificationEscalationEnabled` (added in section-13, default `false`). The escalation worker must check this flag at the start of every run and exit early if disabled.

---

## Files to Create

| File | Purpose |
|------|---------|
| `apps/web/server/jobs/escalationJob.ts` | BullMQ escalation job (every 5 min) |
| `apps/web/server/jobs/notificationJobs.ts` | Centralized init module for all notification jobs |
| `apps/web/server/jobs/__tests__/escalationJob.test.ts` | Escalation job tests |
| `apps/web/server/jobs/__tests__/notificationJobs.test.ts` | Job init module tests |

## Files to Modify

| File | Change |
|------|--------|
| `apps/web/server/_core/index.ts` | Import and call `initializeNotificationJobs()` at startup |

---

## TDD Tests (Write First)

### Test file: `apps/web/server/jobs/__tests__/escalationJob.test.ts`

Use Vitest. Mock `getDb()`, `getRealtimeClient()`, `createNotification()`, and the feature flag check.

```
describe("executeEscalationCheck", () => {
  it("creates notification for target when critical alert unacknowledged past triggerMinutes")
  it("skips already-escalated notifications (metadata.isEscalated=true)")
  it("skips notifications with metadata.escalatedAt already set")
  it("respects isEnabled=false on policy")
  it("returns early when NOTIFICATION_ESCALATION_ENABLED=false — no DB queries")
  it("escalation notification has isEscalated=true in metadata")
  it("marks original notification metadata with escalatedAt and escalatedTo")
  it("targets role-based users when escalateToRole is set (creates N notifications)")
  it("targets single user when escalateToUserId is set")
  it("continues processing if one notification creation fails")
})

describe("initializeEscalationJob", () => {
  it("is idempotent — second call does not create duplicate repeatable job")
})
```

### Test file: `apps/web/server/jobs/__tests__/notificationJobs.test.ts`

```
describe("initializeNotificationJobs", () => {
  it("calls all sub-job initializers (escalation, digest, retention)")
  it("continues if one job fails — does not abort others")
})

describe("shutdownNotificationJobs", () => {
  it("calls all sub-job shutdown functions")
})
```

---

## Implementation Guidance

### 1. `escalationJob.ts`

**Exported functions:**

- `initializeEscalationJob(): Promise<void>` -- creates BullMQ Queue and Worker, registers repeatable job. Must be idempotent.
- `shutdownEscalationJob(): Promise<void>` -- closes Worker and Queue gracefully.
- `executeEscalationCheck(): Promise<void>` -- core logic, exported separately for direct testing.

**Core logic of `executeEscalationCheck()`:**

1. Check feature flag. If false, log `"escalation_job_skipped"` and return.
2. Query `escalationPolicies` WHERE `isEnabled = true`.
3. For each policy, query `userNotifications` matching:
   - `priority` = `policy.triggerSeverity`
   - `isRead = false`, `isDismissed = false`
   - `createdAt < NOW() - policy.triggerMinutes`
   - `metadata->>'isEscalated' IS DISTINCT FROM 'true'`
   - `metadata->>'escalatedAt' IS NULL`
4. For each matching notification:
   - Determine targets: `escalateToUserId` (single user) or `escalateToRole` (query all users with that role)
   - Call `createNotification()` for each target:
     - `type: "alert"`, `priority: "critical"`
     - `title`: policy.escalateMessage or default `"Escalation: Unacknowledged {severity} alert"`
     - `metadata: { isEscalated: true, originalNotificationId, escalatedFromUserId }`
     - `relatedResourceType` and `actionUrl`: copied from original notification
   - Update original notification metadata with `escalatedAt` and `escalatedTo`:
     ```sql
     COALESCE(metadata, '{}'::jsonb) || '{"escalatedAt":"...","escalatedTo":"..."}'::jsonb
     ```
5. Log each escalation with structured logger.

**BullMQ configuration:**
- Queue name: `"notification-escalation"`
- Redis: `getRealtimeClient()` from `redisClients.ts`
- Repeat: `{ every: 5 * 60 * 1000 }` (5 minutes)
- Worker concurrency: 1
- `removeOnComplete: { count: 100 }`, `removeOnFail: { count: 50 }`

### 2. `notificationJobs.ts`

Centralized init module called from `_core/index.ts`:

```typescript
export async function initializeNotificationJobs(): Promise<void> {
  // Each wrapped in try/catch so one failure doesn't block others
  try { await initializeEscalationJob(); } catch (e) { console.error("[notificationJobs] escalation init failed:", e); }
  // Section-10 adds: try { await initializeDigestJob(); } catch (e) { ... }
  // Section-12 adds: try { await initializeRetentionJob(); } catch (e) { ... }
}

export async function shutdownNotificationJobs(): Promise<void> {
  await shutdownEscalationJob();
  // Section-10 adds: await shutdownDigestJob();
  // Section-12 adds: await shutdownRetentionJob();
}
```

### 3. `_core/index.ts` integration

Add near existing job initialization (near `initializePendingApprovalAlertJob()`):

```typescript
import { initializeNotificationJobs } from "../jobs/notificationJobs";
await initializeNotificationJobs();
```

---

## Security Considerations

- Runs server-side only; no user input involved
- `escalateToUserId` and `escalateToRole` validated at policy creation (section-04 Zod schemas)
- `isEscalated: true` metadata is set server-side only; cannot be spoofed by clients
- Escalated notifications bypass user preferences (section-05 delivery gate)

## Observability

- `logger.info("notification_escalated", { policyId, originalNotificationId, targetUserId, triggerMinutes })`
- `logger.info("escalation_job_completed", { escalationsCreated, policiesChecked, durationMs })`
- `logger.info("escalation_job_skipped", { reason: "feature_flag_disabled" })`

## Verification Checklist

1. All tests in `escalationJob.test.ts` pass
2. Feature flag `false` → no DB queries, no notifications created
3. Unacknowledged critical notification past trigger window → escalation created
4. Already-escalated notifications are skipped
5. Original notification metadata updated with `escalatedAt`
6. `initializeEscalationJob()` is idempotent
7. TypeScript compiles: `cd apps/web && pnpm check`

## Implementation Notes (Post-Build)

**Files created:**
- `apps/web/server/jobs/escalationJob.ts` — BullMQ escalation job with `executeEscalationCheck()`, `initializeEscalationJob()`, `shutdownEscalationJob()`
- `apps/web/server/jobs/notificationJobs.ts` — Centralized init/shutdown module
- `apps/web/server/jobs/__tests__/escalationJob.test.ts` — 11 tests
- `apps/web/server/jobs/__tests__/notificationJobs.test.ts` — 3 tests

**Files modified:**
- `apps/web/server/_core/index.ts` — Added `initializeNotificationJobs()` call at startup

**Deviations from plan:**
- Added tenant isolation (code review fix): notification query now uses `innerJoin(users)` with `currentTenantId::text = policy.tenantId` to prevent cross-tenant escalation leakage
- Role-based target query also scoped to policy's tenant
- Metadata update guarded with `if (targetUserIds.length > 0)` to prevent marking notifications as escalated when no targets exist
- Shutdown functions wrapped in try/catch for resilience
- Feature flag uses `process.env.NOTIFICATION_ESCALATION_ENABLED` pending section-13

**Test results:** 14/14 tests pass
