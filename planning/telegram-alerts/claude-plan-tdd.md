# TDD Plan: Telegram Alert Notifications

This document mirrors `claude-plan.md` section structure and defines what tests to write BEFORE implementing each part.

**Testing frameworks:**
- TypeScript: Vitest (existing `apps/web/vitest.config.ts`)
- Python: pytest (existing `python-backend/tests/`)
- Mocking: vi.fn() / vi.mock() for Vitest, unittest.mock / pytest fixtures for Python
- Coverage: 80% minimum (Python), V8 provider (TypeScript)

---

## 2. Database Schema Changes

### Test file: `apps/web/server/services/notificationService.test.ts`

No direct tests for schema — schema is validated by migration and downstream tests.

---

## 3. Centralized Notification Creator

### Test file: `apps/web/server/services/notificationService.test.ts`

```
# Test: createNotification inserts into user_notifications with correct fields
# Test: createNotification returns the inserted notification ID
# Test: createNotification calls enqueueTelegramNotification after DB insert
# Test: createNotification does not fail if enqueueTelegramNotification throws (fire-and-forget)
# Test: createNotification passes priority through to Telegram enqueue
# Test: createNotification handles optional fields (conversationId, scheduledMessageId)
```

---

## 4. Admin Configuration (Backend)

### Test file: `apps/web/server/routers/telegram.test.ts`

```
# Admin endpoints:
# Test: getTelegramSettings returns masked bot token (only last 4 chars visible)
# Test: getTelegramSettings returns all Telegram settings from system_settings
# Test: updateTelegramSettings encrypts bot token before storing
# Test: updateTelegramSettings calls clearTelegramCache after successful update
# Test: updateTelegramSettings auto-generates webhook_secret on first save
# Test: testTelegramConnection calls Telegram getMe API and returns bot info
# Test: testTelegramConnection returns error message when token is invalid
# Test: registerWebhook calls Telegram setWebhook with correct URL and secret_token
# Test: all admin endpoints reject non-admin users (protectedProcedure vs adminProcedure)
```

---

## 5. Telegram Webhook (Python FastAPI)

### Test file: `python-backend/tests/test_telegram_webhook.py`

```
# Webhook security:
# Test: rejects request without X-Telegram-Bot-Api-Secret-Token header (401/403)
# Test: rejects request with invalid secret token
# Test: accepts request with valid secret token

# Chat type validation:
# Test: ignores group chat messages (returns 200 OK, no processing)
# Test: ignores supergroup messages
# Test: ignores channel messages
# Test: processes private chat messages

# Verification flow:
# Test: valid /start {code} links Telegram chat_id to user account
# Test: valid /start sets telegramVerified=true and telegramVerifiedAt
# Test: valid /start stores telegramUsername from message.from.username
# Test: all three columns (chatId, verified, verifiedAt) updated in single statement
# Test: valid /start deletes verification code from Redis after use
# Test: valid /start sends confirmation message to user via Bot API

# Code validation:
# Test: rejects code that doesn't match [a-f0-9]{32} format
# Test: rejects expired code (not found in Redis)
# Test: rejects code after 3 failed attempts (per-code limit)
# Test: increments code attempt counter on failed verification

# Brute force protection:
# Test: blocks chat_id after 5 verification attempts in 1 hour
# Test: resets attempt counter after 1 hour TTL
# Test: different chat_ids have independent attempt counters

# Edge cases:
# Test: handles /start without code (bare /start command)
# Test: ignores non-/start messages (returns 200 OK)
# Test: handles missing message.from.username gracefully
```

---

## 6. User Account Linking (Node.js + Frontend)

### Test file: `apps/web/server/routers/telegram.test.ts`

