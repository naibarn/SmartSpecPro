Now I'll generate the complete content for section-03-telegram-service. Let me extract the relevant information from the files and create a comprehensive, self-contained section.

# Section 03: Telegram Service

## Overview

This section implements the core Telegram notification delivery service in Node.js. It provides message formatting, Bot API client, eligibility filtering, and BullMQ queue/worker infrastructure for reliable async delivery.

**Dependencies:**
- Section 01 (schema-migration) must be complete — requires `telegramChatId`, `telegramVerified`, `telegramVerifiedAt` columns in users table
- No other section dependencies — this can be implemented in parallel with section-02

**What this enables:**
- Section 04 (admin-backend) — admin endpoints will call `clearTelegramCache()`
- Section 06 (user-backend) — user linking flow depends on this service
- Section 09 (integration) — `createNotification()` wrapper will call `enqueueTelegramNotification()`

---

## Tests First

### Test File Location
`apps/web/server/services/telegramService.test.ts`

### Test Suite Structure

```typescript
// escapeHtml tests
describe('escapeHtml', () => {
  test('escapes < to &lt;')
  test('escapes > to &gt;')
  test('escapes & to &amp;')
  test('preserves normal text without escaping')
  test('handles empty string')
  test('handles text with multiple special chars: "Price < $10 & > $5"')
})

// formatTelegramMessage tests
describe('formatTelegramMessage', () => {
  test('includes priority emoji (🔴 for critical, 🟠 for high, 🔵 for normal, ⚪ for low)')
  test('wraps title in <b> tags')
  test('wraps timestamp in <i> tags')
  test('escapes HTML special characters in title and content')
  test('truncates content to 4000 chars')
  test('includes inline keyboard with "View in SmartSpecPro" button and correct URL')
  test('sets parse_mode to "HTML"')
})

// sendTelegramMessage tests
describe('sendTelegramMessage', () => {
  test('sends POST to api.telegram.org/bot{token}/sendMessage with correct payload')
  test('returns { ok: true, messageId } on success')
  test('throws on HTTP 429 with retry-after info')
  test('throws on "bot was blocked" error')
  test('throws on network error')
  test('includes reply_markup when provided')
  test('sets timeout on fetch request')
})

// enqueueTelegramNotification tests
describe('enqueueTelegramNotification', () => {
  test('enqueues job when user is verified and priority matches "all" level')
  test('enqueues job when priority is "high" and level is "high_critical"')
  test('does NOT enqueue when priority is "normal" and level is "high_critical"')
  test('does NOT enqueue when user is not verified')
  test('does NOT enqueue when Telegram feature is disabled (system_settings)')
  test('does NOT enqueue when telegramNotifyLevel is "off"')
  test('does NOT enqueue when telegramNotifyLevel is undefined')
  test('sets BullMQ priority: critical=1, high=3, normal=5, low=7')
  test('silently logs error if Redis/queue is unavailable (fire-and-forget)')
})

// clearTelegramCache tests
describe('clearTelegramCache', () => {
  test('after clearing, next call to enqueueTelegramNotification re-reads system_settings')
})

// Worker tests
describe('Telegram Worker', () => {
  test('worker processes job and calls sendTelegramMessage with formatted content')
  test('worker resets failure counter on successful delivery')
  test('worker calls worker.rateLimit() on 429 response and throws RateLimitError')
  test('worker increments Redis telegram:failures:{userId} on "bot was blocked"')
  test('worker sets telegramDeliveryFailing=true when failure count reaches 5')
  test('worker clears telegramDeliveryFailing on successful delivery after failures')
  test('worker throws on other errors (triggers BullMQ retry)')
})
```

### Mocking Strategy

