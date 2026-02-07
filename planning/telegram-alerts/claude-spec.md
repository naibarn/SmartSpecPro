# Telegram Alert Notifications — Synthesized Specification

## Overview

Add Telegram Bot as a notification delivery channel to SmartSpecPro's existing notification system. When a new `user_notifications` entry is created (scheduled message alerts, urgent reminders, system notifications, etc.), the system will automatically send a formatted Telegram message to users who have linked their Telegram account and configured the appropriate notification level.

## Architecture Summary

```
┌──────────────────────────────────────────────────────────┐
│  NOTIFICATION FLOW                                       │
│                                                          │
│  Scheduler / System Event                                │
│       │                                                  │
│       ▼                                                  │
│  INSERT into user_notifications                          │
│       │                                                  │
│       ├──► In-app (existing: bell, modals)               │
│       ├──► Email (existing: SMTP via scheduler.ts)       │
│       └──► Telegram (NEW: BullMQ queue → Bot API)        │
│                                                          │
│  VERIFICATION FLOW                                       │
│                                                          │
│  Web App                    Python FastAPI                │
│  ┌─────────┐               ┌──────────────┐             │
│  │ Generate │──deep link──►│ /webhook/tg   │             │
│  │ code     │               │ handles /start│             │
│  └─────────┘               │ links chatId  │             │
│                            └──────────────┘             │
└──────────────────────────────────────────────────────────┘
```

## Current System (Existing)

- **`user_notifications` table** — in-app notifications with `type`, `title`, `content`, `priority` (low/normal/high/critical), `isRead`
- **`scheduled_messages` table** — cron/one-time scheduled prompts, triggers notification creation
- **`GlobalAlerts.tsx`** — bell icon + dropdown, urgent modals for high/critical
- **`scheduler.ts`** — BullMQ "chat-alerts" queue, creates notifications, sends email if `emailNotify=true`
- **`system_settings` table** — encrypted key-value store for service credentials (SMTP, SMS, Stripe, etc.)
- **`crypto.ts`** — AES-256-GCM encryption, shared key with Python via `LLM_ENCRYPTION_KEY`

## Requirements

### 1. Admin: Telegram Bot Configuration

- Admin registers bot via @BotFather, obtains bot token
- Admin enters bot token in Admin Settings panel (new "Telegram" tab)
- Token stored encrypted in `system_settings` (`category: "telegram"`, `key: "bot_token"`, `isSensitive: true`)
- Admin also configures `app_url` (base URL for "View in SmartSpecPro" buttons)
- Test connection button: calls `getMe` endpoint to verify token validity
- Enable/disable toggle for the entire Telegram notification feature
- Admin configures webhook URL and registers it with Telegram API

### 2. Webhook Endpoint (Python FastAPI)

- Minimal webhook at `POST /webhook/telegram` on the Python FastAPI backend
- Only handles `/start {code}` commands for account verification
- Validates webhook secret (stored in `system_settings`)
- On valid `/start {code}`:
  1. Look up verification code in Redis
  2. If valid: update `users.telegramChatId` and `users.telegramVerified = true` via direct DB query
  3. Send confirmation message to user via Bot API
  4. Delete one-time code from Redis
- Ignores all other message types (send-only bot philosophy)

### 3. User: Account Linking

- New "Telegram Notifications" section in existing user Settings page
- **Link flow:**
  1. User clicks "Link Telegram" button
  2. System generates 8-char verification code (CSPRNG), stores in Redis with 5-min TTL
  3. Displays deep link: `https://t.me/{bot_username}?start={code}`
  4. User clicks link → opens Telegram → sends `/start {code}` to bot
  5. Webhook validates code, links `chat_id` to user
  6. Web app polls for verification status, shows success when linked
- **Unlink**: One-click unlink button, clears `telegramChatId` and `telegramVerified`
- **Status display**: Shows linked/unlinked status, Telegram username if available
- **Brute force protection**: Max 5 verification attempts per chat_id per hour, max 3 attempts per code

### 4. User: Notification Preferences

