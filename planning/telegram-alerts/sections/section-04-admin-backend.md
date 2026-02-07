# Section 04: Admin Backend -- Telegram Settings tRPC Router

## Overview

This section creates the admin-facing tRPC endpoints for configuring the Telegram Bot integration. It adds a new `telegram.ts` router file with four admin endpoints (`getTelegramSettings`, `updateTelegramSettings`, `testTelegramConnection`, `registerWebhook`), registers it in the main `appRouter`, and updates the `settingCategorySchema` in `systemSettings.ts` to include `"telegram"` as a valid category.

## Dependencies

- **section-01-schema-migration** must be complete (Telegram columns on users table, `userPreferences` type extended).
- **section-03-telegram-service** must be complete (provides `clearTelegramCache()` from `apps/web/server/services/telegramService.ts`).

## Files to Create

| File | Purpose |
|------|---------|
| `/home/dev/projects/SmartSpecPro/apps/web/server/routers/telegram.ts` | New tRPC router with admin (and later, user) endpoints |

## Files to Modify

| File | Change |
|------|--------|
| `/home/dev/projects/SmartSpecPro/apps/web/server/routers/systemSettings.ts` (line 17) | Add `"telegram"` to `settingCategorySchema` enum |
| `/home/dev/projects/SmartSpecPro/apps/web/server/routers.ts` | Import and register `telegramRouter` in `appRouter` |

---

## Tests (Write First)

Test file: `/home/dev/projects/SmartSpecPro/apps/web/server/routers/telegram.test.ts`

These tests validate the admin endpoints only. User endpoints (linking, status, preferences) are covered in section-06.

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

### Test Stubs

```typescript
// /home/dev/projects/SmartSpecPro/apps/web/server/routers/telegram.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock DB, crypto, fetch, and telegramService before imports
vi.mock("../db", () => ({
  getDb: vi.fn(),
}));
vi.mock("../services/crypto", () => ({
  encrypt: vi.fn((v: string) => `encrypted:${v}`),
  decrypt: vi.fn((v: string) => v.replace("encrypted:", "")),
}));
vi.mock("../services/telegramService", () => ({
  clearTelegramCache: vi.fn(),
}));

describe("telegram router - admin endpoints", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("getTelegramSettings", () => {
    it("returns masked bot token showing only last 4 chars", async () => {
      /** Set up mock DB to return a system_settings row with
       *  category="telegram", key="bot_token", value="encrypted:123456:ABC..."
       *  Verify the returned botToken is masked, e.g. "****WXYZ" */
    });

    it("returns all telegram settings from system_settings", async () => {
      /** Mock DB returning rows for bot_token, bot_username,
       *  webhook_secret, app_url, enabled.
       *  Verify all fields appear in result. */
    });
  });

  describe("updateTelegramSettings", () => {
    it("encrypts bot token before storing", async () => {
      /** Call with { botToken: "123:ABC" }.
       *  Verify encrypt() was called with the token.
       *  Verify the DB insert/update uses the encrypted value. */
    });

    it("calls clearTelegramCache after successful update", async () => {
      /** Call updateTelegramSettings with any valid input.
       *  Verify clearTelegramCache was called once. */
    });

    it("auto-generates webhook_secret on first save when none exists", async () => {
      /** Mock DB to return no existing webhook_secret row.
       *  Call updateTelegramSettings with { botToken: "..." }.
       *  Verify a webhook_secret row was inserted with a
       *  64-char hex string (32 bytes). */
    });
  });

  describe("testTelegramConnection", () => {
    it("calls Telegram getMe API and returns bot info on success", async () => {
      /** Mock fetch to return { ok: true, result: { username: "TestBot", first_name: "Test" } }.
       *  Verify returned { success: true, botInfo: { username, firstName } }. */
    });

    it("returns error message when token is invalid", async () => {
      /** Mock fetch to return { ok: false, description: "Unauthorized" }.
       *  Verify returned { success: false, error: "..." }. */
    });
  });

  describe("registerWebhook", () => {
    it("calls Telegram setWebhook with correct URL and secret_token", async () => {
      /** Mock DB with app_url and webhook_secret settings.
       *  Mock fetch for setWebhook API.
       *  Verify the POST body includes url and secret_token. */
    });
  });

  describe("access control", () => {
    it("all admin endpoints reject non-admin users", async () => {
      /** Verify that each of the four admin endpoints uses adminProcedure
       *  (or manually test that a user with role != 'admin' gets FORBIDDEN). */
    });
  });
});
```

### Mocking Strategy

- **Database**: Mock `getDb()` to return a fake db object with chainable `.select()`, `.from()`, `.where()`, `.insert()`, `.update()` methods.
- **Crypto**: Mock `encrypt()` and `decrypt()` from `../services/crypto` so they are simple reversible transforms (no real encryption needed in tests).
- **fetch()**: Use `vi.stubGlobal("fetch", vi.fn())` to mock Telegram Bot API calls (getMe, setWebhook).
- **telegramService**: Mock `clearTelegramCache` from `../services/telegramService` to verify it is called after settings update.