```typescript
// Mock fetch for Bot API calls
vi.mock('node:fetch', () => ({
  default: vi.fn()
}))

// Mock Redis
const mockRedis = {
  incr: vi.fn(),
  del: vi.fn(),
  get: vi.fn(),
  set: vi.fn()
}

// Mock database
const mockDb = {
  select: vi.fn().mockReturnThis(),
  from: vi.fn().mockReturnThis(),
  where: vi.fn().mockReturnThis(),
  update: vi.fn().mockReturnThis(),
  set: vi.fn().mockReturnThis()
}

// Mock BullMQ queue
const mockQueue = {
  add: vi.fn(),
  close: vi.fn()
}
```

---

## Implementation Details

### File to Create

**Path:** `/home/dev/projects/SmartSpecPro/apps/web/server/services/telegramService.ts`

### Module Structure

```typescript
import { Queue, Worker, Job } from "bullmq";
import type { DrizzleDB } from "@/server/_core/db";
import { encrypt, decrypt } from "@/server/utils/crypto";
import { users, systemSettings } from "@/drizzle/schema";
import { eq, and } from "drizzle-orm";

// Types
interface TelegramJobData {
  userId: number;
  chatId: string;
  notificationId: number;
  title: string;
  content: string;
  priority: string;
  createdAt: string;
}

interface TelegramSettings {
  botToken: string;
  botUsername: string;
  appUrl: string;
  enabled: boolean;
}

// Module-level cache
let cachedSettings: TelegramSettings | null = null;

// Queue and worker instances
let telegramQueue: Queue<TelegramJobData> | null = null;
let telegramWorker: Worker<TelegramJobData> | null = null;
```

### Core Functions

#### 1. HTML Escaping

```typescript
/**
 * Escapes HTML special characters for Telegram HTML parse mode.
 * Only three characters need escaping: <, >, &
 */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
```

#### 2. Message Formatting

```typescript
/**
 * Formats notification into Telegram HTML message with priority emoji and inline button.
 * 
 * @param notification - Notification data with title, content, priority, createdAt
 * @param appUrl - Base URL for inline button (from system_settings)
 * @returns Object with text (HTML formatted), parseMode, and replyMarkup (inline keyboard)
 */
export function formatTelegramMessage(
  notification: {
    title: string;
    content: string;
    priority: string;
    createdAt: Date;
  },
  appUrl: string
): { text: string; parseMode: string; replyMarkup: object } {
  // Priority emoji mapping
  const emojiMap: Record<string, string> = {
    critical: '🔴',
    high: '🟠',
    normal: '🔵',
    low: '⚪'
  };
  
  const emoji = emojiMap[notification.priority] || '🔵';
  
  // Format timestamp
  const timestamp = notification.createdAt.toLocaleString('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short'
  });
  
  // Escape HTML special characters
  const escapedTitle = escapeHtml(notification.title);
  const escapedContent = escapeHtml(notification.content);
  
  // Build message (Telegram limit is 4096 chars, use 4000 for safety)
  let text = `${emoji} <b>${escapedTitle}</b>\n\n${escapedContent}\n\n<i>${timestamp}</i>`;
  
  if (text.length > 4000) {
    text = text.substring(0, 3997) + '...';
  }
  
  // Inline keyboard with "View in SmartSpecPro" button
  const replyMarkup = {
    inline_keyboard: [
      [
        {
          text: 'View in SmartSpecPro',
          url: `${appUrl}/notifications`
        }
      ]
    ]
  };
  
  return {
    text,
    parseMode: 'HTML',
    replyMarkup
  };
}
```

#### 3. Bot API Client

