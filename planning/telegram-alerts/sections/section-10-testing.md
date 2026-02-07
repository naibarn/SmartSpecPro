# Section 10: Testing

## Overview

This section covers all automated tests for the Telegram Alert Notifications feature. It creates four test files covering the TypeScript services, tRPC router endpoints, and the Python webhook handler. All tests mock external dependencies (Telegram Bot API, Redis, database) -- no real API calls are made.

**Dependencies:** This section assumes all previous sections (01 through 09) are implemented. Specifically, the files being tested must exist:

- `/home/dev/projects/SmartSpecPro/apps/web/server/services/telegramService.ts` (section-03)
- `/home/dev/projects/SmartSpecPro/apps/web/server/services/notificationService.ts` (section-02)
- `/home/dev/projects/SmartSpecPro/apps/web/server/routers/telegram.ts` (section-04 + section-06)
- `/home/dev/projects/SmartSpecPro/python-backend/app/api/telegram_webhook.py` (section-05)

## Test Files to Create

| File | Framework | What It Tests |
|------|-----------|---------------|
| `/home/dev/projects/SmartSpecPro/apps/web/server/services/telegramService.test.ts` | Vitest | HTML escaping, message formatting, sendTelegramMessage, enqueueTelegramNotification eligibility, worker logic, clearTelegramCache |
| `/home/dev/projects/SmartSpecPro/apps/web/server/services/notificationService.test.ts` | Vitest | createNotification wrapper, DB insert, Telegram enqueue integration, fire-and-forget error handling |
| `/home/dev/projects/SmartSpecPro/apps/web/server/routers/telegram.test.ts` | Vitest | Admin endpoints (settings CRUD, test connection, register webhook), user endpoints (link generation, status check, unlink, preferences) |
| `/home/dev/projects/SmartSpecPro/python-backend/tests/test_telegram_webhook.py` | pytest | Webhook secret validation, chat type filtering, /start verification flow, brute-force protection, edge cases |

## Test Run Commands

```bash
# TypeScript tests (from apps/web/)
cd /home/dev/projects/SmartSpecPro/apps/web
pnpm test -- server/services/telegramService.test.ts
pnpm test -- server/services/notificationService.test.ts
pnpm test -- server/routers/telegram.test.ts

# Python tests (from python-backend/)
cd /home/dev/projects/SmartSpecPro/python-backend
pytest tests/test_telegram_webhook.py -v

# Full suites
cd /home/dev/projects/SmartSpecPro/apps/web && pnpm test
cd /home/dev/projects/SmartSpecPro/python-backend && pytest
```

---

## Vitest Configuration Reference

The existing Vitest config at `/home/dev/projects/SmartSpecPro/apps/web/vitest.config.ts` already includes server test files:

```typescript
test: {
  environment: "node",
  include: ["server/**/*.test.ts", "server/**/*.spec.ts", "client/src/**/*.test.ts", "shared/**/*.test.ts"],
}
```

No changes needed to the Vitest configuration.

---

## Mocking Strategy (Shared Across All TypeScript Tests)

All three TypeScript test files share common mock patterns. The project already uses `vi.mock()` and `vi.hoisted()` extensively (see existing tests like `costTracker.test.ts` and `providerHealth.test.ts`).

### Common Mocks

**Database mock** -- follows the chainable mock pattern from `adminTenants.test.ts`:

```typescript
function createChainableMock(resolveValue: any = []) {
  const chain: any = {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue(resolveValue),
    then: (resolve: any) => Promise.resolve(resolveValue).then(resolve),
  };
  return chain;
}
```

**Redis mock** -- mock the IORedis client methods used by the telegram service (get, set, del, incr, expire):

```typescript
const mockRedis = {
  get: vi.fn(),
  set: vi.fn(),
  del: vi.fn(),
  incr: vi.fn(),
  expire: vi.fn(),
};
```

**Fetch mock** -- mock global `fetch()` for Telegram Bot API calls (never hit the real API):

```typescript
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);
```

**BullMQ mock** -- mock Queue.add() and Worker construction:

```typescript
vi.mock("bullmq", () => ({
  Queue: vi.fn().mockImplementation(() => ({
    add: vi.fn().mockResolvedValue({ id: "job-1" }),
    close: vi.fn(),
  })),
  Worker: vi.fn().mockImplementation(() => ({
    close: vi.fn(),
    on: vi.fn(),
  })),
}));
```

