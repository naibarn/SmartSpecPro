# Section 12: Phase 7 -- Notification Templates and Retention Job

**Status: IMPLEMENTED** (commit pending)

## Implementation Notes

- Template service provides both `renderTemplate(key, locale, variables)` (new canonical API) and backward-compatible `renderNotification(key, data)` (used by section-10 email service)
- Retention job uses `getRealtimeClient().duplicate()` for BullMQ, consistent with other notification jobs
- Per-user row cap uses raw SQL for `OFFSET`-based delete subquery (Drizzle ORM limitation)
- 31 tests passing (16 template + 15 retention)

## Section ID
`section-12-phase7-templates-retention`

## Overview

This section implements two Phase 7 services: (1) a notification template service with i18n support (EN/TH) and variable interpolation, and (2) a BullMQ retention job that runs daily at 03:00 UTC to clean up old notifications based on age and per-user caps.

## Dependencies

| Dependency | Section | What It Provides |
|---|---|---|
| section-05-phase5-preference-delivery | 05 | `createNotification()` pipeline; template service hooks into delivery for localized content |
| section-01-phase4-schema-migration | 01 | `notificationOccurrences` table with CASCADE FK (retention job relies on cascade delete) |
| section-06-phase5-escalation-job | 06 | `notificationJobs.ts` initialization module (retention job registered here) |

## Blocks

- **section-10-phase7-email-delivery** -- uses `renderNotification()` for localized email content
- **section-11-phase7-webhook-delivery** -- can use `renderNotification()` for localized webhook payloads (optional)

---

## Files to Create

| File | Purpose |
|------|---------|
| `apps/web/server/services/notificationTemplateService.ts` | i18n template service with EN/TH locales |
| `apps/web/server/jobs/notificationRetentionJob.ts` | Daily retention cleanup job |
| `apps/web/server/services/__tests__/notificationTemplateService.test.ts` | Template service tests |
| `apps/web/server/jobs/__tests__/notificationRetentionJob.test.ts` | Retention job tests |

## Files to Modify

| File | Change |
|------|--------|
| `apps/web/server/jobs/notificationJobs.ts` | Register retention job alongside escalation and digest |

---

## Part A: Notification Template Service

### Exported Interface and Functions

```typescript
interface TemplateEntry {
  title: string;   // e.g., "Media Job Completed"
  content: string; // e.g., "Your {mediaType} generation job completed in {duration}."
}
```

**`renderNotification(templateKey: string, locale: string, variables?: Record<string, string>): TemplateEntry`**

- Look up template by key and locale
- Fallback chain: requested locale → `"en"` → raw key as both title and content
- Replace all `{variableName}` tokens using `/\{(\w+)\}/g` regex
- Missing variables left as literal `{variableName}` (no error thrown)
- This is a **pure function** with no side effects, no database, no async

**`getTemplateKeys(): string[]`**

- Returns all known template keys from the English locale catalog

### Template Catalog

Templates stored as code constants (not database) for simplicity and type safety.

| Template Key | Variables | EN Title | TH Title |
|---|---|---|---|
| `media_job.completed` | `{mediaType}`, `{duration}` | "Media Job Completed" | "งาน Media เสร็จสมบูรณ์" |
| `media_job.failed` | `{mediaType}`, `{errorMessage}` | "Media Job Failed" | "งาน Media ล้มเหลว" |
| `workflow.published` | `{workflowName}` | "Workflow Published" | "เวิร์กโฟลว์เผยแพร่แล้ว" |
| `workflow.failed` | `{workflowName}`, `{errorMessage}` | "Workflow Failed" | "เวิร์กโฟลว์ล้มเหลว" |
| `skill.completed` | `{skillName}` | "Skill Completed" | "สกิลเสร็จสมบูรณ์" |
| `feedback.received` | `{itemType}` | "Feedback Received" | "ได้รับฟีดแบ็ก" |
| `follow.requested` | `{followerName}` | "Follow Request" | "คำขอติดตาม" |
| `alert.escalated` | `{originalTitle}`, `{escalatedTo}` | "Alert Escalated" | "การแจ้งเตือนถูกยกระดับ" |
| `alert.system_health` | `{metricName}`, `{value}`, `{threshold}` | "System Health Alert" | "แจ้งเตือนสุขภาพระบบ" |
| `alert.rate_limit` | `{provider}` | "Rate Limit Hit" | "ถึงขีดจำกัดอัตรา" |
| `notification.digest` | `{count}`, `{period}` | "Notification Digest" | "สรุปการแจ้งเตือน" |
| `webhook.disabled` | `{webhookName}`, `{reason}` | "Webhook Disabled" | "เว็บฮุกถูกปิดใช้งาน" |

### Error Handling Contract

`renderNotification()` **never throws**. If the template key is unknown, it returns `{ title: templateKey, content: templateKey }`. Callers (section-10 email, section-11 webhook) can check if `result.title === templateKey` to detect a fallback and use raw notification title/content instead.