```typescript
/**
 * Sends message via Telegram Bot API.
 * 
 * @param botToken - Bot token from system_settings (decrypted)
 * @param chatId - User's Telegram chat ID
 * @param text - Message text (HTML formatted)
 * @param parseMode - "HTML" or "MarkdownV2"
 * @param replyMarkup - Optional inline keyboard
 * @returns Success status and message ID
 * @throws Error on API failure (429, bot blocked, network error)
 */
export async function sendTelegramMessage(
  botToken: string,
  chatId: string,
  text: string,
  parseMode: string,
  replyMarkup?: object
): Promise<{ ok: boolean; messageId?: number }> {
  const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
  
  const payload: any = {
    chat_id: chatId,
    text,
    parse_mode: parseMode
  };
  
  if (replyMarkup) {
    payload.reply_markup = replyMarkup;
  }
  
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10000) // 10s timeout
    });
    
    const data = await response.json();
    
    if (!response.ok) {
      // Check for specific error codes
      if (response.status === 429) {
        const retryAfter = data.parameters?.retry_after || 30;
        const error = new Error(`Rate limited by Telegram API`);
        (error as any).retryAfter = retryAfter;
        (error as any).statusCode = 429;
        throw error;
      }
      
      if (data.description?.includes('bot was blocked')) {
        const error = new Error('Bot was blocked by user');
        (error as any).statusCode = 403;
        (error as any).blocked = true;
        throw error;
      }
      
      throw new Error(`Telegram API error: ${data.description || response.statusText}`);
    }
    
    return {
      ok: true,
      messageId: data.result?.message_id
    };
  } catch (err) {
    if (err instanceof Error && 'retryAfter' in err) {
      throw err; // Rethrow 429 with retry info
    }
    if (err instanceof Error && 'blocked' in err) {
      throw err; // Rethrow "bot blocked" error
    }
    throw new Error(`Network error calling Telegram API: ${err instanceof Error ? err.message : String(err)}`);
  }
}
```

#### 4. Settings Cache

```typescript
/**
 * Loads Telegram settings from system_settings table.
 * Results are cached in module-level variable.
 * Call clearTelegramCache() to force reload (e.g., after admin updates settings).
 */
async function getTelegramSettings(db: DrizzleDB): Promise<TelegramSettings | null> {
  if (cachedSettings) {
    return cachedSettings;
  }
  
  const settings = await db
    .select()
    .from(systemSettings)
    .where(eq(systemSettings.category, 'telegram'));
  
  const settingsMap = new Map(
    settings.map(s => [s.key, s.value])
  );
  
  const enabled = settingsMap.get('enabled') === 'true';
  if (!enabled) {
    return null;
  }
  
  const botTokenEncrypted = settingsMap.get('bot_token');
  const botUsername = settingsMap.get('bot_username');
  const appUrl = settingsMap.get('app_url');
  
  if (!botTokenEncrypted || !botUsername || !appUrl) {
    console.warn('[Telegram] Missing required settings');
    return null;
  }
  
  const botToken = decrypt(botTokenEncrypted);
  
  cachedSettings = {
    botToken,
    botUsername,
    appUrl,
    enabled: true
  };
  
  return cachedSettings;
}

/**
 * Clears cached Telegram settings.
 * Called after admin updates settings in system_settings.
 */
export function clearTelegramCache(): void {
  cachedSettings = null;
}
```

#### 5. Eligibility Check & Enqueue