- Stored in `users.userPreferences` JSON (extend existing type):
  ```
  telegramNotifyLevel: "all" | "high_critical" | "critical_only" | "off"
  ```
- Default: `"off"` (user must explicitly enable after linking)
- UI: Dropdown/radio in the Telegram section of Settings page
- Only shown when Telegram is linked

### 5. Notification Delivery (Node.js / BullMQ)

- New BullMQ queue: `telegram-notifications`
- **Trigger point**: After `db.insert(userNotifications)` in `scheduler.ts` (and any other notification creation points)
- **Flow**:
  1. Check if user has `telegramVerified = true`
  2. Check if notification priority matches user's `telegramNotifyLevel`
  3. If both pass: enqueue job to `telegram-notifications` queue
- **Worker**:
  - Concurrency: 5
  - Rate limiter: max 25 msg/sec (conservative, below Telegram's 30/sec)
  - Retry: 3 attempts, exponential backoff (2s base)
  - On 429: use `worker.rateLimit(retryAfter * 1000)` + `Worker.RateLimitError()`
  - On "bot was blocked": mark delivery failure, increment consecutive failure count
- **Priority mapping**: Critical notifications at BullMQ priority 1, high at 3, normal at 5, low at 7

### 6. Message Formatting

- Use MarkdownV2 parse mode
- Template:
  ```
  {priority_emoji} *{title}*

  {content}

  _{timestamp}_
  ```
- Priority emojis: critical=🔴, high=🟠, normal=🔵, low=⚪
- Content truncated to 4000 chars (Telegram limit is 4096)
- Proper MarkdownV2 escaping for special characters
- Inline keyboard: one button "View in SmartSpecPro" linking to `{app_url}/chat?panel=schedule` or relevant page

### 7. Failure Handling

- Log all delivery attempts (success/failure) to console + optionally to `user_notifications` metadata
- Track consecutive failures per user
- After 5 consecutive failures: set `telegramDeliveryFailing = true` flag on user
- Show warning banner in user's Telegram settings section: "Recent notifications failed to deliver. Please check your Telegram bot is not blocked."
- Do NOT auto-unlink — user must manually investigate and unlink if needed
- Clear failure count on next successful delivery

### 8. Database Changes

**Add columns to `users` table:**
- `telegramChatId: varchar(64)` — Telegram chat ID
- `telegramVerified: boolean default false` — whether account is verified
- `telegramVerifiedAt: timestamp` — when verified

**Extend `userPreferences` JSON type:**
- `telegramNotifyLevel?: "all" | "high_critical" | "critical_only" | "off"`
- `telegramDeliveryFailing?: boolean`

**Add to `system_settings`:**
- `category: "telegram"`, keys: `bot_token` (encrypted), `bot_username`, `webhook_secret` (encrypted), `app_url`, `enabled`

### 9. Security

- Bot token: encrypted with `crypto.ts`, stored in `system_settings` with `isSensitive: true`
- Webhook secret: random string, verified on every incoming webhook request
- Verification codes: CSPRNG (`crypto.randomBytes`), 5-min TTL, one-time use, brute-force limited
- Chat ID: validated as numeric string
- Message content: escaped for MarkdownV2, truncated
- No user data exposed in Telegram messages beyond notification title/content

## Tech Stack Alignment

| Component | Technology | Rationale |
|-----------|-----------|-----------|
| Notification queue | BullMQ (Node.js) | Matches existing scheduler pattern |
| Webhook endpoint | Python FastAPI | Already has standalone HTTP server |
| Bot token storage | system_settings + crypto.ts | Follows SMTP/SMS pattern |
| Verification codes | Redis with TTL | Fast, auto-expiring, matches existing Redis usage |
| User preferences | userPreferences JSON | Extends existing pattern |
| Admin UI | AdminSettings.tsx tab | Follows existing category tab pattern |
| User UI | Settings page section | As per stakeholder decision |

## Scale Considerations

- Target: < 100 users with Telegram linked
- Single BullMQ worker with concurrency 5 is sufficient
- No need for BullMQ Pro per-chat grouping at this scale
- Global rate limiter at 25/sec handles the full user base easily