---

## Test File 1: telegramService.test.ts

**Path:** `/home/dev/projects/SmartSpecPro/apps/web/server/services/telegramService.test.ts`

This is the largest test file, covering the core Telegram delivery logic.

### Test Structure

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock setup with vi.hoisted() and vi.mock() for:
//   - "../db" (database)
//   - "../../drizzle/schema" (table refs)
//   - "drizzle-orm" (eq, and, etc.)
//   - "./redis" (Redis client)
//   - "bullmq" (Queue, Worker)
//   - global fetch

// Import the functions under test AFTER mocks:
// escapeHtml, formatTelegramMessage, sendTelegramMessage,
// enqueueTelegramNotification, clearTelegramCache
```

### describe("escapeHtml")

Six test cases for the HTML entity escaping utility:

- **escapes `<` to `&lt;`** -- input `"<script>"`, verify output `"&lt;script&gt;"`
- **escapes `>` to `&gt;`** -- input `"a > b"`, verify `"a &gt; b"`
- **escapes `&` to `&amp;`** -- input `"AT&T"`, verify `"AT&amp;T"`
- **preserves normal text without escaping** -- input `"Hello World"`, verify same output
- **handles empty string** -- input `""`, verify `""`
- **handles text with multiple special chars** -- input `"Price < $10 & > $5"`, verify `"Price &lt; $10 &amp; &gt; $5"`

### describe("formatTelegramMessage")

Seven test cases for the message formatting function:

- **includes priority emoji** -- verify critical maps to a red circle emoji, high to orange, normal to blue, low to white. Pass each priority value and check the output text starts with the correct emoji.
- **wraps title in `<b>` tags** -- verify the formatted text contains `<b>Escaped Title</b>`
- **wraps timestamp in `<i>` tags** -- verify output contains `<i>` around a formatted date
- **escapes HTML special characters in title and content** -- pass title `"Alert <urgent>"`, verify `&lt;urgent&gt;` in output
- **truncates content to 4000 chars** -- pass a 5000-char string, verify output length does not exceed 4000 chars (after formatting overhead)
- **includes inline keyboard with View button** -- verify the returned `replyMarkup` object contains an `inline_keyboard` array with a button whose `url` points to the configured app URL plus `/notifications`
- **sets parse_mode to HTML** -- verify the returned object has `parse_mode: "HTML"`

### describe("sendTelegramMessage")

Seven test cases for the Bot API HTTP client:

- **sends POST to correct Telegram API URL** -- mock `fetch` to return `{ ok: true, result: { message_id: 123 } }`. Verify `fetch` was called with `https://api.telegram.org/bot{token}/sendMessage` and the correct JSON body.
- **returns `{ ok: true, messageId }` on success** -- verify the return value shape
- **throws on HTTP 429 with retry-after info** -- mock `fetch` to return status 429 with `retry_after` in body. Verify the thrown error contains retry-after information.
- **throws on "bot was blocked" error** -- mock `fetch` to return `{ ok: false, description: "Forbidden: bot was blocked by the user" }`. Verify a specific error is thrown.
- **throws on network error** -- mock `fetch` to reject with a TypeError. Verify the error propagates.
- **includes reply_markup when provided** -- verify the fetch body includes `reply_markup` when the optional parameter is passed
- **sets timeout on fetch request** -- verify the fetch call includes an `AbortSignal` or timeout option

### describe("enqueueTelegramNotification")

Nine test cases for eligibility checking and queue enqueuing:

- **enqueues job when user is verified and priority matches "all" level** -- mock DB to return a verified user with `telegramNotifyLevel: "all"`, mock system_settings `enabled: "true"`. Verify `Queue.add()` is called.
- **enqueues job when priority is "high" and level is "high_critical"** -- verify high-priority notifications pass the "high_critical" filter
- **does NOT enqueue when priority is "normal" and level is "high_critical"** -- verify normal-priority is filtered out
- **does NOT enqueue when user is not verified** -- mock user with `telegramVerified: false`. Verify `Queue.add()` is NOT called.
- **does NOT enqueue when Telegram feature is disabled** -- mock `system_settings` with `enabled: "false"`. Verify no enqueue.
- **does NOT enqueue when telegramNotifyLevel is "off"** -- verify filtering
- **does NOT enqueue when telegramNotifyLevel is undefined** -- verify undefined is treated as "not opted in"
- **sets BullMQ priority mapping** -- verify critical=1, high=3, normal=5, low=7 in the job options passed to `Queue.add()`
- **silently logs error if Redis/queue is unavailable** -- mock `Queue.add()` to throw. Verify no exception propagates (fire-and-forget).

