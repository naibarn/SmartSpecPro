# Implementation Plan: Telegram Alert Notifications

## 1. Overview

### What We're Building

A Telegram Bot notification channel for SmartSpecPro. When the system creates a notification (scheduled reminder, urgent alert, system event), it will automatically send a formatted message to users who have linked their Telegram account — filtered by the user's chosen notification level.

### Why This Approach

SmartSpecPro already has a notification system (`user_notifications` table, BullMQ-based scheduler, email delivery). This plan extends it with Telegram as an additional delivery channel, following the same patterns used for SMTP email and SMS.

Key decisions:
- **Node.js BullMQ** for notification delivery (matches existing scheduler queue pattern)
- **Python FastAPI webhook** for account verification only (already has a standalone HTTP server)
- **Deep link verification** to link Telegram `chat_id` to user accounts (no Telegram Login Widget needed)
- **system_settings** for admin-configured bot token (encrypted, same pattern as SMTP/SMS credentials)
- **HTML parse mode** for message formatting (simpler and more reliable than MarkdownV2)
- **Global bot** — single bot configuration for the entire platform (not per-tenant)
- **Small scale** design (< 100 linked users)

### Architecture

```
NOTIFICATION DELIVERY (Node.js)
────────────────────────────────
createNotification() — centralized wrapper
  └─► INSERT user_notifications
  └─► enqueue to "telegram-notifications" BullMQ queue (if user linked + priority matches)
        └─► Worker: POST api.telegram.org/bot{token}/sendMessage

ACCOUNT VERIFICATION (Python)
────────────────────────────────
Web App (Node.js)                Python FastAPI
  │ Generate code (CSPRNG)        │
  │ Store in Redis (5min TTL)     │
  │ Return deep link to user      │
  │                               │
  │   User clicks deep link ──►  │ POST /webhook/telegram
  │                               │   validate secret header
  │                               │   validate /start {code}
  │                               │   validate private chat only
  │                               │   lookup code in Redis
  │                               │   UPDATE users SET chatId, verified, username (single stmt)
  │                               │   Send confirmation via Bot API
  │   Poll verification status    │   Delete code from Redis
  │   Show "Linked!" ◄───────── │
```

---

## 2. Database Schema Changes

### 2.1 Pre-Migration: Fix Schema Drift

**Important:** The codebase has an existing schema drift — `passwordChangedAt` column exists in the database (via migration `0010_add_password_changed_at.sql`) but is NOT defined in `apps/web/drizzle/schema.ts`. Before generating a new migration, add `passwordChangedAt` to the users table definition in `schema.ts` to prevent `drizzle-kit generate` from attempting to drop it.

### 2.2 Users Table — New Columns

Add four columns to the `users` table in `apps/web/drizzle/schema.ts`:

```typescript
telegramChatId: varchar("telegramChatId", { length: 64 })
telegramUsername: varchar("telegramUsername", { length: 64 })
telegramVerified: boolean("telegramVerified").default(false).notNull()
telegramVerifiedAt: timestamp("telegramVerifiedAt", { withTimezone: true })
```

These follow the existing pattern of `phone`/`phoneVerified` and `backupEmail`/`backupEmailVerified`.

### 2.3 User Preferences Type Extension

Extend the `userPreferences` JSON type definition to include Telegram notification level:

```typescript
userPreferences: json("userPreferences").$type<{
  translationLanguage?: string;
  translationModel?: string;
  telegramNotifyLevel?: "all" | "high_critical" | "critical_only" | "off";
  telegramDeliveryFailing?: boolean;
}>().default({})
```

Note: `telegramConsecutiveFailures` is tracked in Redis (not JSON) to avoid race conditions — see Section 8.2.

### 2.4 System Settings Entries

New entries in `system_settings` table under `category: "telegram"`:

| Key | isSensitive | Description |
|-----|-------------|-------------|
| `bot_token` | true | Telegram Bot API token (encrypted) |
| `bot_username` | false | Bot username (for deep link generation) |
| `webhook_secret` | true | Secret for validating incoming webhook requests |
| `app_url` | false | Base URL for "View in SmartSpecPro" inline buttons |
| `enabled` | false | "true"/"false" — master toggle for Telegram notifications |

**Important:** The `settingCategorySchema` in `apps/web/server/routers/systemSettings.ts` (line 17) must be updated to include `"telegram"`:

```typescript
const settingCategorySchema = z.enum(["stripe", "invoice", "email", "general", "oauth", "ai", "telegram"]);
```

No new tables needed. A Drizzle migration must be generated and applied for the `users` table column additions.

---

## 3. Centralized Notification Creator

### 3.1 The Problem

There are 6 places in the codebase that insert into `user_notifications`:
1. `scheduler.ts` line 85 — simple reminder
2. `scheduler.ts` line 224 — LLM-powered alert
3. `follows.ts` line 90 — follow notification
4. `follows.ts` line 379 — follow notification
5. `mediaJobs.ts` line 111 — media job failure
6. `mediaJobs.ts` line 126 — admin alert for media job failure

### 3.2 Solution: `createNotification()` Wrapper

Create a centralized function in `apps/web/server/services/notificationService.ts`:

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

This function:
1. Inserts into `user_notifications` (existing behavior)
2. Calls `enqueueTelegramNotification()` (new behavior)

All 6 call sites should be refactored to use this wrapper. This ensures every notification created — regardless of source — is eligible for Telegram delivery.

---

## 4. Admin Configuration (Backend)

### 4.1 tRPC Router

Create a new `apps/web/server/routers/telegram.ts` with both admin and user endpoints. Register it in `appRouter` at `apps/web/server/routers.ts`.

**Admin endpoints** (use `adminProcedure`):

```
getTelegramSettings: adminProcedure → query
  Returns: { botToken (masked), botUsername, webhookSecret (masked), appUrl, enabled }

updateTelegramSettings: adminProcedure → mutation
  Input: { botToken?, botUsername?, appUrl?, enabled? }
  Encrypts botToken if provided, stores in system_settings category "telegram"
  Calls clearTelegramCache() after successful update

testTelegramConnection: adminProcedure → mutation
  Calls Telegram Bot API getMe endpoint with stored token
  Returns: { success, botInfo: { username, firstName } }

registerWebhook: adminProcedure → mutation
  Calls Telegram Bot API setWebhook with configured URL + webhook_secret
  Returns: { success, message }
```

### 4.2 Webhook Secret Generation

When admin first saves Telegram settings, auto-generate a `webhook_secret` using `crypto.randomBytes(32).toString('hex')`. This secret is:
- Stored encrypted in `system_settings`
- Sent to Telegram via `setWebhook` API's `secret_token` parameter
- Validated on every incoming webhook request via `X-Telegram-Bot-Api-Secret-Token` header

### 4.3 Cache Pattern

Follow the existing SMS cache pattern: maintain module-level cached settings, provide a `clearTelegramCache()` function called from `updateTelegramSettings`. Do NOT use time-based cache refresh.

---

## 5. Telegram Webhook (Python FastAPI)

### 5.1 New Endpoint

Add `POST /webhook/telegram` to the Python FastAPI app.

**Middleware exemption:** This endpoint MUST be excluded from CSRF protection and JWT authentication middleware. It cannot carry session cookies or CSRF tokens — the webhook secret header is the sole authentication mechanism.

**Request flow:**
1. Validate `X-Telegram-Bot-Api-Secret-Token` header matches stored `webhook_secret`
2. Parse incoming `Update` object
3. **Validate private chat:** Check `message.chat.type === "private"`. Reject group/channel/supergroup messages with 200 OK (ignore).
4. If message text starts with `/start `:
   - Extract verification code from message
   - Validate code format: must match `[a-f0-9]{32}` (32 hex chars)
   - Check brute-force limits (Redis counter `telegram:attempts:{chat_id}`, max 5/hour)
   - Look up `telegram:verify:{code}` in Redis
   - Check per-code attempt count (max 3 before deletion)
   - If valid: **single UPDATE statement** setting `telegramChatId`, `telegramUsername` (from `message.from.username`), `telegramVerified = true`, `telegramVerifiedAt = now()`
   - Send confirmation message to chat via Bot API `sendMessage`
   - Delete code from Redis
5. For all other messages: respond with 200 OK (ignore)

### 5.2 Database Access

The Python backend already has SQLAlchemy 2 configured and can query the same PostgreSQL database. It needs:
- Read access to `system_settings` for webhook secret (use `smartspecweb_crypto.py` for decryption)
- Write access to `users` table for setting Telegram columns
- Redis access for verification code lookup/deletion (already configured)

