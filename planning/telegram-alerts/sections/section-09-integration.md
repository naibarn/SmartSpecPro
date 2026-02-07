# Section 09: Integration -- Wire createNotification to enqueueTelegramNotification

## Overview

This section connects the centralized `createNotification()` wrapper (built in section-02) to the `enqueueTelegramNotification()` function (built in section-03), and then refactors all 6 existing notification insertion sites across the codebase to use the centralized wrapper. This ensures every notification created -- regardless of source -- is automatically eligible for Telegram delivery.

**Goal:** After this section is complete, any notification created anywhere in the application will flow through a single path: `createNotification()` inserts into `user_notifications` and then calls `enqueueTelegramNotification()` to optionally deliver via Telegram.

## Dependencies

- **section-02-notification-service**: Must be completed first. Provides `createNotification()` in `/home/dev/projects/SmartSpecPro/apps/web/server/services/notificationService.ts`.
- **section-03-telegram-service**: Must be completed first. Provides `enqueueTelegramNotification()` in `/home/dev/projects/SmartSpecPro/apps/web/server/services/telegramService.ts`.
- **section-01-schema-migration**: Must be completed first. The `users` table must have the `telegramChatId`, `telegramVerified`, and `userPreferences` (with `telegramNotifyLevel`) columns.

## Files to Modify

| File | Change Description |
|------|-------------------|
| `/home/dev/projects/SmartSpecPro/apps/web/server/services/notificationService.ts` | Wire `enqueueTelegramNotification()` call inside `createNotification()` |
| `/home/dev/projects/SmartSpecPro/apps/web/server/services/scheduler.ts` | Replace 2 `db.insert(userNotifications)` calls with `createNotification()` |
| `/home/dev/projects/SmartSpecPro/apps/web/server/routers/follows.ts` | Replace 2 `db.insert(userNotifications)` calls with `createNotification()` |
| `/home/dev/projects/SmartSpecPro/apps/web/server/routers/mediaJobs.ts` | Replace 2 `db.insert(userNotifications)` calls in `notifyJobFailure()` with `createNotification()` |

## Tests (Write First)

### Test file: `/home/dev/projects/SmartSpecPro/apps/web/server/services/notificationService.test.ts`

These tests validate the integration between `createNotification()` and the Telegram enqueue path. Some of these tests may overlap with section-02 tests -- add any that are missing.

```
# Test: createNotification calls enqueueTelegramNotification after DB insert
# Test: createNotification does not fail if enqueueTelegramNotification throws (fire-and-forget)
# Test: createNotification passes priority through to Telegram enqueue
```

### Test file: `/home/dev/projects/SmartSpecPro/apps/web/server/services/telegramService.test.ts`

Additional integration-level tests (some may already exist from section-03 -- add any that are missing).

```
# Test: end-to-end flow: createNotification -> enqueueTelegramNotification -> worker -> sendMessage
# Test: graceful degradation: notification created successfully even when Redis is down
# Test: graceful degradation: notification created successfully even when Telegram API is down
```

### Test stubs

The `notificationService.test.ts` file should have tests structured roughly like this (stubs only):

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the telegram service
vi.mock("./telegramService", () => ({
  enqueueTelegramNotification: vi.fn().mockResolvedValue(undefined),
}));

describe("createNotification integration", () => {
  it("calls enqueueTelegramNotification after DB insert", async () => {
    /** Call createNotification, verify enqueueTelegramNotification was called
     *  with the correct userId and notification data */
  });

  it("does not fail if enqueueTelegramNotification throws", async () => {
    /** Mock enqueueTelegramNotification to throw, verify createNotification
     *  still returns the notification ID successfully */
  });

  it("passes priority through to Telegram enqueue", async () => {
    /** Call createNotification with priority "critical", verify
     *  enqueueTelegramNotification receives that priority */
  });
});
```

## Implementation Details

### Step 1: Wire enqueueTelegramNotification into createNotification

The `createNotification()` function in `/home/dev/projects/SmartSpecPro/apps/web/server/services/notificationService.ts` (created in section-02) must call `enqueueTelegramNotification()` after the DB insert succeeds. The Telegram enqueue must be fire-and-forget -- if it fails, the in-app notification is still the primary channel and must not be affected.

The function signature (from section-02) is:

```typescript
async function createNotification(params: {
  db: DrizzleDB;
  userId: number;
  type: NotificationType;
  title: string;
  content: string;
  priority?: ReminderPriority;
  conversationId?: number;
  scheduledMessageId?: number;
}): Promise<{ notificationId: number }>
```

After the `db.insert(userNotifications)` call, add a try/catch block that calls:

```typescript
import { enqueueTelegramNotification } from "./telegramService";

