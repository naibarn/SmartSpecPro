# Section 10: Phase 7 -- Email Delivery Service and Digest Job

## Overview

This section implements email delivery for notifications. It creates two new files:

1. **`notificationEmailService.ts`** -- extends the existing `emailService.ts` with notification-specific email functions (immediate single-notification email and batched digest email).
2. **`notificationDigestJob.ts`** -- a BullMQ recurring job that runs every hour, collecting unread notifications for users who have opted into email delivery and sending digest emails at the configured frequency (hourly or daily).

The email delivery channel is gated by the `NOTIFICATION_EMAIL_DELIVERY` feature flag (created in section-13). When the flag is enabled, `createNotification()` (modified in section-05) returns a `channels` object indicating whether email delivery is requested. The immediate email path is triggered by calling `sendNotificationEmail()` from within `createNotification()` for high/critical priority notifications. The digest path handles low/normal priority notifications in batches.

## Dependencies

| Section | What it provides | Required before this section? |
|---------|-----------------|-------------------------------|
| section-05-phase5-preference-delivery | `createNotification()` returns `channels.email` flag; `loadUserPreference()` for email preference; `mapToCategory()` | Yes |
| section-12-phase7-templates-retention | `notificationTemplateService.ts` with `renderNotification()` for localized email content | Yes |
| section-13-feature-flags-i18n | `NOTIFICATION_EMAIL_DELIVERY` feature flag | Yes (flag must exist) |
| section-01-phase4-schema-migration | Extended `userNotifications` table schema | Yes (via section-05) |
| section-04-phase5-schema-preferences | `notificationPreferences` table with `emailDigestFrequency` and `emailDigestHour` columns | Yes (via section-05) |

## Files Created/Modified (Actual)

| File | Action |
|------|--------|
| `apps/web/server/services/notificationEmailService.ts` | **Created** — immediate email + digest email service |
| `apps/web/server/services/notificationTemplateService.ts` | **Created** — stub template service (section-12 replaces with full implementation) |
| `apps/web/server/jobs/notificationDigestJob.ts` | **Created** — BullMQ hourly digest job with `executeDigestRun()` |
| `apps/web/server/services/notificationService.ts` | **Modified** — hooked email delivery into createNotification() for high/critical |
| `apps/web/server/services/emailService.ts` | **Modified** — exported `getSmtpConfig` and `createTransporter` |
| `apps/web/server/jobs/notificationJobs.ts` | **Modified** — registered digest job init/shutdown |
| `apps/web/shared/featureFlags.ts` | **Modified** — added F24 `notificationEmailDelivery` flag |
| `apps/web/server/services/__tests__/notificationEmailService.test.ts` | **Created** — 16 tests |
| `apps/web/server/jobs/__tests__/notificationDigestJob.test.ts` | **Created** — 10 tests |

**Deviations from plan:**
- Added `notificationTemplateService.ts` stub since section-12 hasn't been implemented yet. Falls back to raw content with minimal i18n.
- `users` table has no `locale` column — locale hardcoded to "en" (known gap).
- BullMQ connection uses `redis.duplicate()` instead of reconstructing from host/port (review fix).
- Tenant-level feature flag gate deferred to section-13 — current gating is user-preference based (`channels.email` defaults to false).

## Tests (Write First)

### Test File: `apps/web/server/services/__tests__/notificationEmailService.test.ts`

#### Mock Strategy

- Mock `apps/web/server/services/emailService.ts` to intercept the nodemailer transporter creation. Specifically, mock `getSmtpConfig()` and `createTransporter()` by re-exporting or internally mocking the module so that `sendMail` calls are captured without actually sending email.
- Mock `apps/web/server/services/notificationTemplateService.ts` (from section-12) to return predictable template content.
- Mock `apps/web/server/db.ts` so `getDb()` returns a controllable Drizzle instance.
- Mock `apps/web/server/services/redis.ts` for the Redis client used by digest timestamp tracking.
- Mock the `NOTIFICATION_EMAIL_DELIVERY` feature flag.

#### Test Stubs

