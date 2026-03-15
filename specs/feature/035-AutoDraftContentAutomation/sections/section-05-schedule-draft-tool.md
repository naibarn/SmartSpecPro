# Section 05: builtin-schedule-draft Tool (Node.js Handler + Database)

## Overview

This section implements the `POST /api/internal/tools/schedule-draft` endpoint and the supporting `auto_draft_schedules` database table. The endpoint allows the Auto Draft Agent to create one-time or recurring auto-draft schedules. It includes cron expression validation (1-hour minimum interval), topic template placeholder validation, SSRF webhook URL checks, HMAC secret generation, and integration with the existing scheduler polling loop.

## Dependencies

- **Section 01 (shared-infra):** Provides the `ScheduleDraftRequestSchema`, `ScheduleDraftResponseSchema`, and the `contentAutomationGate` feature flag middleware. These must be implemented first.
- **Existing codebase:**
  - `apps/web/server/services/scheduler.ts` -- existing scheduler service with Cloud Tasks / BullMQ fallback pattern
  - `apps/web/server/routers/scheduledMessages.ts` -- contains `validateCronExpression()` (15-min minimum) used as a reference for our stricter 1-hour version
  - `apps/web/server/services/crypto.ts` -- `encrypt()` function for storing webhook HMAC secrets
  - `apps/web/server/_core/tokens.ts` -- `signBearerToken()` for scoped JWT minting
  - `apps/web/drizzle/schema.ts` -- Drizzle ORM schema definitions

## Files to Create

- `apps/web/server/routers/scheduleDraftTool.ts` -- Express route handler
- `apps/web/server/routers/scheduleDraftTool.test.ts` -- Unit tests

## Files to Modify

- `apps/web/drizzle/schema.ts` -- Add `auto_draft_schedules` table definition
- `apps/web/server/services/scheduler.ts` -- Extend the sweep/polling logic to also process due `auto_draft_schedules` records

## Tests (Write First)

### File: `apps/web/server/routers/scheduleDraftTool.test.ts`

```
# Test: returns 503 when feature flag is disabled
# Test: validates cron_expression rejects intervals < 1 hour
# Test: validates cron_expression accepts hourly patterns
# Test: validates cron_expression rejects every-minute pattern
# Test: validates topic_template rejects unsupported placeholders
# Test: validates topic_template accepts {{date}} placeholder
# Test: validates topic_template accepts {{day_of_week}} placeholder
# Test: rejects webhook URL with private IP (SSRF validation)
# Test: rejects webhook URL with localhost
# Test: blocks creation when user already has 10 active schedules
# Test: creates auto_draft_schedules record with correct fields
# Test: computes next_run correctly for recurring schedules
# Test: sets status to "completed" after one-time schedule runs
# Test: generates webhookSecretEncrypted when webhook URL provided
# Test: returns ScheduleDraftResponse with schedule_id and next_run
```

### File: `apps/web/server/services/scheduler.test.ts` (extend existing)

```
# Test: scheduler polls auto_draft_schedules for due records
# Test: scheduler re-validates draft_params through Zod before dispatch
# Test: scheduler substitutes {{date}} in topic_template
# Test: scheduler substitutes {{day_of_week}} in topic_template
# Test: scheduler overrides draft_params.source to "schedule:{id}"
# Test: scheduler advances next_run after dispatch
# Test: scheduler uses reference_image_urls as R2 object keys, not pre-signed URLs
```

## Database Schema: `auto_draft_schedules` Table

Add the following table definition to `apps/web/drizzle/schema.ts`:

```typescript
export const autoDraftSchedules = pgTable(
  "auto_draft_schedules",
  {
    id: serial("id").primaryKey(),
    tenantId: varchar("tenantId", { length: 128 }).notNull(),
    userId: integer("userId")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    topicTemplate: text("topicTemplate").notNull(),
    scheduleType: varchar("scheduleType", { length: 20 }).notNull(),
    cronExpression: varchar("cronExpression", { length: 100 }),
    runAt: timestamp("runAt", { withTimezone: true }),
    timezone: varchar("timezone", { length: 64 })
      .default("Asia/Bangkok")
      .notNull(),
    draftParams: jsonb("draftParams")
      .$type<Record<string, any>>()
      .notNull(),
    notifyEmail: boolean("notifyEmail").default(true).notNull(),
    notifyWebhookUrl: text("notifyWebhookUrl"),
    webhookSecretEncrypted: text("webhookSecretEncrypted"),
    status: varchar("status", { length: 20 }).default("active").notNull(),
    nextRun: timestamp("nextRun", { withTimezone: true }),
    lastRun: timestamp("lastRun", { withTimezone: true }),
    createdAt: timestamp("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updatedAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("auto_draft_schedules_status_next_run_idx").on(
      table.status,
      table.nextRun
    ),
    index("auto_draft_schedules_tenant_idx").on(table.tenantId),
    index("auto_draft_schedules_user_idx").on(table.userId),
  ]
);
```

**Database Safety:** This is a new table (ADD TABLE) so risk is low. Follow the standard protocol: back up the schema before migration, run `pnpm db:push`, verify the migration does not alter any existing tables, confirm the new table exists with the expected columns.