### describe("clearTelegramCache")

One test case:

- **after clearing, next call re-reads system_settings** -- call `clearTelegramCache()`, then call `enqueueTelegramNotification()`. Verify that system_settings are fetched from DB (not from a stale cache).

### describe("Worker logic")

Seven test cases for the BullMQ worker processor function. These tests need to exercise the worker's job processor callback. The approach is to capture the processor function passed to `Worker` constructor via the mock, then call it directly with mock job data.

- **worker processes job and calls sendTelegramMessage** -- invoke the processor with valid job data. Verify `fetch()` was called with the Telegram API URL.
- **worker resets failure counter on successful delivery** -- mock Redis `get` to return `"3"` (previous failures). After successful send, verify Redis `del` is called for `telegram:failures:{userId}`.
- **worker calls rateLimit on 429 response** -- mock `fetch` to return 429. Verify the worker throws a rate limit error.
- **worker increments Redis failure counter on "bot was blocked"** -- mock `fetch` to return blocked error. Verify Redis `incr` is called on `telegram:failures:{userId}`.
- **worker sets telegramDeliveryFailing=true when failure count reaches 5** -- mock Redis `incr` to return `5`. Verify DB update sets `telegramDeliveryFailing: true` in `userPreferences`.
- **worker clears telegramDeliveryFailing on successful delivery after failures** -- mock a user with existing failures. After success, verify DB update sets `telegramDeliveryFailing: false`.
- **worker throws on other errors (triggers BullMQ retry)** -- mock `fetch` to throw a generic error. Verify the error propagates (not caught).

---

## Test File 2: notificationService.test.ts

**Path:** `/home/dev/projects/SmartSpecPro/apps/web/server/services/notificationService.test.ts`

### Test Structure

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock setup:
//   - "../db" or direct db parameter mock
//   - "../../drizzle/schema" (userNotifications table ref)
//   - "./telegramService" (enqueueTelegramNotification)

// Import: createNotification
```

### describe("createNotification")

Six test cases:

- **inserts into user_notifications with correct fields** -- mock `db.insert().values().returning()`. Call `createNotification()` with all params. Verify `insert` was called with the `userNotifications` table and values match the input (userId, type, title, content, priority, conversationId, scheduledMessageId).

- **returns the inserted notification ID** -- mock `returning()` to resolve with `[{ id: 42 }]`. Verify `createNotification()` returns `{ notificationId: 42 }`.

- **calls enqueueTelegramNotification after DB insert** -- mock `enqueueTelegramNotification` via `vi.mock("./telegramService")`. Verify it is called with the correct userId and notification data after the DB insert succeeds.

- **does not fail if enqueueTelegramNotification throws (fire-and-forget)** -- mock `enqueueTelegramNotification` to throw an error. Verify `createNotification()` still resolves successfully and returns the notification ID. The Telegram enqueue is non-blocking.

- **passes priority through to Telegram enqueue** -- call with `priority: "critical"`. Verify `enqueueTelegramNotification` receives priority `"critical"` in its args.

- **handles optional fields (conversationId, scheduledMessageId)** -- call without optional fields. Verify the DB insert does not include those columns (or they are null/undefined).

### Integration-level tests (within same file)

Three additional tests that validate end-to-end behavior through the notification wrapper:

- **end-to-end flow: createNotification to enqueueTelegramNotification** -- verify the full call chain from notification creation to Telegram queue enqueue with all mocks wired together.

- **graceful degradation: notification created successfully even when Redis is down** -- mock the Telegram service to throw a Redis connection error. Verify the notification is still inserted into the DB and the function resolves.

- **graceful degradation: notification created successfully even when Telegram API is down** -- similar to above but the error originates from the Telegram API layer.

---

## Test File 3: telegram.test.ts (Router)

**Path:** `/home/dev/projects/SmartSpecPro/apps/web/server/routers/telegram.test.ts`

This tests both admin and user tRPC endpoints. The approach follows the existing pattern in `adminTenants.test.ts` -- mock the database, SDK auth, crypto, Redis, and service modules, then call router procedures.

### Test Structure

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock setup:
//   - "../_core/sdk" (authenticateRequest -- controls admin vs user auth)
//   - "../db" (chainable Drizzle mocks)
//   - "../../drizzle/schema" (users, systemSettings table refs)
//   - "../services/crypto" (encrypt, decrypt)
//   - "../services/redis" (getRedisClient)
//   - "../services/telegramService" (clearTelegramCache)
//   - "drizzle-orm" (eq, and)
//   - "crypto" (randomBytes)
//   - global fetch (for Telegram API calls in test/register endpoints)
```