```typescript
// apps/web/server/services/__tests__/notificationEmailService.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../db", () => ({ getDb: vi.fn() }));
vi.mock("../redis", () => ({ getRedisClient: vi.fn() }));
vi.mock("../emailService", () => ({
  // Expose a testable createTransporter
  __esModule: true,
}));
vi.mock("../notificationTemplateService", () => ({
  renderNotification: vi.fn(),
}));

describe("sendNotificationEmail", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("sends email via nodemailer for high priority notification");
  it("sends email via nodemailer for critical priority notification");
  it("uses template service for localized content with correct locale parameter");
  it("includes unsubscribe link pointing to /settings/notifications in email body");
  it("includes action URL prefixed with ENV.publicUrl when actionUrl is present");
  it("does nothing and returns false if user has no email address");
  it("does nothing and returns false if SMTP is not configured");
  it("returns false and logs error if sendMail throws");
  it("does not send for low priority notification (digest-only)");
  it("does not send for normal priority notification (digest-only)");
});

describe("sendNotificationDigest", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("collects unread notifications since last digest timestamp");
  it("sends digest email with up to 20 notification summaries");
  it("sends nothing and returns false if zero unread notifications");
  it("includes 'View all' link to /notifications in digest email");
  it("uses template service for digest header/footer localization");
  it("truncates notification titles longer than 100 characters in digest");
});
```

### Test File: `apps/web/server/jobs/__tests__/notificationDigestJob.test.ts`

#### Mock Strategy

- Mock `apps/web/server/db.ts` for DB queries against `notificationPreferences` and `userNotifications`.
- Mock `apps/web/server/services/notificationEmailService.ts` to capture `sendNotificationDigest` calls.
- Mock `apps/web/server/services/redis.ts` for digest timestamp read/write.
- Use `vi.useFakeTimers()` to control "current hour" for daily digest scheduling.

#### Test Stubs

```typescript
// apps/web/server/jobs/__tests__/notificationDigestJob.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("../../db", () => ({ getDb: vi.fn() }));
vi.mock("../../services/notificationEmailService", () => ({
  sendNotificationDigest: vi.fn(),
}));
vi.mock("../../services/redis", () => ({
  getRedisClient: vi.fn(),
}));

describe("notificationDigestJob", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
  });
  afterEach(() => { vi.useRealTimers(); });

  it("queries users with email=true in notificationPreferences");
  it("sends digest for 'hourly' users on every execution");
  it("skips 'daily' users when current UTC hour does not match digestHour");
  it("sends digest for 'daily' users when current UTC hour matches digestHour");
  it("updates last digest time in Redis after successful send");
  it("reads last digest time from Redis key 'notification:digest:last:{userId}'");
  it("sets Redis key with 7-day TTL after updating last digest time");
  it("skips users with zero unread notifications since last digest");
  it("handles Redis unavailability gracefully (falls back to 1 hour ago)");
  it("does not throw if sendNotificationDigest fails for one user (continues to next)");
});
```

## Implementation Guidance

### 1. Create `notificationEmailService.ts`

**File path:** `apps/web/server/services/notificationEmailService.ts`

This service builds on the existing SMTP infrastructure from `emailService.ts`. It does NOT duplicate the transporter creation logic. Instead, it imports the SMTP config and transporter utilities from `emailService.ts`.

#### Exports

The service must export two public functions:

**`sendNotificationEmail`**

```typescript
/**
 * Send an immediate notification email for high/critical priority notifications.
 * Returns true if email was sent successfully, false otherwise.
 */
export async function sendNotificationEmail(params: {
  userEmail: string;
  userName?: string;
  locale: string;          // "en" or "th"
  notification: {
    id: number;
    type: string;
    title: string;
    content: string;
    priority: string;
    actionUrl?: string;
    actionLabel?: string;
    metadata?: Record<string, unknown>;
  };
}): Promise<boolean>;
```

**Implementation notes:**
- Only sends for `priority === "high"` or `priority === "critical"`. Returns `false` for low/normal (those go through digest).
- Call `renderNotification()` from `notificationTemplateService.ts` (section-12) to get localized title and content.
- Build HTML email body using inline styles (same pattern as `sendVerificationEmail` in `emailService.ts`).
- The email must include:
  - Rendered notification title and content
  - Action button linking to `${ENV.publicUrl}${actionUrl}` if actionUrl is present
  - Unsubscribe link: `${ENV.publicUrl}/settings/notifications`
  - Footer with "SmartAIHub" branding