### 5.3 Bot API Client

A minimal helper function that calls `POST https://api.telegram.org/bot{token}/sendMessage`. No library needed — just `httpx.AsyncClient` (already a dependency) with the JSON payload.

### 5.4 Registration

Register the webhook router in `python-backend/app/main.py`. Ensure it's excluded from any global auth/CSRF middleware.

---

## 6. User Account Linking (Node.js + Frontend)

### 6.1 tRPC Endpoints for Linking

In the new `telegram.ts` router:

```
generateTelegramLink: protectedProcedure → mutation
  1. Generate 32-char code: crypto.randomBytes(16).toString('hex')  (128 bits entropy)
  2. Store in Redis: SET telegram:verify:{code} {userId, createdAt, attempts:0} EX 300
  3. Fetch bot_username from system_settings
  4. Return { code, deepLink: "https://t.me/{bot_username}?start={code}", expiresIn: 300 }

checkTelegramStatus: protectedProcedure → query
  Returns: { linked: boolean, username?: string, verifiedAt?: Date, notifyLevel: string, deliveryFailing: boolean }
  Note: check telegramVerified === true as canonical signal (not just chatId presence)

unlinkTelegram: protectedProcedure → mutation
  SET users.telegramChatId = null, telegramUsername = null, telegramVerified = false, telegramVerifiedAt = null
  Clear telegramNotifyLevel and telegramDeliveryFailing in userPreferences
  Delete Redis key telegram:failures:{userId}

updateTelegramPreferences: protectedProcedure → mutation
  Input: { notifyLevel: "all" | "high_critical" | "critical_only" | "off" }
  Update users.userPreferences.telegramNotifyLevel
```

### 6.2 Frontend — Settings Page Section

Add a "Telegram Notifications" section to the existing user Settings page. The section shows different states:

**State 1: Not Linked**
- Heading: "Telegram Notifications"
- Description: "Link your Telegram account to receive notifications"
- Button: "Link Telegram Account"
- On click: calls `generateTelegramLink`, shows clickable deep link
- Polls `checkTelegramStatus` using TanStack Query `refetchInterval` (3 seconds), with function returning `false` to stop once `linked === true`
- Auto-stops polling after 5 minutes (code expired)

**State 2: Linking In Progress**
- Shows deep link + instructions: "Open Telegram and click this link to connect your account"
- Loading spinner
- Cancel button (stops polling, clears UI)

**State 3: Just Linked (first time)**
- Shows success message: "Connected to @{username}!"
- **Immediately shows notification level selector** — prompt user to choose level before dismissing
- Default pre-selection: "High + Critical" (not "off", to ensure user gets value immediately)
- Save button

**State 4: Linked (returning)**
- Shows: "Connected to Telegram as @{username}" with green check
- Notification level dropdown: All / High + Critical / Critical Only / Off
- Unlink button (with confirmation dialog)
- If `deliveryFailing`: warning banner "Recent notifications failed to deliver. Check that you haven't blocked the bot."

---

## 7. Notification Delivery Service (Node.js)

### 7.1 Telegram Service Module

New file: `apps/web/server/services/telegramService.ts`

**Core functions:**

```typescript
function formatTelegramMessage(notification: {
  title: string; content: string; priority: string; createdAt: Date;
}): { text: string; replyMarkup: object }
  /** Formats notification into HTML with priority emoji and inline button */

function escapeHtml(text: string): string
  /** Escapes <, >, & for Telegram HTML parse mode */

function sendTelegramMessage(botToken: string, chatId: string, text: string, parseMode: string, replyMarkup?: object): Promise<{ ok: boolean; messageId?: number }>
  /** Calls Telegram Bot API sendMessage endpoint via fetch() */

async function enqueueTelegramNotification(userId: number, notification: {...}): Promise<void>
  /** Checks eligibility (linked, verified, priority match, enabled) and enqueues job */

function clearTelegramCache(): void
  /** Clears cached bot settings, called after admin updates */
```

**HTML parse mode** (instead of MarkdownV2 — simpler escaping, only `<`, `>`, `&`):

**Priority emoji mapping:** critical=🔴, high=🟠, normal=🔵, low=⚪

**Message template (HTML):**
```html
{emoji} <b>{escaped_title}</b>

{escaped_content}

<i>{formatted_timestamp}</i>
```