```typescript
/**
 * Checks if notification should be delivered via Telegram and enqueues job if eligible.
 * 
 * Eligibility criteria:
 * - Telegram feature enabled in system_settings
 * - User has telegramVerified === true
 * - Notification priority matches user's telegramNotifyLevel preference
 * 
 * This function is fire-and-forget — failures are logged but don't throw.
 */
export async function enqueueTelegramNotification(
  db: DrizzleDB,
  userId: number,
  notification: {
    notificationId: number;
    title: string;
    content: string;
    priority: string;
    createdAt: Date;
  }
): Promise<void> {
  try {
    // Check if Telegram is enabled
    const settings = await getTelegramSettings(db);
    if (!settings) {
      return; // Feature disabled or not configured
    }
    
    // Fetch user's Telegram info and preferences
    const [user] = await db
      .select({
        telegramChatId: users.telegramChatId,
        telegramVerified: users.telegramVerified,
        userPreferences: users.userPreferences
      })
      .from(users)
      .where(eq(users.id, userId));
    
    if (!user || !user.telegramVerified || !user.telegramChatId) {
      return; // User not linked or not verified
    }
    
    const prefs = user.userPreferences || {};
    const notifyLevel = prefs.telegramNotifyLevel;
    
    // Check notification level filter
    if (!notifyLevel || notifyLevel === 'off') {
      return; // User disabled Telegram notifications
    }
    
    const priority = notification.priority.toLowerCase();
    
    if (notifyLevel === 'critical_only' && priority !== 'critical') {
      return;
    }
    
    if (notifyLevel === 'high_critical' && !['high', 'critical'].includes(priority)) {
      return;
    }
    
    // All checks passed — enqueue job
    if (!telegramQueue) {
      console.error('[Telegram] Queue not initialized');
      return;
    }
    
    // Map priority to BullMQ job priority (lower number = higher priority)
    const priorityMap: Record<string, number> = {
      critical: 1,
      high: 3,
      normal: 5,
      low: 7
    };
    const jobPriority = priorityMap[priority] || 5;
    
    const jobData: TelegramJobData = {
      userId,
      chatId: user.telegramChatId,
      notificationId: notification.notificationId,
      title: notification.title,
      content: notification.content,
      priority: notification.priority,
      createdAt: notification.createdAt.toISOString()
    };
    
    await telegramQueue.add('send', jobData, {
      priority: jobPriority,
      removeOnComplete: { count: 200 },
      removeOnFail: { count: 100 }
    });
    
    console.log(`[Telegram] Enqueued notification ${notification.notificationId} for user ${userId}`);
  } catch (err) {
    // Fire-and-forget — log error but don't throw
    console.error('[Telegram] Failed to enqueue notification:', err);
  }
}
```

#### 6. Queue & Worker Initialization

```typescript
/**
 * Initializes BullMQ queue and worker for Telegram notifications.
 * 
 * Queue configuration:
 * - Separate Redis connection (isolates failure domains)
 * - 3 retries with exponential backoff
 * - Rate limit: 25 messages/second (conservative, below Telegram's 30/sec limit)
 * - Concurrency: 5
 * 
 * Worker error handling:
 * - 429 (rate limit): calls worker.rateLimit() with Telegram's retry-after value
 * - Bot blocked: increments failure counter, sets deliveryFailing flag after 5 failures
 * - Other errors: throws (triggers BullMQ retry)
 */
export async function initializeTelegramQueue(
  db: DrizzleDB,
  redisConfig: { host: string; port: number; password?: string }
): Promise<void> {
  telegramQueue = new Queue<TelegramJobData>('telegram-notifications', {
    connection: redisConfig,
    defaultJobOptions: {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 2000
      },
      removeOnComplete: { count: 200 },
      removeOnFail: { count: 100 }
    }
  });
  
  telegramWorker = new Worker<TelegramJobData>(
    'telegram-notifications',
    async (job: Job<TelegramJobData>) => {
      const { userId, chatId, title, content, priority, createdAt, notificationId } = job.data;
      
      // Load bot token and app URL
      const settings = await getTelegramSettings(db);
      if (!settings) {
        throw new Error('Telegram settings not available');
      }
      
      // Format message
      const { text, parseMode, replyMarkup } = formatTelegramMessage(
        {
          title,
          content,
          priority,
          createdAt: new Date(createdAt)
        },
        settings.appUrl
      );
      
      try {
        // Send message via Bot API
        const result = await sendTelegramMessage(
          settings.botToken,
          chatId,
          text,
          parseMode,
          replyMarkup
        );
        
        console.log(`[Telegram] Sent notification ${notificationId} to user ${userId}, message_id: ${result.messageId}`);
        
        // Check if user had previous failures — if so, reset counter
        const redis = (telegramWorker as any).redisClient; // Access worker's Redis connection
        const failureKey = `telegram:failures:${userId}`;
        const failureCount = await redis.get(failureKey);
        
        if (failureCount && parseInt(failureCount) > 0) {
          await redis.del(failureKey);
          
          // Clear deliveryFailing flag in userPreferences
          const [user] = await db.select({ userPreferences: users.userPreferences }).from(users).where(eq(users.id, userId));
          if (user?.userPreferences?.telegramDeliveryFailing) {
            await db.update(users).set({
              userPreferences: {
                ...user.userPreferences,
                telegramDeliveryFailing: false
              }
            }).where(eq(users.id, userId));
          }
          
          console.log(`[Telegram] Reset failure counter for user ${userId}`);
        }
      } catch (err: any) {
        // Handle rate limiting
        if (err.statusCode === 429) {
          const retryAfter = err.retryAfter || 30;
          await telegramWorker!.rateLimit(retryAfter * 1000);
          throw Worker.RateLimitError;
        }
        
        // Handle bot blocked by user
        if (err.blocked) {
          const redis = (telegramWorker as any).redisClient;
          const failureKey = `telegram:failures:${userId}`;
          const newCount = await redis.incr(failureKey);
          await redis.expire(failureKey, 86400 * 7); // 7 day TTL
          
          console.warn(`[Telegram] Bot blocked by user ${userId}, failure count: ${newCount}`);
          
          // After 5 consecutive failures, set deliveryFailing flag
          if (newCount >= 5) {
            const [user] = await db.select({ userPreferences: users.userPreferences }).from(users).where(eq(users.id, userId));
            await db.update(users).set({
              userPreferences: {
                ...(user?.userPreferences || {}),
                telegramDeliveryFailing: true
              }
            }).where(eq(users.id, userId));
            
            console.warn(`[Telegram] Set deliveryFailing flag for user ${userId}`);
          }
          
          // Don't retry — user needs to unblock bot
          return;
        }
        
        // Other errors — throw to trigger BullMQ retry
        throw err;
      }
    },
    {
      connection: redisConfig,
      concurrency: 5,
      limiter: {
        max: 25,
        duration: 1000 // 25 messages per second
      }
    }
  );
  
  console.log('[Telegram] Queue and worker initialized');
}

/**
 * Gracefully shuts down Telegram queue and worker.
 * Call this in SIGTERM/SIGINT handler.
 */
export async function shutdownTelegramWorker(): Promise<void> {
  if (telegramWorker) {
    await telegramWorker.close();
    console.log('[Telegram] Worker shut down');
  }
  if (telegramQueue) {
    await telegramQueue.close();
    console.log('[Telegram] Queue closed');
  }
}
```

