Now I'll generate the complete self-contained content for section-02-notification-service.

---

# Section 02: Centralized Notification Service

## Overview

This section creates a centralized `createNotification()` wrapper that consolidates all notification creation logic. Currently, there are 6 places in the codebase that directly insert into `user_notifications`. This refactoring ensures every notification created — regardless of source — is eligible for Telegram delivery and any future delivery channels.

## Dependencies

- **section-01-schema-migration** — Database schema must be updated with Telegram columns before implementing this service

## Background

The SmartSpecPro codebase has a notification system that stores notifications in the `user_notifications` table and can deliver them via multiple channels (in-app, email, SMS). With the addition of Telegram as a delivery channel, we need a single point where all notifications are created and dispatched to the appropriate delivery services.

Currently, notifications are inserted directly in 6 locations:
1. `apps/web/server/services/scheduler.ts` line 85 — simple reminder
2. `apps/web/server/services/scheduler.ts` line 224 — LLM-powered alert
3. `apps/web/server/routers/follows.ts` line 90 — follow notification
4. `apps/web/server/routers/follows.ts` line 379 — follow notification
5. `apps/web/server/routers/mediaJobs.ts` line 111 — media job failure
6. `apps/web/server/routers/mediaJobs.ts` line 126 — admin alert for media job failure

Each of these call sites performs a direct database insert without coordinating with delivery services. This section fixes that by introducing a centralized wrapper.

## Architecture Pattern

The notification service follows the "fire-and-forget" pattern for delivery channels:
- The primary responsibility is to insert the notification into the database
- After successful DB insert, it attempts to enqueue the notification for Telegram delivery
- If Telegram enqueue fails (Redis down, queue unavailable), it logs the error but does NOT fail the notification creation
- This ensures in-app notifications always work, even if external delivery channels are unavailable

## Tests (Write These First)

Create test file: `/home/dev/projects/SmartSpecPro/apps/web/server/services/notificationService.test.ts`

```typescript
// Test: createNotification inserts into user_notifications with correct fields
// Verify: id, userId, type, title, content, priority, isRead=false, createdAt populated

// Test: createNotification returns the inserted notification ID
// Verify: return value matches { notificationId: number }

// Test: createNotification calls enqueueTelegramNotification after DB insert
// Mock: enqueueTelegramNotification function
// Verify: called with correct parameters (userId, notification data)

// Test: createNotification does not fail if enqueueTelegramNotification throws
// Mock: enqueueTelegramNotification to throw error
// Verify: notification still inserted, error logged, function completes successfully

// Test: createNotification passes priority through to Telegram enqueue
// Verify: priority parameter is included in enqueueTelegramNotification call

// Test: createNotification handles optional fields (conversationId, scheduledMessageId)
// Verify: optional fields are stored when provided, null when omitted
```

Run tests with:
```bash
cd /home/dev/projects/SmartSpecPro/apps/web
pnpm test -- server/services/notificationService.test.ts
```

## Implementation

### File: `/home/dev/projects/SmartSpecPro/apps/web/server/services/notificationService.ts`

Create a new file with the following structure:

```typescript
import type { DrizzleDB } from "../_core/drizzle";
import { userNotifications } from "../../drizzle/schema";
import { enqueueTelegramNotification } from "./telegramService";

/**
 * Notification type enumeration (matches database enum)
 */
type NotificationType = "reminder" | "alert" | "follow" | "system" | "media_job";

/**
 * Priority levels (matches scheduled_messages priority enum)
 */
type ReminderPriority = "low" | "normal" | "high" | "critical";

/**
 * Parameters for creating a notification
 */
interface CreateNotificationParams {
  db: DrizzleDB;
  userId: number;
  type: NotificationType;
  title: string;
  content: string;
  priority?: ReminderPriority;
  conversationId?: number;
  scheduledMessageId?: number;
}

/**
 * Centralized notification creator.
 * 
 * Inserts a notification into the database and enqueues it for Telegram delivery
 * if the user has linked their Telegram account and enabled notifications.
 * 
 * @returns Object containing the created notification ID
 */
async function createNotification(params: CreateNotificationParams): Promise<{ notificationId: number }> {
  // 1. Insert into user_notifications table
  // 2. Extract inserted notification ID
  // 3. Call enqueueTelegramNotification (fire-and-forget)
  // 4. Return notification ID
}

export { createNotification };
export type { CreateNotificationParams, NotificationType, ReminderPriority };
```

**Implementation notes:**
- Use `db.insert(userNotifications).values({...}).returning({ id: userNotifications.id })`
- Wrap `enqueueTelegramNotification()` call in try/catch to prevent delivery failures from breaking notification creation
- Log delivery errors but do NOT throw them
- Default `priority` to `"normal"` if not provided
- Pass all notification data to `enqueueTelegramNotification()` — it will handle eligibility checks internally

### Refactoring Call Sites

After implementing `createNotification()`, refactor all 6 direct insertion call sites to use the new wrapper.

**Pattern to replace:**

```typescript
// OLD: Direct insert
const [notification] = await db.insert(userNotifications).values({
  userId,
  type: "reminder",
  title: "...",
  content: "...",
  // ...
}).returning({ id: userNotifications.id });
```

