<!-- PROJECT_CONFIG
runtime: typescript-pnpm
test_command: pnpm test
END_PROJECT_CONFIG -->

<!-- SECTION_MANIFEST
section-01-schema-migration
section-02-notification-service
section-03-telegram-service
section-04-admin-backend
section-05-webhook-python
section-06-user-backend
section-07-admin-ui
section-08-user-ui
section-09-integration
section-10-testing
END_MANIFEST -->

# Implementation Sections Index

## Dependency Graph

| Section | Depends On | Blocks | Parallelizable |
|---------|------------|--------|----------------|
| section-01-schema-migration | - | 02, 03, 04, 05, 06 | Yes |
| section-02-notification-service | 01 | 09 | Yes |
| section-03-telegram-service | 01 | 04, 06, 07, 09 | Yes |
| section-04-admin-backend | 01, 03 | 07 | No |
| section-05-webhook-python | 01 | 06 | Yes |
| section-06-user-backend | 01, 03, 05 | 08 | No |
| section-07-admin-ui | 04 | - | No |
| section-08-user-ui | 06 | - | No |
| section-09-integration | 02, 03 | - | No |
| section-10-testing | 01-09 | - | No |

## Execution Order

1. **Batch 1:** section-01-schema-migration (no dependencies)
2. **Batch 2:** section-02-notification-service, section-03-telegram-service, section-05-webhook-python (parallel after 01)
3. **Batch 3:** section-04-admin-backend, section-06-user-backend (after 01+03 and 01+03+05)
4. **Batch 4:** section-07-admin-ui, section-08-user-ui, section-09-integration (after respective deps)
5. **Batch 5:** section-10-testing (after all)

## Section Summaries

### section-01-schema-migration
Fix `passwordChangedAt` schema drift. Add `telegramChatId`, `telegramUsername`, `telegramVerified`, `telegramVerifiedAt` columns to users table. Extend `userPreferences` type. Update `settingCategorySchema` to include "telegram". Generate and apply Drizzle migration.

### section-02-notification-service
Create centralized `createNotification()` wrapper in `apps/web/server/services/notificationService.ts`. Refactor all 6 `db.insert(userNotifications)` call sites in `scheduler.ts`, `follows.ts`, `mediaJobs.ts` to use this wrapper.

### section-03-telegram-service
Create `apps/web/server/services/telegramService.ts` with: `escapeHtml()`, `formatTelegramMessage()` (HTML parse mode), `sendTelegramMessage()` (Bot API client), `enqueueTelegramNotification()` (eligibility checks + queue), BullMQ queue/worker setup, `clearTelegramCache()`. Initialize queue in `_core/index.ts` with shutdown handler.

### section-04-admin-backend
Create `apps/web/server/routers/telegram.ts` with admin endpoints: `getTelegramSettings`, `updateTelegramSettings`, `testTelegramConnection`, `registerWebhook`. Register router in `appRouter`. Webhook secret auto-generation.

### section-05-webhook-python
Create `python-backend/app/api/telegram_webhook.py` with `POST /webhook/telegram`. Handle `/start {code}` verification, private chat validation, brute-force protection. Register in FastAPI app with CSRF/auth middleware exemption.

### section-06-user-backend
Add user endpoints to `telegram.ts` router: `generateTelegramLink`, `checkTelegramStatus`, `unlinkTelegram`, `updateTelegramPreferences`. Redis verification code management.

### section-07-admin-ui
Add "Telegram Bot" tab to `AdminSettings.tsx` with bot token, bot username, app URL, enable/disable, test connection, and register webhook controls.

### section-08-user-ui
Add "Telegram Notifications" section to user Settings page with link/unlink flow, verification polling, notification level selector, delivery failure warning.

### section-09-integration
Wire `createNotification()` to call `enqueueTelegramNotification()`. Ensure all 6 notification creation points go through the centralized wrapper. End-to-end notification flow validation.

### section-10-testing
Write Vitest tests for `telegramService.test.ts`, `notificationService.test.ts`, `telegram.test.ts`. Write pytest tests for `test_telegram_webhook.py`. Mock Telegram API, Redis, and DB.
