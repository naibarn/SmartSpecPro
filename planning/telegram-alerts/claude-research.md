# Research Findings: Telegram Alert Notifications

## Part 1: Codebase Analysis

### 1. Notification System Architecture

#### Database Schema

**`user_notifications` table** (`apps/web/drizzle/schema.ts:1884`):
- Fields: `id`, `userId`, `type` (enum: scheduled_message, follow_request, alert, system, direct_message, urgent_message), `title`, `content`, `conversationId`, `scheduledMessageId`, `priority` (enum: low, normal, high, critical), `isRead`, `createdAt`
- Indexes: `(userId, isRead, createdAt)`, `(userId, isRead, priority)`

**`scheduled_messages` table** (`apps/web/drizzle/schema.ts:1766`):
- Stores recurring/one-time scheduled chat prompts
- Supports cron expressions via BullMQ
- `isSimpleReminder` flag (0 credits, skips LLM)
- Priority: low/normal/high/critical
- `emailNotify` boolean
- `bullmqJobId` stored for cancellation

**`users` table** (`apps/web/drizzle/schema.ts:35`):
- `userPreferences` JSON column: `{ translationLanguage?, translationModel? }`
- Contact fields: `email`, `backupEmail`, `backupEmailVerified`, `phone`, `phoneVerified`

#### Notification Creation Flow

In `apps/web/server/services/scheduler.ts`:
1. BullMQ job triggers `executeScheduledJob()`
2. Fetches schedule from DB, checks `isSimpleReminder`
3. If LLM-powered: calls provider, deducts credits
4. Creates `user_notifications` entry:
   ```typescript
   await db.insert(userNotifications).values({
     userId, type: "scheduled_message",
     title: schedule.description || "Reminder",
     content: content.slice(0, 500),
     scheduledMessageId: scheduleId,
     priority: schedule.priority || "normal",
   });
   ```
5. Sends email if `emailNotify` is enabled

#### Frontend Components

1. **`GlobalUrgentAlerts`** — Full-screen modal for urgent DMs, polls every 10s
2. **`GlobalUrgentReminders`** — Full-screen modal for high/critical priority, polls every 10s
3. **`GlobalNotificationBell`** — Top-right bell icon with dropdown, polls every 30s

**tRPC Endpoints** (`apps/web/server/routers/scheduledMessages.ts`):
- `getNotificationCount` — unread count from `user_notifications`
- `getUrgentReminders` — high/critical priority notifications
- `getNotifications` — recent 20 notifications
- `markRead` / `markAllRead`

### 2. Encryption & Settings

#### crypto.ts (`apps/web/server/services/crypto.ts`)

- Algorithm: AES-256-GCM (authenticated encryption)
- Key: SHA-256 hash of `LLM_ENCRYPTION_KEY` env var
- Format: `iv:authTag:ciphertext` (hex-encoded)
- Python compatibility via `app/core/smartspecweb_crypto.py` (same key)

#### system_settings table (`apps/web/drizzle/schema.ts:1591`)

```typescript
pgTable("system_settings", {
  category: varchar("category", { length: 64 }),  // 'stripe', 'email', 'smtp', 'sms', 'oauth', 'ai', etc.
  key: varchar("key", { length: 128 }),
  value: text("value"),          // encrypted if isSensitive=true
  valueJson: json("valueJson"),
  isSensitive: boolean("isSensitive").default(false),
  ...
});
```

**Auto-Encryption Pattern** (`apps/web/server/routers/systemSettings.ts`):
```typescript
const storedValue = update.sensitive ? encrypt(update.value) : update.value;
```

**Retrieval Pattern**:
```typescript
for (const s of settings) {
  if (s.isSensitive && s.value) {
    map[s.key] = decrypt(s.value);
  } else {
    map[s.key] = s.value;
  }
}
```

### 3. Queue/Job System

#### BullMQ (Node.js) — `apps/web/server/services/scheduler.ts`