---

## Implementation Details

### 1. Update `settingCategorySchema` in systemSettings.ts

In `/home/dev/projects/SmartSpecPro/apps/web/server/routers/systemSettings.ts`, line 17, add `"telegram"` to the enum:

```typescript
const settingCategorySchema = z.enum([
  "stripe", "invoice", "email", "general", "oauth", "ai", "telegram"
]);
```

This allows the generic `getSetting`, `getSettingsByCategory`, and `updateSetting` endpoints to accept `"telegram"` as a category. However, the Telegram-specific admin endpoints in the new router provide a more tailored interface (masking, encryption, cache clearing, webhook registration).

### 2. Create the Telegram Router

Create `/home/dev/projects/SmartSpecPro/apps/web/server/routers/telegram.ts`.

This router combines both admin and user endpoints in a single file. This section covers only the admin endpoints. User endpoints (linking, status, unlink, preferences) will be added in section-06.

#### Router Structure (Admin Portion)

```typescript
import { z } from "zod";
import crypto from "crypto";
import { router, adminProcedure, protectedProcedure } from "../_core/trpc";
import { getDb } from "../db";
import { systemSettings } from "../../drizzle/schema";
import { eq, and } from "drizzle-orm";
import { encrypt, decrypt } from "../services/crypto";
import { clearTelegramCache } from "../services/telegramService";

export const telegramRouter = router({
  // --- Admin endpoints ---
  getTelegramSettings: adminProcedure.query(async () => { /* ... */ }),
  updateTelegramSettings: adminProcedure.input(/* ... */).mutation(async ({ input, ctx }) => { /* ... */ }),
  testTelegramConnection: adminProcedure.mutation(async () => { /* ... */ }),
  registerWebhook: adminProcedure.mutation(async () => { /* ... */ }),

  // --- User endpoints (section-06) ---
  // generateTelegramLink, checkTelegramStatus, unlinkTelegram, updateTelegramPreferences
});
```

#### `getTelegramSettings` Endpoint

**Procedure type:** `adminProcedure` (query)

**Behavior:**
1. Query all rows from `system_settings` where `category = "telegram"`.
2. Build a result object with these keys: `botToken`, `botUsername`, `webhookSecret`, `appUrl`, `enabled`.
3. For sensitive values (`bot_token`, `webhook_secret`): if the value exists, show a masked version. For `bot_token`, decrypt it first then show only the last 4 characters (e.g., `"****WXYZ"`). For `webhook_secret`, show `"****configured"`.
4. For non-sensitive values (`bot_username`, `app_url`, `enabled`): return as-is.

**Return shape:**
```typescript
{
  botToken: string | null;       // Masked or null
  botTokenConfigured: boolean;
  botUsername: string | null;
  webhookSecret: string | null;  // Masked or null
  webhookSecretConfigured: boolean;
  appUrl: string | null;
  enabled: boolean;
}
```

This follows the same masking pattern used by `getStripeSettings` and `getSmtpSettings` in the existing `systemSettings.ts` router.

#### `updateTelegramSettings` Endpoint

**Procedure type:** `adminProcedure` (mutation)

**Input schema:**
```typescript
z.object({
  botToken: z.string().optional(),
  botUsername: z.string().max(64).optional(),
  appUrl: z.string().url().optional(),
  enabled: z.boolean().optional(),
})
```

**Behavior:**
1. Build an array of key-value pairs to upsert into `system_settings` with `category = "telegram"`.
2. If `botToken` is provided, encrypt it using `encrypt()` from `crypto.ts` before storing. Mark as `isSensitive: true`.
3. For each key-value pair, check if a row exists. If yes, UPDATE. If no, INSERT. This follows the exact upsert pattern from `updateSmtpSettings` and `updateStripeSettings`.
4. **Auto-generate webhook_secret:** After processing the input fields, check if a `webhook_secret` row exists. If not, generate one using `crypto.randomBytes(32).toString('hex')`, encrypt it, and insert it as a new `system_settings` row with `isSensitive: true`.
5. Call `clearTelegramCache()` from `telegramService.ts` after all updates succeed. This ensures the delivery service picks up new settings on next use.
6. Set `updatedBy: ctx.user.id` on all inserts/updates.

#### `testTelegramConnection` Endpoint

**Procedure type:** `adminProcedure` (mutation)

**Behavior:**
1. Read the `bot_token` from `system_settings` (category `"telegram"`, key `"bot_token"`).
2. Decrypt it using `decrypt()`.
3. Call the Telegram Bot API `getMe` endpoint: `GET https://api.telegram.org/bot{decryptedToken}/getMe`.
4. Use `fetch()` with a timeout (10 seconds).
5. On success (response `.ok === true` and `.result` present): return `{ success: true, botInfo: { username, firstName } }`.
6. On failure: return `{ success: false, error: <description from Telegram or generic message> }`.