```typescript
// NEW: Use wrapper
const { notificationId } = await createNotification({
  db,
  userId,
  type: "reminder",
  title: "...",
  content: "...",
  // ...
});
```

**Files to refactor:**

1. `/home/dev/projects/SmartSpecPro/apps/web/server/services/scheduler.ts` (2 occurrences)
2. `/home/dev/projects/SmartSpecPro/apps/web/server/routers/follows.ts` (2 occurrences)
3. `/home/dev/projects/SmartSpecPro/apps/web/server/routers/mediaJobs.ts` (2 occurrences)

**Important:** Do NOT implement the Telegram delivery logic yet — that is handled by section-03-telegram-service. For now, import `enqueueTelegramNotification` from `./telegramService` and call it. The actual implementation will be added in the next section.

### Integration with Telegram Service

The `enqueueTelegramNotification()` function (implemented in section-03) performs the following checks internally:
- Is user verified for Telegram (`telegramVerified === true`)?
- Does the notification priority match the user's notification level preference?
- Is Telegram feature enabled in system settings?
- If all checks pass, enqueue to BullMQ `telegram-notifications` queue

The notification service does NOT need to know these details — it simply calls the function and lets it handle the eligibility logic.

### Error Handling Strategy

The notification service follows graceful degradation:

| Scenario | Behavior |
|----------|----------|
| Database insert fails | Throw error (caller should handle) |
| Telegram enqueue fails (Redis down) | Log error, continue |
| Telegram enqueue fails (queue misconfigured) | Log error, continue |
| Telegram service not yet implemented | Log warning, continue |

This ensures the in-app notification system (the primary channel) always works, even when external delivery channels are unavailable.

## Verification Steps

After implementation, verify:

1. **Run tests:**
   ```bash
   cd /home/dev/projects/SmartSpecPro/apps/web
   pnpm test -- server/services/notificationService.test.ts
   ```

2. **Check all call sites refactored:**
   ```bash
   cd /home/dev/projects/SmartSpecPro
   grep -r "db.insert(userNotifications)" apps/web/server/
   ```
   Should return zero results after refactoring.

3. **Type-check:**
   ```bash
   cd /home/dev/projects/SmartSpecPro/apps/web
   pnpm check
   ```

4. **Manual test:** Create a test notification via the scheduler UI and verify it appears in the database with correct fields.

## Next Steps

After completing this section:
- Proceed to **section-03-telegram-service** to implement the actual Telegram delivery queue and worker
- Once section-03 is complete, come back and verify that `enqueueTelegramNotification()` is being called correctly
- Continue to **section-09-integration** to verify end-to-end notification flow

## File Summary

| File | Action | Purpose |
|------|--------|---------|
| `/home/dev/projects/SmartSpecPro/apps/web/server/services/notificationService.ts` | Create | Centralized notification creator |
| `/home/dev/projects/SmartSpecPro/apps/web/server/services/notificationService.test.ts` | Create | Unit tests for notification service |
| `/home/dev/projects/SmartSpecPro/apps/web/server/services/scheduler.ts` | Modify | Replace direct inserts (2 locations) |
| `/home/dev/projects/SmartSpecPro/apps/web/server/routers/follows.ts` | Modify | Replace direct inserts (2 locations) |
| `/home/dev/projects/SmartSpecPro/apps/web/server/routers/mediaJobs.ts` | Modify | Replace direct inserts (2 locations) |

## Database Safety

This section does NOT modify the database schema. However, when refactoring call sites:
- Ensure all existing notification parameters are preserved
- Verify notification IDs are still returned correctly (many call sites use the returned ID for follow-up actions)
- Check that any downstream code expecting the old return format (`[{ id }]` from `.returning()`) is updated to use the new format (`{ notificationId }`)
---

## Implementation Notes

**Completed:** 2026-02-08

### Files Created
- `apps/web/server/services/notificationService.ts` — centralized notification service with createNotification()
- `apps/web/server/services/notificationService.test.ts` — comprehensive test suite (7 tests)
- `apps/web/server/services/telegramService.ts` — stub for Telegram delivery (section-03)

### Files Modified
- `apps/web/server/routers/mediaJobs.ts` — refactored 2 notification call sites
- `apps/web/server/routers/follows.ts` — refactored 2 notification call sites
- `apps/web/server/services/scheduler.ts` — refactored 2 notification call sites

### Test Results
All 7 tests passing:
- ✓ inserts into user_notifications with correct fields
- ✓ returns the inserted notification ID
- ✓ calls enqueueTelegramNotification after DB insert
- ✓ does not fail if enqueueTelegramNotification throws
- ✓ passes priority through to Telegram enqueue
- ✓ handles optional fields (conversationId, scheduledMessageId)
- ✓ defaults priority to normal when not provided

### Verification
- Fire-and-forget pattern working correctly (Telegram failures logged but not thrown)
- All 6 notification insertion points now use createNotification()
- Priority levels properly assigned (high for job failures/friends, critical for urgent messages, normal for others)
- Tests demonstrate proper chainable mock pattern for Drizzle ORM

Commit: 7ac1e7c