### describe("Admin Endpoints")

Nine test cases under the admin section:

- **getTelegramSettings returns masked bot token** -- mock DB to return a row with encrypted bot token. Mock `decrypt()` to return `"123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11"`. Verify the returned `botToken` shows only the last 4 chars (e.g., `"****ew11"`).

- **getTelegramSettings returns all Telegram settings from system_settings** -- verify the response includes `botToken` (masked), `botUsername`, `webhookSecret` (masked), `appUrl`, and `enabled`.

- **updateTelegramSettings encrypts bot token before storing** -- call with `botToken: "123456:ABC..."`. Verify `encrypt()` is called with the raw token and the DB insert/update uses the encrypted value.

- **updateTelegramSettings calls clearTelegramCache after successful update** -- verify `clearTelegramCache` (imported from telegramService) is called after the DB write.

- **updateTelegramSettings auto-generates webhook_secret on first save** -- mock DB to return no existing `webhook_secret` row. Verify `crypto.randomBytes(32)` is called and the result is stored.

- **testTelegramConnection calls Telegram getMe API** -- mock global `fetch` to return `{ ok: true, result: { username: "TestBot", first_name: "Test" } }`. Verify `fetch` was called with the `getMe` endpoint. Verify the response contains `{ success: true, botInfo: { username: "TestBot", firstName: "Test" } }`.

- **testTelegramConnection returns error when token is invalid** -- mock `fetch` to return `{ ok: false, description: "Unauthorized" }`. Verify the response contains `{ success: false }` and an error message.

- **registerWebhook calls Telegram setWebhook with correct URL and secret_token** -- mock `fetch` to return success. Verify the call includes `{ url: "https://app.example.com/webhook/telegram", secret_token: "the-webhook-secret" }`.

- **all admin endpoints reject non-admin users** -- mock `authenticateRequest` to return a user without admin role. Verify each admin procedure throws an authorization error.

### describe("User Endpoints")

#### generateTelegramLink (4 tests)

- **generates 32-char hex verification code** -- mock `crypto.randomBytes(16)` to return a known buffer. Verify the returned code is 32 hex characters.
- **stores code in Redis with 300s TTL** -- verify `redis.set()` is called with key `telegram:verify:{code}` and `EX 300`.
- **returns deep link with correct bot username** -- mock system_settings to return `bot_username: "SmartSpecProBot"`. Verify the response `deepLink` matches `https://t.me/SmartSpecProBot?start={code}`.
- **rejects if Telegram feature is not enabled** -- mock system_settings `enabled: "false"`. Verify the procedure throws an error.

#### checkTelegramStatus (5 tests)

- **returns linked=true when telegramVerified is true** -- mock DB user with `telegramVerified: true`.
- **returns linked=false when telegramVerified is false** -- even if `telegramChatId` has a value.
- **returns username from telegramUsername column** -- verify the response includes the stored username.
- **returns deliveryFailing flag from userPreferences** -- mock user with `userPreferences: { telegramDeliveryFailing: true }`.
- **returns current telegramNotifyLevel** -- mock user with `userPreferences: { telegramNotifyLevel: "high_critical" }`.

#### unlinkTelegram (5 tests)

