Now I have all the context I need. Let me generate the content for section-06-user-backend. This section covers the user-facing backend endpoints for Telegram account linking and preferences management.

---

# Section 06: User Backend Endpoints

## Overview

This section implements the user-facing tRPC endpoints for Telegram account linking and notification preferences. These endpoints allow users to:
- Generate a verification deep link to connect their Telegram account
- Poll their account status to detect when verification completes
- Configure notification preferences (priority level)
- Unlink their Telegram account

All endpoints are added to the `telegram.ts` router created in Section 04 (Admin Backend), using `protectedProcedure` to ensure authentication.

## Dependencies

- **Section 01 (Schema Migration)**: Must be complete — this section reads/writes `telegramChatId`, `telegramUsername`, `telegramVerified`, `telegramVerifiedAt`, and `userPreferences.telegramNotifyLevel`
- **Section 03 (Telegram Service)**: Must be complete — this section uses cached system settings to fetch `bot_username` for deep link generation
- **Section 05 (Webhook Python)**: Must be complete — the verification flow relies on the Python webhook to update user records when the user clicks the deep link

## Tests First

Tests are defined in `apps/web/server/routers/telegram.test.ts`. Add the following test cases BEFORE implementing the endpoints:

```typescript
// generateTelegramLink:
// Test: generates 32-char hex verification code (128 bits)
// Test: stores code in Redis with 300s TTL
// Test: returns deep link with correct bot username
// Test: returns expiry time of 300 seconds
// Test: rejects if Telegram feature is not enabled (system_settings)

// checkTelegramStatus:
// Test: returns linked=true when telegramVerified is true
// Test: returns linked=false when telegramVerified is false (even if chatId exists)
// Test: returns username from telegramUsername column
// Test: returns deliveryFailing flag from userPreferences
// Test: returns current telegramNotifyLevel

// unlinkTelegram:
// Test: sets telegramChatId, telegramUsername to null
// Test: sets telegramVerified to false, telegramVerifiedAt to null
// Test: clears telegramNotifyLevel from userPreferences
// Test: clears telegramDeliveryFailing from userPreferences
// Test: deletes Redis key telegram:failures:{userId}

// updateTelegramPreferences:
// Test: updates telegramNotifyLevel in userPreferences JSON
// Test: rejects invalid notifyLevel values
// Test: only updates telegramNotifyLevel, preserves other userPreferences
```

## Implementation

### File Location

Add endpoints to: `/home/dev/projects/SmartSpecPro/apps/web/server/routers/telegram.ts`

This file already contains the admin endpoints from Section 04. Add the user endpoints to the same router.

### Endpoint Definitions

#### 1. generateTelegramLink

**Purpose:** Generate a verification code and return a Telegram deep link for the user to click.

**Signature:**
```typescript
generateTelegramLink: protectedProcedure
  .mutation(async ({ ctx }) => {
    // Implementation stub
  })
```