## Handler Implementation

### Endpoint

`POST /api/internal/tools/schedule-draft`

### Handler Logic (Step by Step)

1. **Feature flag gate:** Applied via `contentAutomationGate` middleware (from Section 01). Returns 503 if `ENABLE_CONTENT_AUTOMATION` is not `"true"`.

2. **Authentication:** Extract `userId` and `tenantId` from the request. Return 401 if missing/invalid.

3. **Request validation:** Parse body against `ScheduleDraftRequestSchema`. Return 400 on validation failure.

4. **Cron expression validation** (for `schedule_type === "recurring"`):
   - Port `validateCronExpression()` from `apps/web/server/routers/scheduledMessages.ts` but enforce a **1-hour minimum interval**.
   - Reject patterns like `* * * * *`, `*/30 * * * *`, `*/5 * * * *`.
   - Accept patterns like `0 * * * *`, `0 9 * * 1`, `0 */2 * * *`.

5. **Topic template placeholder validation:**
   - Extract all `{{...}}` tokens using regex `/\{\{(\w+)\}\}/g`
   - Only allow `{{date}}` and `{{day_of_week}}` -- reject any other placeholder names
   - Return 400 with specific error listing unsupported placeholders

6. **SSRF validation on `notify_webhook_url`** (if provided):
   - Parse the URL. Reject non-HTTP(S) schemes.
   - Reject private IPs: `10.x.x.x`, `172.16-31.x.x`, `192.168.x.x`, `127.x.x.x`, `0.0.0.0`, `::1`, `localhost`

7. **Per-user schedule limit check:**
   - Query `auto_draft_schedules` for count of records with `userId = X AND status = 'active'`
   - If count >= 10, return 403 with message "Maximum 10 active schedules per user"

8. **Generate webhook HMAC secret** (if `notify_webhook_url` is provided):
   - Generate 32 random bytes via `crypto.randomBytes(32).toString("hex")`
   - Encrypt using `encrypt()` from `apps/web/server/services/crypto.ts`
   - Store as `webhookSecretEncrypted`

9. **Compute `next_run`:**
   - For `schedule_type === "once"`: `next_run = run_at`
   - For `schedule_type === "recurring"`: Parse the `cron_expression` and compute the next occurrence

10. **Insert into `auto_draft_schedules`**
    - **Critical:** If `draft_params` includes `reference_image_urls`, these must be stable R2/S3 object keys (not pre-signed URLs which expire).

11. **Return response:** `{ schedule_id, next_run, status: "active" }`

### Cron Validation Function

```typescript
function validateCronExpressionStrict(
  cron: string,
  minIntervalMinutes: number = 60
): { valid: boolean; error?: string }
```

### SSRF Validation Function

```typescript
function validateWebhookUrl(url: string): { valid: boolean; error?: string }
```

## Scheduler Integration: Extending `scheduler.ts`

Add a new exported function `sweepDueAutoDraftSchedules()` to `apps/web/server/services/scheduler.ts`. This function:

1. **Queries due schedules:**
   ```sql
   SELECT * FROM auto_draft_schedules
   WHERE status = 'active' AND next_run <= NOW()
   ```

2. **For each due schedule:**
   - Re-validate `draftParams` through the Zod `AutoDraftRequestSchema`
   - Substitute placeholders in `topicTemplate`:
     - `{{date}}` -> formatted current date (e.g., `"2026-03-11"`)
     - `{{day_of_week}}` -> localized day name (e.g., `"Tuesday"`)
   - Override `draftParams.source` to `"schedule:{schedule_id}"`
   - Dispatch execution via Cloud Tasks or direct call (following existing pattern)

3. **After dispatch:**
   - Update `lastRun` to `NOW()`
   - For `scheduleType === "once"`: set `status = "completed"`
   - For `scheduleType === "recurring"`: compute next occurrence and update `nextRun`

4. **Integration point:** Call from the same 1-minute polling loop that calls `sweepUndeliveredMessages()`.

## Security Considerations

- **Webhook HMAC signing:** At execution time, decrypt `webhookSecretEncrypted`, compute `HMAC-SHA256(payload, secret)`, include as `X-Webhook-Signature` header.
- **Pre-signed URL rejection:** `reference_image_urls` must be stable R2/S3 object keys.
- **Tenant isolation:** All queries must filter by `tenantId`.
- **Per-user limits:** Max 10 active schedules prevents resource exhaustion.

## Relevant Existing Patterns

- **`scheduledMessages` table** (`apps/web/drizzle/schema.ts`): The `auto_draft_schedules` table mirrors its structure.
- **`validateCronExpression()`** (`apps/web/server/routers/scheduledMessages.ts`): Reference with 15-min minimum.
- **`createScheduledJob()`** (`apps/web/server/services/scheduler.ts`): Cloud Tasks vs dev-mode dispatch.
- **`sweepUndeliveredMessages()`** (`apps/web/server/services/scheduler.ts`): The polling loop pattern.
- **`signBearerToken()`** (`apps/web/server/_core/tokens.ts`): For scoped JWT minting.
- **`encrypt()`** (`apps/web/server/services/crypto.ts`): AES-256-GCM encryption for webhook HMAC secret.