---

## Integration with Server Core

### File to Modify

**Path:** `/home/dev/projects/SmartSpecPro/apps/web/server/_core/index.ts`

### Changes Required

1. **Import the Telegram service** (add near other service imports, around line 20):

```typescript
import { 
  initializeTelegramQueue, 
  shutdownTelegramWorker 
} from "@/server/services/telegramService";
```

2. **Initialize queue after Redis is available** (add after scheduler initialization, around line 260):

```typescript
// Initialize Telegram notification queue
await initializeTelegramQueue(db, {
  host: process.env.REDIS_HOST || "localhost",
  port: parseInt(process.env.REDIS_PORT || "6379"),
  password: process.env.REDIS_PASSWORD
});
```

3. **Add graceful shutdown handler** (add to existing SIGTERM/SIGINT handlers, around line 311):

```typescript
process.on("SIGTERM", async () => {
  console.log("SIGTERM received, shutting down gracefully...");
  await shutdownScheduler(); // existing
  await shutdownTelegramWorker(); // new
  process.exit(0);
});

process.on("SIGINT", async () => {
  console.log("SIGINT received, shutting down gracefully...");
  await shutdownScheduler(); // existing
  await shutdownTelegramWorker(); // new
  process.exit(0);
});
```

---

## Redis Keys Used

| Key Pattern | Purpose | TTL |
|------------|---------|-----|
| `telegram:failures:{userId}` | Tracks consecutive delivery failures per user | 7 days |

---

## Error Handling Summary