- **sets telegramChatId, telegramUsername to null** -- verify DB update call clears these columns.
- **sets telegramVerified to false, telegramVerifiedAt to null** -- verify update.
- **clears telegramNotifyLevel from userPreferences** -- verify the JSON update removes or nullifies the key.
- **clears telegramDeliveryFailing from userPreferences** -- same as above.
- **deletes Redis key telegram:failures:{userId}** -- verify `redis.del()` is called.

#### updateTelegramPreferences (3 tests)

- **updates telegramNotifyLevel in userPreferences JSON** -- call with `notifyLevel: "all"`. Verify DB update sets `userPreferences.telegramNotifyLevel` to `"all"`.
- **rejects invalid notifyLevel values** -- call with `notifyLevel: "invalid"`. Verify Zod validation rejects it (tRPC input validation error).
- **only updates telegramNotifyLevel, preserves other userPreferences** -- mock existing preferences `{ translationLanguage: "fr" }`. After update, verify `translationLanguage` is still present.

---

## Test File 4: test_telegram_webhook.py (Python)

**Path:** `/home/dev/projects/SmartSpecPro/python-backend/tests/test_telegram_webhook.py`

This tests the FastAPI webhook endpoint. It uses the existing `conftest.py` patterns: `TestClient`, `MockRedisClient`, fixture-based DB overrides.

### Test Structure

```python
"""
Tests for POST /webhook/telegram endpoint.
Covers: webhook secret validation, chat type filtering,
/start verification flow, brute-force protection, edge cases.
"""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from fastapi.testclient import TestClient


@pytest.fixture
def webhook_secret():
    """The shared secret for webhook validation."""
    return "test-webhook-secret-hex-string"


@pytest.fixture
def valid_headers(webhook_secret):
    """Headers with valid webhook secret."""
    return {"X-Telegram-Bot-Api-Secret-Token": webhook_secret}


@pytest.fixture
def make_update():
    """Factory for Telegram Update objects."""
    def _make(text="/start abc123", chat_type="private", chat_id=12345, username="testuser"):
        # Returns a dict matching Telegram Update schema
        ...
    return _make
```

### Webhook Security Tests (3 tests)

- **rejects request without X-Telegram-Bot-Api-Secret-Token header** -- send POST without the header. Assert response status is 401 or 403.
- **rejects request with invalid secret token** -- send POST with wrong token value. Assert rejection.
- **accepts request with valid secret token** -- send POST with correct token and a valid Update body. Assert 200 OK.

### Chat Type Validation Tests (4 tests)

- **ignores group chat messages** -- send Update with `chat.type: "group"`. Assert 200 OK but no user update in DB.
- **ignores supergroup messages** -- same with `"supergroup"`.
- **ignores channel messages** -- same with `"channel"`.
- **processes private chat messages** -- send Update with `chat.type: "private"` and valid `/start` code. Assert user record is updated.

### Verification Flow Tests (6 tests)

These tests mock Redis to contain a valid verification code and mock the DB to have a matching user.

- **valid /start {code} links Telegram chat_id to user account** -- send `/start {valid_code}`. Assert the DB UPDATE sets `telegramChatId` to the sender's `chat.id`.
- **valid /start sets telegramVerified=true and telegramVerifiedAt** -- verify both columns are set in a single DB call.
- **valid /start stores telegramUsername from message.from.username** -- verify the username from the Telegram Update is stored.
- **all three columns updated in single statement** -- verify the DB update is a single SQL execution (not multiple queries). This can be checked by asserting the mock was called exactly once for the update.
- **valid /start deletes verification code from Redis after use** -- verify `redis.delete("telegram:verify:{code}")` is called.
- **valid /start sends confirmation message to user via Bot API** -- mock `httpx.AsyncClient.post`. Verify it was called with the Telegram `sendMessage` endpoint and a congratulatory message.

### Code Validation Tests (4 tests)

- **rejects code that doesn't match [a-f0-9]{32} format** -- send `/start INVALID!CODE`. Assert no DB update occurs and response is 200 (silently ignored or error message sent).
- **rejects expired code (not found in Redis)** -- mock Redis `get` to return `None`. Assert no DB update.
- **rejects code after 3 failed attempts (per-code limit)** -- mock Redis to return code data with `attempts: 3`. Assert rejection.
- **increments code attempt counter on failed verification** -- send an invalid code attempt. Verify Redis is updated to increment the attempt count for that code.

