# Integration Notes — Opus Review Feedback

## Suggestions Integrated

### 1. `settingCategorySchema` update — INTEGRATING
The schema needs "telegram" added. Will note this explicitly in the plan.

### 2. `passwordChangedAt` schema drift — INTEGRATING
Will add a note to verify migration safety and recommend adding `passwordChangedAt` to schema.ts first.

### 3. Cross-service data integrity — INTEGRATING
Will explicitly require single UPDATE statement in Python webhook and canonical check on `telegramVerified`.

### 4. Verification code entropy increase — INTEGRATING
Changing to `crypto.randomBytes(16).toString('hex')` (32 chars, 128 bits). No UX cost since users click a link.

### 5. Webhook CSRF/auth middleware exemption — INTEGRATING
Will add explicit note about excluding the endpoint from middleware.

### 6. Private chat validation — INTEGRATING
Will add `message.chat.type === "private"` check.

### 7. Centralized `createNotification()` wrapper — INTEGRATING
This is architecturally correct. Will define a single function that all 6 call sites use, handling both DB insert and Telegram enqueue.

### 8. HTML parse mode instead of MarkdownV2 — INTEGRATING
Strong recommendation. HTML escaping (`<`, `>`, `&`) is far simpler and less error-prone than MarkdownV2.

### 9. `clearTelegramCache()` pattern — INTEGRATING
Will follow SMS cache pattern instead of time-based caching.

### 10. Move `telegramConsecutiveFailures` to Redis counter — INTEGRATING
Avoids JSON race condition. Use `telegram:failures:{userId}` in Redis with INCR/DEL.

### 11. Clear failures on unlink — INTEGRATING
Add to `unlinkTelegram` mutation.

### 12. Store Telegram username during verification — INTEGRATING
Add `telegramUsername` column to users table. Extract from webhook Update `message.from.username`.

### 13. Prompt for notification level after linking — INTEGRATING
Show notification level selector immediately upon successful linking in the UI flow.

### 14. Resolve router contradiction — INTEGRATING
Using a single `telegram.ts` router for both admin and user endpoints. Register in `appRouter`.

### 15. Redis connection sharing — INTEGRATING
Use separate Redis connection for Telegram queue, add shutdown function.

### 16. BullMQ attempts — INTEGRATING
Standardize to 3 attempts (matching existing scheduler pattern).

## Suggestions NOT Integrated

### Multi-tenancy consideration
Not integrating multi-tenant bot support. The scale is < 100 users and the system uses a single global bot. Will add a note stating this is a global feature, not per-tenant.

### Audit logging
Not integrating full audit logging for this feature. The existing audit system is focused on LLM/media operations. Basic console.log is sufficient at < 100 users scale. Can be added later if needed.

### Migration rollback plan
The Database Safety Protocol in CLAUDE.md already mandates backups before migration. No need to duplicate this in the plan — the implementer will follow the protocol.

### Detailed test plan
Will add test file names and high-level test cases, but not detailed test implementations (that's deep-implement's job per plan-writing guidelines).

### Admin guide documentation
Out of scope for implementation plan. Can be written separately.