**Inline keyboard:** Single button `[{ text: "View in SmartSpecPro", url: "{app_url}/notifications" }]`

Content truncated to 4000 chars (Telegram limit is 4096).

### 7.2 BullMQ Queue

New queue: `telegram-notifications`

```typescript
// Queue configuration
name: "telegram-notifications"
defaultJobOptions: {
  attempts: 3,
  backoff: { type: "exponential", delay: 2000 },
  removeOnComplete: { count: 200 },
  removeOnFail: { count: 100 },
}

// Worker configuration
concurrency: 5
limiter: { max: 25, duration: 1000 }  // 25 msg/sec (conservative, below Telegram's 30)
```

**Separate Redis connection** from the scheduler queue (isolates failure domains). Add `shutdownTelegramWorker()` to the graceful shutdown sequence alongside existing `shutdownScheduler()` in `_core/index.ts`.

**Job data shape:**
```typescript
interface TelegramJobData {
  userId: number;
  chatId: string;
  notificationId: number;
  title: string;
  content: string;
  priority: string;
  createdAt: string;
}
```

**Worker logic:**
1. Load bot token + app_url from cached settings (cleared by `clearTelegramCache()`)
2. Format message with `formatTelegramMessage()`
3. Call `sendTelegramMessage()`
4. On success: log, check if user had failures → reset Redis counter + clear `deliveryFailing` flag
5. On 429: `worker.rateLimit(retryAfter * 1000)`, throw `Worker.RateLimitError()`
6. On "bot was blocked": increment Redis counter `telegram:failures:{userId}` via INCR; if >= 5, set `userPreferences.telegramDeliveryFailing = true`
7. On other error: throw (triggers BullMQ retry)

### 7.3 Integration Points

The centralized `createNotification()` wrapper (Section 3) handles the integration. The `enqueueTelegramNotification` function within it:
1. Fetch user's `telegramChatId`, `telegramVerified`, `userPreferences` from DB
2. Check `telegramVerified === true` (canonical signal)
3. Check notification priority against `telegramNotifyLevel`:
   - `"all"`: send for all priorities
   - `"high_critical"`: send only for high + critical
   - `"critical_only"`: send only for critical
   - `"off"` or undefined: don't send
4. Check `system_settings` telegram `enabled` is "true"
5. If all checks pass: `telegramQueue.add("send", jobData, { priority })`

Priority mapping for BullMQ: critical=1, high=3, normal=5, low=7.

### 7.4 Queue Initialization

Add queue + worker initialization to `apps/web/server/_core/index.ts`, after the scheduler initialization (line ~260) and after Redis is confirmed available. Add graceful shutdown handler alongside existing SIGTERM/SIGINT handlers (line ~311).

---

## 8. Admin UI

### 8.1 AdminSettings.tsx — Telegram Tab

Add a new tab to the existing `AdminSettings.tsx`:

**Tab trigger:** "Telegram Bot"

**Tab content:**
- **Bot Token** — password input with show/hide toggle, same pattern as SMTP password
- **Bot Username** — text input (e.g., `SmartSpecProBot`), used for deep links
- **App URL** — text input, base URL for inline buttons (e.g., `https://app.smartspecpro.com`)
- **Enable/Disable** — toggle switch
- **Test Connection** button — calls `testTelegramConnection`, shows bot info on success
- **Register Webhook** button — calls `registerWebhook`, confirms webhook is set

Follow the exact UI pattern of the existing SMTP settings tab (masked sensitive values, save button, test button, useEffect for loading).

---

## 9. Error Handling & Failure Recovery

### 9.1 Delivery Failures

| Error Type | Handling |
|-----------|---------|
| 429 Too Many Requests | `worker.rateLimit()` with Telegram's `retry-after` value |
| Bot blocked by user | Increment Redis `telegram:failures:{userId}` via INCR |
| Invalid chat_id | Log error, increment failures |
| Network error | BullMQ auto-retry (3 attempts, exponential backoff) |
| Bot token invalid | Log critical error, all jobs fail until admin fixes token |
| Telegram API down | BullMQ retry handles transient outages |

### 9.2 Failure Tracking (Redis-Based)

Use Redis key `telegram:failures:{userId}` with atomic INCR to track consecutive failures. This avoids the race condition that would occur with JSON column updates when multiple jobs fail simultaneously.

When counter reaches 5:
- Set `userPreferences.telegramDeliveryFailing = true` in DB
- Frontend shows warning banner in Telegram settings section