// After successful DB insert:
try {
  await enqueueTelegramNotification(params.userId, {
    notificationId: result.id,
    title: params.title,
    content: params.content,
    priority: params.priority || "normal",
    createdAt: new Date().toISOString(),
  });
} catch (err) {
  console.error("[NotificationService] Telegram enqueue failed (non-fatal):", err);
  // Fire-and-forget: do not re-throw
}
```

Key design decisions:
- The `enqueueTelegramNotification()` function (from section-03) handles all eligibility checks internally: whether the user has Telegram linked, whether they are verified, whether their notification level setting allows this priority, and whether the feature is enabled system-wide. The `createNotification()` wrapper does not need to check any of that.
- The try/catch ensures that a Redis failure, queue failure, or any error in the Telegram path does not break the in-app notification flow.
- The `notificationId` is passed through so the Telegram worker can reference it if needed.

### Step 2: Refactor scheduler.ts (2 call sites)

File: `/home/dev/projects/SmartSpecPro/apps/web/server/services/scheduler.ts`

There are two `db.insert(userNotifications)` calls that need to be replaced:

**Call site 1 -- Simple reminder (line 85):**

Current code:
```typescript
await db.insert(userNotifications).values({
  userId,
  type: "scheduled_message",
  title: schedule.description || "Reminder",
  content: content.slice(0, 500),
  scheduledMessageId: scheduleId,
  priority: schedule.priority || "normal",
});
```

Replace with:
```typescript
import { createNotification } from "./notificationService";

await createNotification({
  db,
  userId,
  type: "scheduled_message",
  title: schedule.description || "Reminder",
  content: content.slice(0, 500),
  priority: schedule.priority || "normal",
  scheduledMessageId: scheduleId,
});
```

**Call site 2 -- LLM-powered alert (line 224):**

Current code:
```typescript
await db.insert(userNotifications).values({
  userId,
  type: "scheduled_message",
  title: schedule.description || `Scheduled Alert`,
  content: content.slice(0, 500),
  conversationId: convId,
  scheduledMessageId: scheduleId,
  priority: schedule.priority || "normal",
});
```

Replace with:
```typescript
await createNotification({
  db,
  userId,
  type: "scheduled_message",
  title: schedule.description || "Scheduled Alert",
  content: content.slice(0, 500),
  priority: schedule.priority || "normal",
  conversationId: convId,
  scheduledMessageId: scheduleId,
});
```

Also update the imports at the top of `scheduler.ts`: remove `userNotifications` from the schema import if it is no longer directly used (check if `userNotifications` is used elsewhere in the file before removing).

### Step 3: Refactor follows.ts (2 call sites)

File: `/home/dev/projects/SmartSpecPro/apps/web/server/routers/follows.ts`

**Call site 1 -- Follow notification (line 90):**

Current code:
```typescript
await db.insert(userNotifications).values({
  userId: input.userId,
  type: areFriends ? "alert" : "follow_request",
  title: areFriends
    ? `${ctx.user.name || ctx.user.email} is now your friend!`
    : `${ctx.user.name || ctx.user.email} followed you`,
  content: areFriends
    ? "You can now send unlimited messages to each other."
    : "Follow back to become friends and chat freely.",
});
```

Replace with:
```typescript
import { createNotification } from "../services/notificationService";

await createNotification({
  db,
  userId: input.userId,
  type: areFriends ? "alert" : "follow_request",
  title: areFriends
    ? `${ctx.user.name || ctx.user.email} is now your friend!`
    : `${ctx.user.name || ctx.user.email} followed you`,
  content: areFriends
    ? "You can now send unlimited messages to each other."
    : "Follow back to become friends and chat freely.",
});
```

Note: This call site does not set a `priority`, so it will default to `"normal"` inside `createNotification()`.

**Call site 2 -- Direct message notification (line 379):**

Current code:
```typescript
await db.insert(userNotifications).values({
  userId: input.receiverId,
  type: input.isUrgent ? "urgent_message" as any : "direct_message" as any,
  title: input.isUrgent
    ? `Urgent from ${ctx.user.name || ctx.user.email}`
    : `Message from ${ctx.user.name || ctx.user.email}`,
  content: input.content.slice(0, 500),
});
```

Replace with:
```typescript
await createNotification({
  db,
  userId: input.receiverId,
  type: input.isUrgent ? "urgent_message" as any : "direct_message" as any,
  title: input.isUrgent
    ? `Urgent from ${ctx.user.name || ctx.user.email}`
    : `Message from ${ctx.user.name || ctx.user.email}`,
  content: input.content.slice(0, 500),
  priority: input.isUrgent ? "high" : "normal",
});
```

Note the addition of `priority: input.isUrgent ? "high" : "normal"` -- urgent messages should have elevated priority so they are more likely to trigger Telegram delivery for users with `high_critical` notification level.

After refactoring, remove `userNotifications` from the import at line 14 if it is no longer used directly in this file.

### Step 4: Refactor mediaJobs.ts (2 call sites)

File: `/home/dev/projects/SmartSpecPro/apps/web/server/routers/mediaJobs.ts`

The `notifyJobFailure()` helper function (starting at line 96) contains two `db.insert(userNotifications)` calls.

**Call site 1 -- Notify the job owner (line 111):**

Current code:
```typescript
await db.insert(userNotifications).values({
  userId: userIdNum,
  type: "alert",
  title: "Media Job Failed",
  content: `Your media job (${jobId.slice(0, 8)}...) failed: ${errorMessage.slice(0, 200)}`,
});
```

Replace with:
```typescript
const { createNotification } = await import("../services/notificationService");