```typescript
queue = new Queue("chat-alerts", {
  connection: getRedisConnection(),
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: "exponential", delay: 5000 },
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 50 },
  },
});

worker = new Worker("chat-alerts", executeScheduledJob, {
  connection: getRedisConnection(),
  concurrency: 3,
});
```

- Recurring: `queue.upsertJobScheduler()` with cron pattern
- One-time: `queue.add()` with delay
- Cancellation: `queue.removeJobScheduler()` + `job.remove()`

#### Celery (Python) — `python-backend/app/core/celery_app.py`

- Queues: `celery`, `video`, `media`
- Task routing by name
- Beat schedule for cleanup and retry tasks
- 30min hard limit, 29min soft limit

#### Redis — `apps/web/server/services/redis.ts`

- `maxRetriesPerRequest: null` (required for BullMQ)
- Retry strategy with exponential backoff up to 2s
- Health check via `ping()`

### 4. Admin Panel Patterns

**AdminSettings.tsx** — Tab-based settings with per-category state:
1. Tab triggers for each category
2. tRPC query to fetch, mutation to save, mutation to test connection
3. useEffect to load fetched settings into form state
4. Masked display for sensitive values (toggle show/hide)
5. Save/Test connection buttons

**Admin-Only Procedure**:
```typescript
import { adminProcedure } from "../_core/trpc";
// Guarantees ctx.user.role === "admin"
```

### 5. Email/SMS Patterns (Reference for Telegram)

**SMTP** (`systemSettings.ts:755`): Category `smtp`, keys: host, port, secure, user, pass (encrypted), from_name, from_email. Test connection sends test email.

**SMS** (`systemSettings.ts:887`): Category `sms`, multi-provider (Twilio/Vonage), encrypted auth token.