```
# generateTelegramLink:
# Test: generates 32-char hex verification code (128 bits)
# Test: stores code in Redis with 300s TTL
# Test: returns deep link with correct bot username
# Test: returns expiry time of 300 seconds
# Test: rejects if Telegram feature is not enabled (system_settings)

# checkTelegramStatus:
# Test: returns linked=true when telegramVerified is true
# Test: returns linked=false when telegramVerified is false (even if chatId exists)
# Test: returns username from telegramUsername column
# Test: returns deliveryFailing flag from userPreferences
# Test: returns current telegramNotifyLevel

# unlinkTelegram:
# Test: sets telegramChatId, telegramUsername to null
# Test: sets telegramVerified to false, telegramVerifiedAt to null
# Test: clears telegramNotifyLevel from userPreferences
# Test: clears telegramDeliveryFailing from userPreferences
# Test: deletes Redis key telegram:failures:{userId}

# updateTelegramPreferences:
# Test: updates telegramNotifyLevel in userPreferences JSON
# Test: rejects invalid notifyLevel values
# Test: only updates telegramNotifyLevel, preserves other userPreferences
```

---

## 7. Notification Delivery Service (Node.js)

### Test file: `apps/web/server/services/telegramService.test.ts`

```
# escapeHtml:
# Test: escapes < to &lt;
# Test: escapes > to &gt;
# Test: escapes & to &amp;
# Test: preserves normal text without escaping
# Test: handles empty string
# Test: handles text with multiple special chars: "Price < $10 & > $5"

# formatTelegramMessage:
# Test: includes priority emoji (🔴 for critical, 🟠 for high, 🔵 for normal, ⚪ for low)
# Test: wraps title in <b> tags
# Test: wraps timestamp in <i> tags
# Test: escapes HTML special characters in title and content
# Test: truncates content to 4000 chars
# Test: includes inline keyboard with "View in SmartSpecPro" button and correct URL
# Test: sets parse_mode to "HTML"

# sendTelegramMessage:
# Test: sends POST to api.telegram.org/bot{token}/sendMessage with correct payload
# Test: returns { ok: true, messageId } on success
# Test: throws on HTTP 429 with retry-after info
# Test: throws on "bot was blocked" error
# Test: throws on network error
# Test: includes reply_markup when provided
# Test: sets timeout on fetch request

# enqueueTelegramNotification:
# Test: enqueues job when user is verified and priority matches "all" level
# Test: enqueues job when priority is "high" and level is "high_critical"
# Test: does NOT enqueue when priority is "normal" and level is "high_critical"
# Test: does NOT enqueue when user is not verified
# Test: does NOT enqueue when Telegram feature is disabled (system_settings)
# Test: does NOT enqueue when telegramNotifyLevel is "off"
# Test: does NOT enqueue when telegramNotifyLevel is undefined
# Test: sets BullMQ priority: critical=1, high=3, normal=5, low=7
# Test: silently logs error if Redis/queue is unavailable (fire-and-forget)

# clearTelegramCache:
# Test: after clearing, next call to enqueueTelegramNotification re-reads system_settings
```

### Worker tests: `apps/web/server/services/telegramService.test.ts`

```
# Worker logic:
# Test: worker processes job and calls sendTelegramMessage with formatted content
# Test: worker resets failure counter on successful delivery
# Test: worker calls worker.rateLimit() on 429 response and throws RateLimitError
# Test: worker increments Redis telegram:failures:{userId} on "bot was blocked"
# Test: worker sets telegramDeliveryFailing=true when failure count reaches 5
# Test: worker clears telegramDeliveryFailing on successful delivery after failures
# Test: worker throws on other errors (triggers BullMQ retry)
```

---

## 8. Admin UI

### No automated tests specified for Admin UI
(Manual verification of tab rendering, form state, masked values per existing AdminSettings pattern)

---

## 9. Error Handling & Failure Recovery

### Covered by delivery service tests in Section 7 above

```
# Additional integration-level tests:
# Test: end-to-end flow: createNotification → enqueueTelegramNotification → worker → sendMessage
# Test: graceful degradation: notification created successfully even when Redis is down
# Test: graceful degradation: notification created successfully even when Telegram API is down
```

---

## Test Run Commands

```bash
# TypeScript tests (from apps/web/)
pnpm test -- server/services/telegramService.test.ts
pnpm test -- server/services/notificationService.test.ts
pnpm test -- server/routers/telegram.test.ts

# Python tests (from python-backend/)
pytest tests/test_telegram_webhook.py -v

# Full suites
cd apps/web && pnpm test
cd python-backend && pytest
```