On next successful delivery:
- `DEL telegram:failures:{userId}`
- Set `userPreferences.telegramDeliveryFailing = false`

On unlink:
- `DEL telegram:failures:{userId}`

### 9.3 Graceful Degradation

Telegram delivery is fire-and-forget from the notification creator's perspective. If the queue is unavailable (Redis down), log the error and continue — the in-app notification is the primary channel.

---

## 10. File Change Summary

### New Files

| File | Purpose |
|------|---------|
| `apps/web/server/services/telegramService.ts` | Telegram Bot API client, message formatting, queue, cache |
| `apps/web/server/services/notificationService.ts` | Centralized `createNotification()` wrapper |
| `apps/web/server/routers/telegram.ts` | tRPC router for user linking, preferences, admin settings |
| `python-backend/app/api/telegram_webhook.py` | FastAPI webhook endpoint for /start verification |
| `apps/web/drizzle/XXXX_add_telegram_columns.sql` | Migration for users table changes |

### Modified Files

| File | Changes |
|------|---------|
| `apps/web/drizzle/schema.ts` | Fix `passwordChangedAt` drift; add `telegramChatId`, `telegramUsername`, `telegramVerified`, `telegramVerifiedAt` to users; extend `userPreferences` type |
| `apps/web/server/routers/systemSettings.ts` | Add `"telegram"` to `settingCategorySchema` |
| `apps/web/server/routers.ts` | Register `telegramRouter` in `appRouter` |
| `apps/web/server/services/scheduler.ts` | Replace `db.insert(userNotifications)` calls with `createNotification()` |
| `apps/web/server/routers/follows.ts` | Replace `db.insert(userNotifications)` calls with `createNotification()` |
| `apps/web/server/routers/mediaJobs.ts` | Replace `db.insert(userNotifications)` calls with `createNotification()` |
| `apps/web/server/_core/index.ts` | Initialize Telegram queue/worker; add shutdown handler |
| `apps/web/client/src/pages/AdminSettings.tsx` | Add "Telegram Bot" tab |
| `apps/web/client/src/pages/Settings.tsx` | Add "Telegram Notifications" section (find exact file path during implementation) |
| `python-backend/app/main.py` | Register telegram webhook router; exclude from CSRF/auth middleware |

### No Changes Needed

- `GlobalAlerts.tsx` — notification display is unchanged
- `scheduled_messages` table — no schema changes
- `user_notifications` table — no schema changes
- Celery configuration — not involved in delivery

---

## 11. Testing Strategy

### TypeScript Tests (Vitest)

| Test File | What to Test |
|-----------|-------------|
| `server/services/telegramService.test.ts` | HTML escaping edge cases, message formatting, priority filtering, inline keyboard structure, `enqueueTelegramNotification` eligibility checks |
| `server/services/notificationService.test.ts` | `createNotification()` wrapper inserts to DB and enqueues Telegram |
| `server/routers/telegram.test.ts` | Link generation, status checks, unlink flow, preference updates, admin settings CRUD |

### Python Tests (pytest)

| Test File | What to Test |
|-----------|-------------|
| `tests/test_telegram_webhook.py` | Webhook secret validation, /start code verification, private chat enforcement, brute force limits, Redis code cleanup |

### Mocking Strategy

- Mock `fetch()` / `httpx` for Telegram Bot API calls (never call real API in tests)
- Mock Redis for verification code operations
- Mock DB for user queries and updates

---

## 12. Implementation Order

1. **Schema + Migration** — Fix `passwordChangedAt` drift, add Telegram columns, generate migration, apply
2. **Centralized Notification Service** — `notificationService.ts` with `createNotification()` wrapper
3. **Telegram Service** — `telegramService.ts` with formatting, API client, queue, cache
4. **Admin Backend** — Telegram endpoints in `telegram.ts`, update `settingCategorySchema`
5. **Admin UI** — Telegram tab in AdminSettings
6. **Webhook (Python)** — FastAPI endpoint with CSRF/auth exemption
7. **User Backend** — Linking, status, unlink, preferences endpoints in `telegram.ts`
8. **User UI** — Settings page section with link/unlink/preferences
9. **Integration** — Refactor all 6 notification insertion sites to use `createNotification()`
10. **Testing** — Unit tests for formatting, integration tests for queue and webhook