Pattern: fetch settings → decrypt sensitive → create client → send → handle errors silently (don't block notification creation).

### 6. Security Patterns

- Cron expression validation (min 15-minute interval)
- Authorization checks (user ownership, admin escalation)
- Rate limits per user (max 50 schedules)
- Input sanitization: `sanitizeEmailHeader()`, `escapeHtml()`, content truncation `.slice(0, 500)`

### 7. Testing Setup

**TypeScript (Vitest)** — `apps/web/vitest.config.ts`:
- Environment: node
- Include: `server/**/*.test.ts`, `client/src/**/*.test.ts`
- V8 coverage provider
- Run: `pnpm test`, `pnpm test:coverage`

**Python (pytest)** — `python-backend/tests/`:
- Structure: `conftest.py`, `test_*.py`, `fixtures/`, `e2e/`, `security/`
- Markers: unit, integration, e2e, auth, credits, llm
- Coverage: 80% minimum enforced
- Run: `pytest`, `pytest -m unit`

---

## Part 2: Web Research — Telegram Bot API & Best Practices

### 1. Telegram Bot API sendMessage

**Endpoint**: `POST https://api.telegram.org/bot{token}/sendMessage`

**Required Parameters**: `chat_id` (Integer/String), `text` (String)

**Optional**: `parse_mode` (MarkdownV2/HTML/Markdown), `reply_markup` (InlineKeyboardMarkup)

**Response**: Returns `Message` object with `message_id`, `date`, content fields.

#### MarkdownV2 Formatting

**Characters requiring escaping** (outside Markdown syntax): `_ * [ ] ( ) ~ \` > # + - = | { } . !`

Key gotcha: Only escape **outside** Markdown elements. Characters inside `*bold*`, `[link](url)` etc. should NOT be escaped.

Supported: `*bold*`, `_italic_`, `__underline__`, `~strikethrough~`, `||spoiler||`, `[link](url)`, `` `code` ``, ```` ```code block``` ````

#### InlineKeyboardMarkup

```json
{
  "reply_markup": {
    "inline_keyboard": [[
      { "text": "View in SmartSpecPro", "url": "https://app.example.com/notifications" }
    ]]
  }
}
```

URL buttons don't send anything to the bot — they just open the link. No callback handling needed.

### 2. Deep Link Verification Patterns

**Deep Link Format**: `https://t.me/botusername?start=PAYLOAD`
- Max 64 characters
- Allowed: `A-Z`, `a-z`, `0-9`, `_`, `-`
- Bot receives `/start PAYLOAD` when user clicks

**Recommended Verification Flow**:

1. **Web App generates code**: `crypto.randomBytes(4).toString('hex')` (8 chars)
2. **Store in Redis**: `SETEX telegram:verify:{code} 300 {userId, createdAt, attempts:0}` (5-min TTL)
3. **Show deep link**: `https://t.me/yourbot?start={code}`
4. **Bot receives `/start {code}`**: Validate code, link `chat_id` to user, delete code
5. **Confirm**: Send success message to user

**Security**:
- Use CSPRNG (never `Math.random()`)
- 5-10 minute expiry
- One-time use (delete after verification)
- Max 5 attempts per chat_id per hour
- Max 3 attempts per code before lockout

**Alternative**: Telegram Login Widget (receives `id`, `first_name`, `username`, `auth_date`, `hash`). Verify with HMAC-SHA-256 using bot token. Check `auth_date` freshness (< 24h).

### 3. BullMQ Rate-Limited Queues

#### Telegram Rate Limits

- **Per chat**: 1 msg/sec (short bursts allowed)
- **Groups**: 20 msg/min
- **Global**: ~30 msg/sec (paid: 1000 msg/sec)
- Rate limits are **per chat_id**, not per bot token

#### BullMQ Configuration

```typescript
const worker = new Worker('telegram-notifications', handler, {
  connection: redisConnection,
  concurrency: 10,
  limiter: { max: 25, duration: 1000 }, // 25 msg/sec (conservative)
});
```

**Handling 429 errors**:
```typescript
if (error.response?.status === 429) {
  const retryAfter = parseInt(error.response.headers['retry-after']) || 60;
  await worker.rateLimit(retryAfter * 1000);
  throw Worker.RateLimitError();
}
```

**Default job options**:
```typescript
{ attempts: 5, backoff: { type: 'exponential', delay: 2000, jitter: 0.3 } }
```

Retry delays (base 2s): 2s → 4s → 8s → 16s → 32s (with ±30% jitter).

**Per-chat rate limiting** requires BullMQ Pro (groups feature). For free BullMQ, the global rate limiter (25-30/sec) is sufficient since per-chat 1/sec is rarely hit in practice.

**Priority queues**: Lower number = higher priority. Critical alerts at priority 1, normal at 5.

### 4. Handling Blocked Users

When a user blocks the bot, the API returns error with description containing "bot was blocked". Mark user as unlinked in the database, stop sending notifications.

---

## Key Recommendations

1. **Store bot token in `system_settings`** with `category: "telegram"`, `isSensitive: true` — follows existing SMTP/SMS pattern
2. **Use deep link verification** (not Telegram Login Widget) — simpler, spec says send-only
3. **Dedicated BullMQ queue** `telegram-notifications` with rate limiter at 25 msg/sec, exponential backoff
4. **MarkdownV2** with proper escaping helper function
5. **Add columns to `users` table**: `telegramChatId`, `telegramVerified`, plus extend `userPreferences` JSON for notification level preference
6. **Hook into existing notification creation** — after inserting into `user_notifications`, enqueue Telegram message if user is linked and preference matches priority
7. **For verification flow**, use Redis with 5-minute TTL, CSPRNG codes, brute-force protection

## Sources

- [Telegram Bot API](https://core.telegram.org/bots/api)
- [Telegram Bots FAQ](https://core.telegram.org/bots/faq) — Rate limits
- [Telegram Deep Links](https://core.telegram.org/api/links)
- [BullMQ Global Rate Limiting](https://docs.bullmq.io/guide/queues/global-rate-limit)
- [BullMQ Retrying Failing Jobs](https://docs.bullmq.io/guide/retrying-failing-jobs)
- [BullMQ Rate Limit Recipes](https://blog.taskforce.sh/rate-limit-recipes-in-nodejs-using-bullmq/)