await createNotification({
  db,
  userId: userIdNum,
  type: "alert",
  title: "Media Job Failed",
  content: `Your media job (${jobId.slice(0, 8)}...) failed: ${errorMessage.slice(0, 200)}`,
  priority: "high",
});
```

Note: Using dynamic `import()` here because `notifyJobFailure` already uses dynamic imports (e.g., `await import("../db")`) to avoid circular dependencies. Follow the same pattern.

**Call site 2 -- Notify admins (line 126):**

Current code:
```typescript
await db.insert(userNotifications).values({
  userId: admin.id,
  type: "alert",
  title: "Media Job Failed (Admin Alert)",
  content: `User ${userId} — job ${jobId}: ${errorMessage.slice(0, 200)}`,
});
```

Replace with:
```typescript
await createNotification({
  db,
  userId: admin.id,
  type: "alert",
  title: "Media Job Failed (Admin Alert)",
  content: `User ${userId} — job ${jobId}: ${errorMessage.slice(0, 200)}`,
  priority: "high",
});
```

Both the owner and admin failure notifications should have `priority: "high"` since job failures are operationally important.

After refactoring, remove `userNotifications` from the dynamic schema import at line 103 if it is no longer used directly.

### Step 5: Initialize Telegram worker on startup

File: `/home/dev/projects/SmartSpecPro/apps/web/server/_core/index.ts`

This may have been partially done in section-03. Verify that the following is present after the scheduler initialization (around line 260):

```typescript
// Initialize Telegram notification worker (BullMQ + Redis)
try {
  const { initializeTelegramWorker } = await import("../services/telegramService");
  initializeTelegramWorker();
} catch (error) {
  console.error("[Startup] Failed to initialize Telegram worker:", error);
}
```

And in the graceful shutdown handlers (around line 311):

```typescript
process.on("SIGTERM", () => {
  auditLogger.shutdown().catch(() => {});
  import("../services/telegramService")
    .then(m => m.shutdownTelegramWorker())
    .catch(() => {});
});
process.on("SIGINT", () => {
  auditLogger.shutdown().catch(() => {});
  import("../services/telegramService")
    .then(m => m.shutdownTelegramWorker())
    .catch(() => {});
});
```

If section-03 already added this, simply verify it is present. Do not duplicate.

## Import Cleanup Checklist

After all refactoring is done, verify that the `userNotifications` import from `../../drizzle/schema` is removed from files that no longer use it directly:

1. **scheduler.ts** -- Check if `userNotifications` is still used in any remaining code. The import is at line 14. If only the two refactored call sites used it, remove it from the destructured import.
2. **follows.ts** -- The import is at line 14. If only the two refactored call sites used it, remove it from the destructured import.
3. **mediaJobs.ts** -- Uses a dynamic `import("../../drizzle/schema")` at line 103. If `userNotifications` is removed from this destructure, ensure `users` is still imported since it is used on line 119.

## Verification

After completing all changes:

1. Run the notification service tests:
   ```bash
   cd /home/dev/projects/SmartSpecPro/apps/web && pnpm test -- server/services/notificationService.test.ts
   ```

2. Run the Telegram service tests:
   ```bash
   cd /home/dev/projects/SmartSpecPro/apps/web && pnpm test -- server/services/telegramService.test.ts
   ```

3. Run the full test suite to check for regressions:
   ```bash
   cd /home/dev/projects/SmartSpecPro/apps/web && pnpm test
   ```

4. Run TypeScript type-checking to ensure imports are correct:
   ```bash
   cd /home/dev/projects/SmartSpecPro/apps/web && pnpm check
   ```

5. Manual smoke test: Create a scheduled reminder through the UI and verify:
   - The in-app notification appears as before
   - If a Telegram account is linked with `telegramNotifyLevel: "all"`, a Telegram message is delivered
   - If Redis is stopped, the in-app notification still appears (graceful degradation)

## Summary of Changes

| What | Where | Why |
|------|-------|-----|
| Wire `enqueueTelegramNotification()` | `notificationService.ts` | Connect notification creation to Telegram delivery |
| Replace direct DB inserts (2x) | `scheduler.ts` | Route scheduler notifications through centralized wrapper |
| Replace direct DB inserts (2x) | `follows.ts` | Route follow/DM notifications through centralized wrapper |
| Replace direct DB inserts (2x) | `mediaJobs.ts` | Route job failure notifications through centralized wrapper |
| Verify startup/shutdown hooks | `_core/index.ts` | Ensure Telegram worker is initialized and shut down properly |
| Remove unused imports | All modified files | Clean up `userNotifications` imports no longer needed |