---

## Part B: Notification Retention Job

### Schedule

BullMQ recurring job running daily at 03:00 UTC. Registered in `notificationJobs.ts`.

### Exported Functions

- `executeRetentionCleanup(): Promise<RetentionResult>` -- core logic, exported for direct testing
- `initializeRetentionJob(): Promise<void>` -- registers BullMQ repeatable job
- `shutdownRetentionJob(): Promise<void>` -- closes worker and queue

### Retention Rules (3 strategies applied in order)

**1. Expired notifications**
```sql
DELETE FROM user_notifications WHERE "expiresAt" IS NOT NULL AND "expiresAt" < NOW();
```

**2. Age-based cleanup by priority**

| Priority | Max Age |
|---|---|
| `critical` | 365 days |
| `high` | 180 days |
| `normal` | 90 days |
| `low` | 30 days |

**3. Per-user row cap by priority**

| Priority | Max Rows Per User |
|---|---|
| `critical` | unlimited |
| `high` | 1000 |
| `normal` | 500 |
| `low` | 200 |

For per-user cap: use a raw SQL subquery via `db.execute(sql\`...\`)`:
```sql
DELETE FROM user_notifications WHERE id IN (
  SELECT id FROM user_notifications
  WHERE "userId" = $1 AND priority = $2
  ORDER BY "createdAt" DESC OFFSET $3
);
```

### Cascade Behavior

`notificationOccurrences` has CASCADE FK to `userNotifications`. Deleting a parent automatically deletes all occurrence rows.

### Exported Constants (for tests and future configuration)

```typescript
export const RETENTION_AGE_DAYS: Record<string, number> = {
  critical: 365, high: 180, normal: 90, low: 30,
};
export const RETENTION_ROW_CAPS: Record<string, number | null> = {
  critical: null, high: 1000, normal: 500, low: 200,
};
```

### BullMQ Registration

In `notificationJobs.ts`, add:
```typescript
queue.add("retention-cleanup", {}, {
  repeat: { pattern: "0 3 * * *" }, // daily at 03:00 UTC
  removeOnComplete: { count: 7 },
  removeOnFail: { count: 14 },
});
```

Worker retry: `attempts: 2, backoff: { type: "fixed", delay: 60000 }`.

---

## TDD Tests

### Template Service: `apps/web/server/services/__tests__/notificationTemplateService.test.ts`

```
describe("renderNotification", () => {
  it("returns English template for 'en' locale")
  it("returns Thai template for 'th' locale")
  it("falls back to English for unknown locale (e.g., 'ja')")
  it("returns raw template key as title and content when key not found")
  it("replaces {variableName} tokens with provided values")
  it("leaves {variableName} literal when variable not provided")
  it("handles template with multiple variables")
  it("handles empty variables object")
  it("handles template with no variables")
  it("never throws — returns fallback for any input")
})

describe("getTemplateKeys", () => {
  it("returns array of all known template keys")
  it("includes 'media_job.completed' and 'alert.escalated'")
})
```

### Retention Job: `apps/web/server/jobs/__tests__/notificationRetentionJob.test.ts`

```
describe("executeRetentionCleanup", () => {
  describe("expired notifications", () => {
    it("deletes notifications past expiresAt")
    it("does not delete notifications with null expiresAt")
    it("does not delete notifications with future expiresAt")
  })

  describe("age-based cleanup", () => {
    it("deletes 'low' priority older than 30 days")
    it("deletes 'normal' priority older than 90 days")
    it("deletes 'high' priority older than 180 days")
    it("does NOT delete 'critical' within 365 days")
    it("deletes 'critical' older than 365 days")
  })

  describe("per-user row cap", () => {
    it("caps 'high' at 1000 rows per user (deletes oldest)")
    it("caps 'normal' at 500 rows per user")
    it("caps 'low' at 200 rows per user")
    it("does not cap 'critical' (unlimited)")
  })

  describe("cascade behavior", () => {
    it("occurrences cascade-deleted with parent — no separate query needed")
  })

  describe("error handling", () => {
    it("continues other cleanup steps if one fails")
    it("logs error for failed cleanup step")
  })

  describe("observability", () => {
    it("logs cleanup results with row counts per priority")
  })
})
```

---

## Observability

- `logger.info("notification_retention_complete", { expiredDeleted, ageDeleted: { critical, high, normal, low }, capDeleted: { high, normal, low }, durationMs })`
- Counter: `notification_cleanup_rows_deleted` with `priority` label
- Each step runs independently; failure in one does not prevent others

## Verification Checklist

1. All template tests pass (pure function, no mocks needed)
2. All retention tests pass
3. `renderNotification()` never throws for any input
4. Retention job deletes correct notifications per priority/age/cap rules
5. CASCADE delete verified (no separate occurrence cleanup)
6. Job registered in `notificationJobs.ts`
7. TypeScript compiles: `cd apps/web && pnpm check`