**Logic:**
1. Check if Telegram feature is enabled via system_settings `telegram.enabled` (reuse cache from Section 03's `telegramService.ts`)
2. Throw TRPCError if disabled: `{ code: "PRECONDITION_FAILED", message: "Telegram notifications are not enabled" }`
3. Generate verification code: `crypto.randomBytes(16).toString('hex')` (32-char hex string = 128 bits entropy)
4. Fetch `bot_username` from system_settings (cached)
5. Store code in Redis: `SET telegram:verify:{code} JSON.stringify({ userId: ctx.user.id, createdAt: Date.now(), attempts: 0 }) EX 300`
6. Return: `{ code, deepLink: "https://t.me/{bot_username}?start={code}", expiresIn: 300 }`

**Redis access:** Use the existing Redis client from `apps/web/server/services/redis.ts`.

#### 2. checkTelegramStatus

**Purpose:** Return current Telegram linking status and preferences for the authenticated user.

**Signature:**
```typescript
checkTelegramStatus: protectedProcedure
  .query(async ({ ctx }) => {
    // Implementation stub
  })
```

**Logic:**
1. Query users table: `SELECT telegramChatId, telegramUsername, telegramVerified, telegramVerifiedAt, userPreferences FROM users WHERE id = ctx.user.id`
2. Return:
```typescript
{
  linked: user.telegramVerified === true,  // Canonical signal
  username: user.telegramUsername || undefined,
  verifiedAt: user.telegramVerifiedAt || undefined,
  notifyLevel: user.userPreferences?.telegramNotifyLevel || "off",
  deliveryFailing: user.userPreferences?.telegramDeliveryFailing || false
}
```

**Note:** Check `telegramVerified === true` as the canonical signal for a linked account, not just the presence of `telegramChatId`. This prevents false positives if a user starts linking but doesn't complete the flow.

#### 3. unlinkTelegram

**Purpose:** Disconnect the user's Telegram account and clear all related settings.

**Signature:**
```typescript
unlinkTelegram: protectedProcedure
  .mutation(async ({ ctx }) => {
    // Implementation stub
  })
```

**Logic:**
1. Update users table:
```sql
UPDATE users
SET 
  "telegramChatId" = NULL,
  "telegramUsername" = NULL,
  "telegramVerified" = false,
  "telegramVerifiedAt" = NULL,
  "userPreferences" = jsonb_set(
    jsonb_set(
      "userPreferences",
      '{telegramNotifyLevel}',
      'null'::jsonb
    ),
    '{telegramDeliveryFailing}',
    'null'::jsonb
  )
WHERE id = ?
```
2. Delete Redis failure counter: `DEL telegram:failures:{userId}`
3. Return: `{ success: true }`

**Drizzle ORM approach:** Use the `update()` API with SQL functions for JSON manipulation, or read-modify-write the userPreferences object.

#### 4. updateTelegramPreferences

**Purpose:** Update the user's notification priority level.

**Signature:**
```typescript
updateTelegramPreferences: protectedProcedure
  .input(z.object({
    notifyLevel: z.enum(["all", "high_critical", "critical_only", "off"])
  }))
  .mutation(async ({ input, ctx }) => {
    // Implementation stub
  })
```

**Logic:**
1. Validate input schema (Zod does this automatically)
2. Fetch current userPreferences from users table
3. Update only `telegramNotifyLevel`, preserve all other keys
4. Write back to database:
```typescript
await ctx.db.update(users)
  .set({
    userPreferences: {
      ...currentPreferences,
      telegramNotifyLevel: input.notifyLevel
    }
  })
  .where(eq(users.id, ctx.user.id));
```
5. Return: `{ success: true }`

**Important:** Do NOT overwrite other userPreferences keys like `translationLanguage` or `translationModel`. Only update the `telegramNotifyLevel` field.

### Error Handling

| Error Scenario | Response |
|----------------|----------|
| Feature disabled | `TRPCError { code: "PRECONDITION_FAILED", message: "Telegram notifications are not enabled" }` |
| Redis unavailable | `TRPCError { code: "INTERNAL_SERVER_ERROR", message: "Failed to generate verification link" }` |
| Invalid notifyLevel | Zod validation error (automatic) |
| User not found | Should never happen (auth middleware ensures user exists) |

### Security Considerations

1. **Verification code entropy:** 128 bits (16 random bytes) is sufficient for a 5-minute TTL
2. **Code reuse prevention:** Redis stores attempt counter; webhook deletes code after successful verification (Section 05)
3. **Brute force protection:** Webhook enforces per-chat-id rate limits (Section 05)
4. **No CSRF on webhook:** The webhook uses header-based auth (`X-Telegram-Bot-Api-Secret-Token`) which cannot be replayed via CSRF
5. **Authorization:** All endpoints use `protectedProcedure` — only authenticated users can call them

### Integration Points

**Section 03 (Telegram Service):**
- Reuse cached system settings via `getCachedTelegramSettings()` or equivalent function for reading `bot_username` and `enabled` flag

**Section 05 (Webhook Python):**
- When webhook receives `/start {code}`, it looks up `telegram:verify:{code}` in Redis
- Webhook updates users table with `telegramChatId`, `telegramUsername`, `telegramVerified=true`, `telegramVerifiedAt=now()`
- Frontend polls `checkTelegramStatus` until `linked === true`

**Section 08 (User UI):**
- Settings page calls `generateTelegramLink` when user clicks "Link Telegram Account"
- Polls `checkTelegramStatus` every 3 seconds until linked
- Calls `updateTelegramPreferences` when user changes notification level
- Calls `unlinkTelegram` when user clicks "Unlink" button

### Redis Key Schema

| Key Pattern | Value Type | TTL | Purpose |
|-------------|-----------|-----|---------|
| `telegram:verify:{code}` | JSON `{ userId, createdAt, attempts }` | 300s | Verification code lookup |
| `telegram:failures:{userId}` | Counter (string) | None | Track consecutive delivery failures (incremented by worker) |

**Note:** The `telegram:failures:{userId}` key is managed by the notification worker (Section 03), not by these endpoints. The `unlinkTelegram` endpoint deletes it to ensure clean state after unlinking.

### Code Structure

Add these endpoints to the existing `telegramRouter` in `telegram.ts`:

```typescript
export const telegramRouter = router({
  // Admin endpoints (from Section 04)
  getTelegramSettings: adminProcedure.query(...),
  updateTelegramSettings: adminProcedure.mutation(...),
  testTelegramConnection: adminProcedure.mutation(...),
  registerWebhook: adminProcedure.mutation(...),
  
  // User endpoints (this section)
  generateTelegramLink: protectedProcedure.mutation(...),
  checkTelegramStatus: protectedProcedure.query(...),
  unlinkTelegram: protectedProcedure.mutation(...),
  updateTelegramPreferences: protectedProcedure.input(...).mutation(...),
});
```

No additional router registration needed — the router is already registered in `appRouter` from Section 04.

## Verification Flow Diagram

```
Frontend                    Node.js Backend (this section)      Redis                Python Webhook (Section 05)
────────                    ──────────────────────────────      ─────                ─────────────────────────────
User clicks "Link"
  │
  ├─► generateTelegramLink()
  │      │
  │      ├─► Check telegram.enabled in system_settings (cached)
  │      ├─► Generate 32-char hex code: crypto.randomBytes(16).toString('hex')
  │      ├─► Fetch bot_username from system_settings (cached)
  │      └─► SET telegram:verify:{code} { userId, createdAt, attempts:0 } EX 300 ──►
  │                                                                                     │
  ◄──{ deepLink: "https://t.me/BotName?start={code}", expiresIn: 300 }                │
  │                                                                                     │
  │ Show link + instructions                                                           │
  │                                                                                     │
  │ Start polling (every 3s)                                                           │
  ├─► checkTelegramStatus() ──► Query users table                                     │
  ◄──{ linked: false, ... }                                                            │
  │                                                                                     │
  │                                                                                     │
  │ User clicks deep link in Telegram                                                  │
  │ Telegram sends webhook request ──────────────────────────────────────────────────►│
  │                                                                                     │
  │                                                               GET telegram:verify:{code} ◄┤
  │                                                                      ▼                    │
  │                                                               (validate code)            │
  │                                                                      │                    │
  │                                                          UPDATE users SET chatId, username, verified ─┤
  │                                                                      │                                │
  │                                                               DEL telegram:verify:{code} ───────────►│
  │                                                                      │                                │
  │                                                               Send confirmation via Bot API          │
  │                                                                                                       │
  │ (Next poll cycle)                                                                                    │
  ├─► checkTelegramStatus() ──► Query users table                                                       │
  ◄──{ linked: true, username: "@john_doe", ... }                                                       │
  │                                                                                                       │
  └─► Show success + prompt for notification level
```

## Implementation Checklist

- [ ] Write test stubs in `telegram.test.ts` for all 4 endpoints (12 test cases total)
- [ ] Add `generateTelegramLink` endpoint with code generation, Redis storage, and deep link construction
- [ ] Add `checkTelegramStatus` endpoint with canonical `telegramVerified` check
- [ ] Add `unlinkTelegram` endpoint with JSON field clearing and Redis cleanup
- [ ] Add `updateTelegramPreferences` endpoint with userPreferences partial update
- [ ] Verify all endpoints use `protectedProcedure` (not `publicProcedure`)
- [ ] Test Redis key expiry (verify code expires after 5 minutes)
- [ ] Test integration with Section 05 webhook (end-to-end verification flow)
- [ ] Run full test suite: `cd apps/web && pnpm test -- server/routers/telegram.test.ts`

## File Summary

**Modified Files:**
- `/home/dev/projects/SmartSpecPro/apps/web/server/routers/telegram.ts` — Add 4 user endpoints to existing router

**No New Files** — All endpoints added to the existing `telegram.ts` router.

## Next Steps

After completing this section:
- **Section 08 (User UI)** can implement the Settings page section that calls these endpoints
- **Section 10 (Testing)** will write full unit tests for endpoint logic and validation