- Priority badge: render "HIGH" or "CRITICAL" as a colored badge in the email header (high=#f59e0b, critical=#ef4444).
- If `userEmail` is falsy, return `false` immediately.
- If SMTP is not configured (transporter is null), return `false`.
- Wrap `sendMail` in try/catch; log error with `console.error` on failure, return `false`.

**`sendNotificationDigest`**

```typescript
/**
 * Send a digest email summarizing unread notifications since last digest.
 * Returns true if digest was sent, false if skipped or failed.
 */
export async function sendNotificationDigest(params: {
  userEmail: string;
  userName?: string;
  locale: string;
  userId: number;
  notifications: Array<{
    id: number;
    title: string;
    content: string;
    priority: string;
    createdAt: Date;
    actionUrl?: string;
  }>;
}): Promise<boolean>;
```

**Implementation notes:**
- If `notifications` array is empty, return `false`.
- Limit to first 20 notifications in the digest.
- Truncate each notification title to 100 characters in the rendered digest.
- Build an HTML email with:
  - Header: "Notification Digest" (localized via template service)
  - List of notification summaries with title, truncated content (first 200 chars), time, and priority indicator
  - "View all notifications" link: `${ENV.publicUrl}/notifications`
  - Unsubscribe link: `${ENV.publicUrl}/settings/notifications`
- Use `renderNotification()` with template key `"digest.header"` and `"digest.footer"` for localized framing.

#### Internal Helper: SMTP Access

Since `emailService.ts` does not currently export `getSmtpConfig()` or `createTransporter()`, one of these approaches is needed:

**Option A (preferred):** Add exports to `emailService.ts`:
```typescript
// Add to emailService.ts
export { getSmtpConfig, createTransporter };
```

**Option B:** Duplicate the transporter creation in `notificationEmailService.ts` (less DRY, avoid if possible).

Go with Option A -- add the two exports to `emailService.ts`. This is a minimal change (adding `export` keyword to existing functions).

#### ENV.publicUrl

Read from `process.env.PUBLIC_URL` or `process.env.VITE_PUBLIC_URL` or default to `"https://smartaihub.app"`. This is the base URL prefixed to action URLs and unsubscribe links. Check if there is an existing `ENV` utility in `apps/web/server/_core/env.ts` that provides this.

### 2. Create `notificationDigestJob.ts`

**File path:** `apps/web/server/jobs/notificationDigestJob.ts`

This is a BullMQ recurring job that runs every hour. The plan specifies using BullMQ `Queue.add()` with `repeat` options for reliable scheduling, moving away from the `setInterval` pattern used by older jobs.

#### BullMQ Setup

```typescript
import { Queue, Worker } from "bullmq";
import type { Job } from "bullmq";
```

Use the same Redis connection pattern as `deliveryQueue.ts`:
```typescript
import { getRealtimeClient } from "../services/redisClients";
```

Queue name: `"notification-digest"`

#### Initialization Function

```typescript
/**
 * Initialize the notification digest job.
 * Called from notificationJobs.ts during server startup.
 */
export async function initializeDigestJob(): Promise<void>;
```

**Implementation notes:**
- Create a `Queue` instance with the Redis connection.
- Add a repeatable job: `queue.add("digest-run", {}, { repeat: { every: 3_600_000 } })` (every hour, 3600000ms).
- Create a `Worker` that processes the `"digest-run"` job by calling `executeDigestRun()`.
- Guard against double-initialization (check if queue/worker already exist).

#### Core Logic: `executeDigestRun()`

```typescript
async function executeDigestRun(): Promise<void>;
```

**Step-by-step flow:**

1. **Get DB connection.** If unavailable, log and return.

2. **Query users with email digest preferences.** Query `notificationPreferences` table for rows where `email = true` AND `emailDigestFrequency IS NOT NULL`. Join with `users` table to get user email and locale. This is a single query that returns all users needing digest processing.

   ```sql
   SELECT DISTINCT np."userId", np."emailDigestFrequency", np."emailDigestHour", np.category,
          u.email, u.name, u.locale
   FROM notification_preferences np
   JOIN users u ON u.id = np."userId"
   WHERE np.email = true AND np."emailDigestFrequency" IS NOT NULL
   ```

   Note: A user may have multiple preference rows (one per category). Group by userId and collect all categories where email is enabled.

3. **For each user, determine if this run should send a digest:**
   - If `emailDigestFrequency === "hourly"`: always process this user.
   - If `emailDigestFrequency === "daily"`: only process if the current UTC hour matches `emailDigestHour`. Use `new Date().getUTCHours()` for the comparison.

4. **Read last digest timestamp from Redis.** Key: `notification:digest:last:${userId}`. If key is missing, default to 1 hour ago (for hourly) or 24 hours ago (for daily).

5. **Query unread notifications since last digest.** Query `userNotifications` where:
   - `userId = user.id`
   - `isRead = false`
   - `createdAt > lastDigestTimestamp`
   - Category matches the user's email-enabled categories (use `mapToCategory` from section-05 on the `relatedResourceType` and `type` columns, or filter in application code after fetching)
   - `ORDER BY createdAt DESC LIMIT 20`

6. **If zero notifications, skip this user.** Continue to next user.

7. **Call `sendNotificationDigest()`.** Pass the user's email, name, locale, and the notification list.

8. **On success, update Redis timestamp.** `redis.set(`notification:digest:last:${userId}`, new Date().toISOString(), "EX", 604800)` (7-day TTL = 604800 seconds).

9. **Error handling per user.** Wrap each user's processing in try/catch. Log errors but continue to the next user. Never let one user's failure abort the entire digest run.

#### Shutdown Function

```typescript
export async function shutdownDigestJob(): Promise<void>;
```

Close the worker and queue gracefully. Follow the same pattern as `closeDeliveryQueue()` in `deliveryQueue.ts`.

### 3. Modify `notificationService.ts` -- Hook Email Delivery

After section-05's modifications, `createNotification()` returns `{ notificationId, channels }`. Add an email delivery step after the existing Telegram and Redis pub/sub steps.

**Location:** After the Redis pub/sub block (step 4 in section-05's flow), add:

```
// --- NEW: Email delivery (fire-and-forget) ---
// Only for immediate email (high/critical), gated by NOTIFICATION_EMAIL_DELIVERY flag
if (channels.email && NOTIFICATION_EMAIL_DELIVERY is enabled) {
  if (priority === "high" || priority === "critical") {
    try {
      const user = await db.select({ email, name, locale }).from(users).where(eq(users.id, userId)).limit(1);
      if (user[0]?.email) {
        await sendNotificationEmail({
          userEmail: user[0].email,
          userName: user[0].name,
          locale: user[0].locale || "en",
          notification: { id: notificationId, type, title, content, priority, actionUrl, actionLabel, metadata },
        });
      }
    } catch (err) {
      console.error("[NotificationService] Email delivery failed (non-fatal):", err);
    }
  }
  // Low/normal priority with email=true: handled by digest job (notificationDigestJob.ts)
}
```

**Important:** This is fire-and-forget, following the same pattern as Telegram delivery. Email failures must NOT prevent the notification from being created. The `users` table query to fetch email/name/locale is a lightweight indexed lookup.

**User table fields needed:** The `users` table in `drizzle/schema.ts` must have `email`, `name`, and optionally `locale` columns. Verify these exist. If `locale` does not exist on the users table, fall back to `"en"`.

### 4. Register Digest Job in `notificationJobs.ts`

**File path:** `apps/web/server/jobs/notificationJobs.ts`

This file is created by section-06 (escalation job). Extend it to also initialize and shut down the digest job:

```typescript
import { initializeDigestJob, shutdownDigestJob } from "./notificationDigestJob";

// In initializeNotificationJobs():
await initializeDigestJob();

// In shutdownNotificationJobs():
await shutdownDigestJob();
```

### 5. Export `getSmtpConfig` and `createTransporter` from `emailService.ts`

**File path:** `apps/web/server/services/emailService.ts`

Change the existing function declarations from module-private to exported:

- Line 28: `async function getSmtpConfig()` becomes `export async function getSmtpConfig()`
- Line 71: `async function createTransporter()` becomes `export async function createTransporter()`

No other changes to this file.

## Security Considerations

- **No PII in logs.** Log `userId` only, never email addresses, in structured log messages for digest job execution.
- **Email content sanitization.** Notification titles and content inserted into HTML email must be HTML-escaped to prevent XSS in email clients. Use a simple `escapeHtml()` utility (replace `<`, `>`, `&`, `"`, `'` with entities).
- **Unsubscribe link.** Every notification email must include an unsubscribe link pointing to `/settings/notifications` where users can disable email delivery per category.
- **SMTP credentials.** The existing `emailService.ts` already handles encrypted SMTP credentials via the `systemSettings` table with `isSensitive: true`. The notification email service reuses this path -- no additional credential handling needed.
- **Rate limiting.** The digest job processes all eligible users sequentially in a single BullMQ job run. For deployments with many users, consider adding a small delay between sends (e.g., 100ms) to avoid overwhelming the SMTP server. This is optional for initial implementation.

## Observability

Add structured logging:

- `console.log("[NotificationEmail] Sent immediate email", { userId, notificationId, priority })` -- on successful immediate email send.
- `console.log("[NotificationEmail] Digest sent", { userId, notificationCount })` -- on successful digest send.
- `console.error("[NotificationEmail] Send failed (non-fatal)", { userId, error: err.message })` -- on email failure.
- `console.log("[DigestJob] Run complete", { usersProcessed, digestsSent, errors })` -- at end of each digest run.

Counter (if metrics system is in place):
- `notification_channel_delivery_total` with label `channel: "email"`, `status: "success" | "failure"` -- increment on each send attempt.

## Integration Points

- **Section-05 (Preference Delivery)** provides the `channels.email` flag that triggers immediate email in `createNotification()`. The email preference (`email: true`) on `notificationPreferences` controls whether a user receives email notifications at all.
- **Section-12 (Templates/Retention)** provides `renderNotification()` for localized email content. The template service must be created before this section's implementation. If templates are unavailable, fall back to using the raw notification title/content.
- **Section-11 (Webhook Delivery)** is a parallel section that also hooks into the delivery pipeline. Both can be implemented independently.
- **Section-06 (Escalation Job)** creates escalated notifications with `isEscalated: true` which triggers email delivery on ALL channels regardless of preference (handled by section-05's bypass logic).
- **Section-04 (Schema Preferences)** defines `emailDigestFrequency` and `emailDigestHour` columns used by the digest job to determine send timing.

## Dead Letter Queue / Failed Job Monitoring

BullMQ is configured with `removeOnFail: { age: 604800 }` (7-day retention for failed jobs). Failed email delivery jobs are visible at `/admin/queues` (existing admin queue dashboard). The admin should monitor:
- `notification-digest` queue for failed digest runs
- Failed jobs contain the userId and error message for debugging
- After 3 consecutive failures for a specific user's email, the digest job should log a warning but NOT disable email preferences (unlike webhooks which auto-disable)

## Verification Checklist

1. All tests in `notificationEmailService.test.ts` pass.
2. All tests in `notificationDigestJob.test.ts` pass.
3. Existing notification tests (`notificationService.test.ts`) still pass.
4. `emailService.ts` exports `getSmtpConfig` and `createTransporter` without breaking existing imports.
5. Immediate email is sent only for high/critical priority notifications when `channels.email` is true.
6. Digest job runs hourly via BullMQ repeatable schedule.
7. Daily digest users are only processed when current UTC hour matches their `digestHour`.
8. Redis key `notification:digest:last:{userId}` is updated with 7-day TTL after each successful digest.
9. Email body includes unsubscribe link to `/settings/notifications`.
10. HTML content in emails is escaped to prevent XSS.
11. TypeScript compiles without errors: `cd /home/dev/projects/SmartSpecPro/apps/web && pnpm check`