### Brute Force Protection Tests (3 tests)

- **blocks chat_id after 5 verification attempts in 1 hour** -- mock Redis counter `telegram:attempts:{chat_id}` to return `5`. Send a `/start` message. Assert the request is rejected without even checking the code.
- **resets attempt counter after 1 hour TTL** -- verify the Redis key for attempts is set with a 3600-second expiry.
- **different chat_ids have independent attempt counters** -- verify that rate limiting uses per-chat_id keys, not global counters.

### Edge Case Tests (3 tests)

- **handles /start without code (bare /start command)** -- send just `/start` with no code. Assert 200 OK and no crash. Optionally verify a help message is sent back.
- **ignores non-/start messages** -- send a regular text message like `"Hello"`. Assert 200 OK, no processing.
- **handles missing message.from.username gracefully** -- send an Update where `message.from` has no `username` field. Assert the verification still succeeds and `telegramUsername` is set to `None`/null in the DB.

---

## Mocking Details for Python Tests

The webhook endpoint needs several dependencies mocked. Use `app.dependency_overrides` for FastAPI-injected dependencies and `unittest.mock.patch` for module-level imports.

### System Settings Mock

The webhook reads `webhook_secret` and `bot_token` from the database (system_settings table). Patch the function that reads these settings:

```python
@pytest.fixture
def mock_system_settings(webhook_secret):
    """Mock the system settings reader to return test values."""
    with patch("app.api.telegram_webhook.get_telegram_settings") as mock:
        mock.return_value = {
            "webhook_secret": webhook_secret,
            "bot_token": "123456:TEST-BOT-TOKEN",
            "enabled": "true",
        }
        yield mock
```

### Redis Mock

Use the `MockRedisClient` from the existing `conftest.py` or create a local mock:

```python
@pytest.fixture
def mock_redis():
    """Mock Redis for verification code operations."""
    # Pre-populate with a valid code if needed
    ...
```

### Database Mock

For the user UPDATE operation, mock the SQLAlchemy session:

```python
@pytest.fixture
def mock_db_session():
    """Mock async DB session for user updates."""
    session = AsyncMock()
    session.execute = AsyncMock()
    session.commit = AsyncMock()
    yield session
```

### HTTP Client Mock

Mock `httpx.AsyncClient` for the confirmation message sent via Bot API:

```python
@pytest.fixture
def mock_httpx():
    """Mock httpx for Telegram Bot API calls."""
    with patch("app.api.telegram_webhook.httpx.AsyncClient") as mock_client_cls:
        mock_client = AsyncMock()
        mock_client.post = AsyncMock(return_value=MagicMock(status_code=200, json=lambda: {"ok": True}))
        mock_client_cls.return_value.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client_cls.return_value.__aexit__ = AsyncMock(return_value=False)
        yield mock_client
```

---

## Verification Checklist

After implementing all test files, verify:

1. **All TypeScript tests pass:**
   ```bash
   cd /home/dev/projects/SmartSpecPro/apps/web
   pnpm test -- server/services/telegramService.test.ts
   pnpm test -- server/services/notificationService.test.ts
   pnpm test -- server/routers/telegram.test.ts
   ```

2. **All Python tests pass:**
   ```bash
   cd /home/dev/projects/SmartSpecPro/python-backend
   pytest tests/test_telegram_webhook.py -v
   ```

3. **No regressions in existing tests:**
   ```bash
   cd /home/dev/projects/SmartSpecPro/apps/web && pnpm test
   cd /home/dev/projects/SmartSpecPro/python-backend && pytest
   ```

4. **Coverage:** Python tests should maintain the 80% minimum threshold. TypeScript tests should cover all exported functions from the new service modules.

## Notes on Test Isolation

- Every test must be independent -- no shared mutable state between tests. Use `beforeEach` (Vitest) or function-scoped fixtures (pytest) to reset mocks.
- Tests must never call the real Telegram Bot API. All `fetch()` and `httpx` calls must be mocked.
- Tests must never connect to real Redis or PostgreSQL. All IO is mocked.
- The `vi.clearAllMocks()` call in `beforeEach` ensures mock call counts and return values are reset between tests.
- For Python, each test function gets a fresh `TestClient` and mocked dependencies via fixtures.