| Error Type | Action |
|-----------|--------|
| 429 Too Many Requests | Call `worker.rateLimit()` with Telegram's `retry-after`, throw `RateLimitError` |
| Bot blocked by user | Increment Redis counter, set `deliveryFailing` flag after 5 failures, don't retry |
| Invalid chat_id | Increment failures, log error |
| Network error | Throw (triggers BullMQ retry — 3 attempts with exponential backoff) |
| Bot token invalid | Throw (all jobs fail until admin fixes token) |
| Telegram API down | Throw (BullMQ retry handles transient outages) |
| Queue unavailable | Log error, don't throw (fire-and-forget from `enqueueTelegramNotification`) |

---

## Configuration Requirements

The following must be present in `system_settings` table (category: "telegram"):

| Key | Required | Description |
|-----|----------|-------------|
| `bot_token` | Yes | Telegram Bot API token (encrypted) |
| `bot_username` | Yes | Bot username (for deep link generation) |
| `app_url` | Yes | Base URL for "View in SmartSpecPro" inline button |
| `enabled` | Yes | "true" or "false" — master toggle |

If any required setting is missing or `enabled` is not "true", `getTelegramSettings()` returns `null` and no notifications are sent.

---

## Testing Commands

```bash
# Run all tests for this service
cd /home/dev/projects/SmartSpecPro/apps/web
pnpm test -- server/services/telegramService.test.ts

# Run with coverage
pnpm test:coverage -- server/services/telegramService.test.ts

# Watch mode during development
pnpm test -- server/services/telegramService.test.ts --watch
```

---

## Implementation Checklist

- [ ] Create `/home/dev/projects/SmartSpecPro/apps/web/server/services/telegramService.ts`
- [ ] Implement `escapeHtml()` function
- [ ] Implement `formatTelegramMessage()` function with priority emoji, HTML escaping, inline keyboard
- [ ] Implement `sendTelegramMessage()` function with fetch, timeout, error handling
- [ ] Implement `getTelegramSettings()` function with module-level cache
- [ ] Implement `clearTelegramCache()` function
- [ ] Implement `enqueueTelegramNotification()` function with eligibility checks
- [ ] Implement `initializeTelegramQueue()` function with BullMQ queue + worker
- [ ] Implement worker logic: format message, send, handle failures, update Redis counters
- [ ] Implement `shutdownTelegramWorker()` function
- [ ] Modify `/home/dev/projects/SmartSpecPro/apps/web/server/_core/index.ts` to initialize queue
- [ ] Modify `/home/dev/projects/SmartSpecPro/apps/web/server/_core/index.ts` to add shutdown handler
- [ ] Create test file `/home/dev/projects/SmartSpecPro/apps/web/server/services/telegramService.test.ts`
- [ ] Write tests for `escapeHtml()` (6 test cases)
- [ ] Write tests for `formatTelegramMessage()` (7 test cases)
- [ ] Write tests for `sendTelegramMessage()` (7 test cases)
- [ ] Write tests for `enqueueTelegramNotification()` (9 test cases)
- [ ] Write tests for `clearTelegramCache()` (1 test case)
- [ ] Write tests for worker logic (7 test cases)
- [ ] Run `pnpm test` and verify all tests pass
- [ ] Verify `pnpm typecheck` passes with no errors

---

## Notes

- **HTML parse mode** is used instead of MarkdownV2 because it requires escaping only 3 characters (`<`, `>`, `&`) vs. 18 for Markdown. This reduces message formatting errors.
- **Rate limiting** is set conservatively at 25 msg/sec (Telegram's limit is 30 msg/sec) to leave headroom for bursts.
- **Failure tracking** uses Redis atomic INCR instead of database JSON column updates to avoid race conditions when multiple jobs fail simultaneously.
- **Fire-and-forget enqueue** ensures that Telegram delivery failures don't break the notification creation flow — in-app notifications are the primary channel.
- **Separate Redis connection** for the Telegram queue isolates it from the scheduler queue — if one has issues, it doesn't affect the other.
- **Graceful shutdown** ensures jobs in progress complete before server terminates.