This is analogous to `testStripeConnection` which calls the Stripe API to verify the stored key.

#### `registerWebhook` Endpoint

**Procedure type:** `adminProcedure` (mutation)

**Behavior:**
1. Read `bot_token`, `webhook_secret`, and `app_url` from `system_settings`.
2. Decrypt the token and webhook secret.
3. Construct the webhook URL: `{app_url}/api/webhook/telegram` (this is the URL that will be proxied to the Python backend).
4. Call Telegram Bot API `setWebhook`: `POST https://api.telegram.org/bot{token}/setWebhook` with JSON body:
   ```json
   {
     "url": "https://app.example.com/api/webhook/telegram",
     "secret_token": "<decrypted webhook secret>",
     "allowed_updates": ["message"]
   }
   ```
5. `allowed_updates: ["message"]` limits webhook events to messages only (no inline queries, callback queries, etc.), reducing unnecessary traffic.
6. On success: return `{ success: true, message: "Webhook registered successfully" }`.
7. On failure: return `{ success: false, error: <description> }`.

### 3. Register the Router in appRouter

In `/home/dev/projects/SmartSpecPro/apps/web/server/routers.ts`:

1. Add the import at the top with the other router imports:
   ```typescript
   import { telegramRouter } from "./routers/telegram";
   ```

2. Add to the `appRouter` object, alongside the other routers (after `videoEditorProjects` or wherever appropriate):
   ```typescript
   // Telegram notifications
   telegram: telegramRouter,
   ```

### 4. System Settings Entries

When the admin first saves Telegram settings, the following entries are created in the `system_settings` table:

| category | key | isSensitive | Description |
|----------|-----|-------------|-------------|
| `telegram` | `bot_token` | `true` | Encrypted Telegram Bot API token |
| `telegram` | `bot_username` | `false` | Bot username for deep link generation |
| `telegram` | `webhook_secret` | `true` | Auto-generated, encrypted. Used to validate incoming webhook requests |
| `telegram` | `app_url` | `false` | Base URL for "View in SmartSpecPro" inline buttons |
| `telegram` | `enabled` | `false` | `"true"` or `"false"` -- master toggle |

### 5. Cache Pattern

The cache pattern follows the existing SMS service approach but simplified. The plan specifies: "Follow the existing SMS cache pattern: maintain module-level cached settings, provide a `clearTelegramCache()` function called from `updateTelegramSettings`. Do NOT use time-based cache refresh."

The `clearTelegramCache()` function is defined in `telegramService.ts` (section-03). This section's `updateTelegramSettings` endpoint calls it after a successful settings update. The telegramService module maintains module-level cached bot settings (token, username, app_url, enabled, webhook_secret) and re-reads them from DB on the next call after cache is cleared.

Key difference from SMS cache: no time-based TTL. The cache is only invalidated by explicit `clearTelegramCache()` calls.

---

## Implementation Checklist

1. Write the test file at `/home/dev/projects/SmartSpecPro/apps/web/server/routers/telegram.test.ts` with the stubs above.
2. Update `/home/dev/projects/SmartSpecPro/apps/web/server/routers/systemSettings.ts` line 17: add `"telegram"` to `settingCategorySchema`.
3. Create `/home/dev/projects/SmartSpecPro/apps/web/server/routers/telegram.ts` with the four admin endpoints.
4. Update `/home/dev/projects/SmartSpecPro/apps/web/server/routers.ts`: import `telegramRouter` and register it as `telegram` in `appRouter`.
5. Run `pnpm test -- server/routers/telegram.test.ts` from `apps/web/` to verify tests pass.
6. Run `pnpm check` from `apps/web/` to verify no type errors.

---

## Key Patterns to Follow

The existing codebase has strong conventions for admin settings endpoints. Study these files for reference:

- **Stripe settings pattern** (masking, encryption, test connection): `/home/dev/projects/SmartSpecPro/apps/web/server/routers/systemSettings.ts` lines 67-202
- **SMTP settings pattern** (upsert loop, cache clearing): `/home/dev/projects/SmartSpecPro/apps/web/server/routers/systemSettings.ts` lines 756-881
- **SMS settings pattern** (module-level cache, clearCache export): `/home/dev/projects/SmartSpecPro/apps/web/server/services/smsService.ts` lines 19-64
- **tRPC procedure types**: `/home/dev/projects/SmartSpecPro/apps/web/server/_core/trpc.ts` -- use `adminProcedure` for all four endpoints
- **Encryption functions**: `/home/dev/projects/SmartSpecPro/apps/web/server/services/crypto.ts` -- `encrypt()` and `decrypt()`

The upsert pattern for `system_settings` is: query for existing row by `(category, key)`, if exists UPDATE, otherwise INSERT. Every settings router in the codebase uses this pattern.
