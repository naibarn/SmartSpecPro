# Section 10 Code Review — Phase 7 Email Delivery Service and Digest Job

**Spec:** `specs/feature/049-enterprise-notification-system/sections/section-10-phase7-email-delivery.md`
**Diff:** `specs/feature/049-enterprise-notification-system/implementation/code_review/section-10-diff.md`
**Reviewer:** SSP Reviewer Agent (CMD-8)
**Date:** 2026-03-21

---

## Review Report

### Verdict: APPROVE_WITH_FIXES

---

### Findings

| Severity | File:Line | Issue | Recommended Fix |
|---|---|---|---|
| HIGH | `notificationService.ts:506` | `NOTIFICATION_EMAIL_DELIVERY` feature flag gate is absent — email fires unconditionally whenever `channels.email` is true, with no tenant flag check | Add `const emailDeliveryEnabled = tenant?.featureFlags?.notificationEmailDelivery ?? false;` guard wrapping the email block; add `notificationEmailDelivery: boolean` as F24 to `TenantFeatureFlags` in `featureFlags.ts` |
| HIGH | `notificationService.ts:1185` | Locale is hardcoded to `"en"` — `users` table has no `locale` column (confirmed absent from schema.ts), so the spec's fallback instruction was followed but silently; Thai users always receive English emails | Hardcode is not wrong given the schema, but this must be documented as a known gap and the `locale` column must be added to `users` in a future schema migration; alternatively, derive locale from `users.settings` JSON if it exists |
| HIGH | `notificationDigestJob.ts:191-192` | BullMQ connection is extracted via `redis.options?.host` / `redis.options?.port` from an IORedis instance. `redisClients.ts` creates clients from a URL string (`new Redis(url, ...)`); when parsed from a URL the `options.host` and `options.port` are unreliable or absent on some IORedis versions, causing the BullMQ queue and worker to connect to `localhost:6379` even in production (where Redis may be on a different host/port or use TLS) | Follow the pattern used by `deliveryQueue.ts` and `escalationJob.ts` — import `getRealtimeClient` from `../services/redisClients` and pass the IORedis instance directly as the BullMQ connection: `{ connection: getRealtimeClient() }`. Do NOT reconstruct host/port from `options` |
| MEDIUM | `notificationDigestJob.ts:348-351` | `emailDigestFrequency IS NOT NULL` is not enforced in the SQL query — the Drizzle `.where()` only filters `email = true`, leaving the `isNotNull` check to in-app code (`if (!u.emailDigestFrequency) continue`). On large user sets this fetches rows from the DB that are immediately discarded | Import `isNotNull` from `drizzle-orm` and add `isNotNull(notificationPreferences.emailDigestFrequency)` to the `.where()` conjunction |
| MEDIUM | `notificationDigestJob.ts:356-362` | Deduplication strategy picks the first preference row seen for each userId, discarding all others. If a user has email enabled in category A but the first row scanned is category B (email enabled, different category), category B's frequency and hour are used for all sends. Category-level digest granularity is lost | The spec says "collect all categories where email is enabled"; after deduplication, re-query (or aggregate in-query) to find the minimum `emailDigestFrequency` per user, or union all email-enabled categories under a single send |
| MEDIUM | `notificationDigestJob.ts:394-406` | Notification query uses bare `db.select()` which fetches all columns (`SELECT *`) from `userNotifications`. This includes large/sensitive fields like `metadata`, `actionUrl`, and any future columns, when only `id, title, content, priority, createdAt, actionUrl` are actually needed | Replace with `db.select({ id: userNotifications.id, title: userNotifications.title, ... })` listing only the fields passed to `sendNotificationDigest` |
| MEDIUM | `notificationEmailService.ts:1044-1049` | `userId` is logged as the literal string `"redacted"` in the success log, defeating observability. The spec requires `console.log("[NotificationEmail] Sent immediate email", { userId, notificationId, priority })`. The `sendNotificationEmail` function signature does not receive `userId` so it has no value to log — but `"redacted"` is misleading | Either add `userId?: number` to the `sendNotificationEmail` params and log it, or remove the `userId` key from the log entirely rather than writing a lie |
| MEDIUM | `notificationEmailService.ts:1025` | `badge.color` (e.g., `"#f59e0b"`) is interpolated directly into inline `style=""` HTML without any validation. If the `PRIORITY_BADGE` map were extended with user-controlled input, this would be a CSS injection vector | Since `PRIORITY_BADGE` is a static constant this is low-risk today, but the badge color should be written as a constant safe string, not an interpolation. Add a type guard: `const SAFE_COLORS = { "#f59e0b": true, "#ef4444": true } as const;` and only render the badge when the color is in the allowlist |
| MEDIUM | `notificationEmailService.test.ts:670-684` | Unsubscribe link test only asserts `/settings/notifications` is somewhere in the HTML, not that it is correctly embedded in an `<a href="...">` element with the full `PUBLIC_URL` prefix (spec requires `${ENV.publicUrl}/settings/notifications`) | Add assertion: `expect(html).toContain('href="https://smartaihub.app/settings/notifications"')` or the env-configured equivalent |
| LOW | `notificationDigestJob.ts:465-508` | `initializeDigestJob` uses `getRedisClient()` from `../services/redis` (the legacy single-Redis export) for the null-check, but then extracts host/port to pass a plain connection config to BullMQ. The rest of the codebase splits cache vs. realtime clients via `redisClients.ts`. This inconsistency will break in the split-Redis production deployment | Use `getRealtimeClient()` from `../services/redisClients` for BullMQ, consistent with `deliveryQueue.ts` |
| LOW | `notificationDigestJob.test.ts:65-69` | "queries users with email=true" test only asserts `mockWhere` was called — it does not verify the WHERE clause content. A bug that drops the `email=true` condition would still pass this test | Assert `mockWhere.mock.calls[0]` contains an `and(eq(notificationPreferences.email, true), ...)` argument, or restructure to call the real Drizzle builder with a spy |
| LOW | `notificationDigestJob.test.ts:181-208` | "sets Redis key with 7-day TTL" and "updates last digest time" are two separate tests that exercise the same code path. Both pass `notifications.length > 0` to trigger `sendDigest`, but neither asserts that Redis is NOT written when `sendDigest` returns `false` (the conditional `if (sent) { redis.set(...) }` branch) | Add a test: `mockSendDigest.mockResolvedValueOnce(false)` — verify `mockRedisSet` is NOT called |
| LOW | `notificationTemplateService.ts` (new stub) | The stub introduces a new file `notificationTemplateService.ts` at the same path the spec says section-12 will create with the real implementation. The stub renders raw content with no escaping. If section-12 replaces this file rather than the specific functions, any additional exports added by section-10 will be lost in the replacement | Confirm with section-12 implementer that the stub contract (`RenderedNotification`, `renderNotification`) is the interface section-12 will implement, not a separate file |
| LOW | `notificationEmailService.ts:1102` | `n.createdAt.toISOString().replace("T", " ").slice(0, 16)` — this produces UTC time with no timezone label in the digest email. Users in non-UTC timezones will see incorrect timestamps | Append " UTC" to the time string, or use `toLocaleString("en", { timeZone: "UTC", ... })` with explicit options |

---

### Contract Compliance

| Check | Status | Notes |
|---|---|---|
| `emailService.ts` exports `getSmtpConfig` and `createTransporter` | PASS | `export` keyword added to both functions; minimal change, no existing callers broken |
| `notificationEmailService.ts` uses Option A (imports from `emailService.ts`) | PASS | Correctly imports `getSmtpConfig`, `createTransporter` — no duplication |
| `sendNotificationEmail` sends only for `high`/`critical` priority | PASS | Priority guard at line 991-996 |
| `sendNotificationEmail` returns `false` when `userEmail` is falsy | PASS | Line 998 |
| `sendNotificationEmail` returns `false` when SMTP not configured | PASS | Transporter null check at line 1001 |
| `sendNotificationDigest` returns `false` on empty notifications | PASS | Line 1078 |
| Digest limited to first 20 notifications | PASS | `notifications.slice(0, 20)` at line 1089 |
| Titles truncated at 100 chars in digest | PASS | `truncate(n.title, 100)` at line 1099 |
| HTML-escaping of user-controlled content | PASS | `escapeHtml()` applied to title, content, action label, userName; implemented correctly for `&`, `<`, `>`, `"`, `'` |
| Unsubscribe link in every email | PASS | Present in both `sendNotificationEmail` and `sendNotificationDigest` HTML |
| Action URL includes `PUBLIC_URL` prefix | PASS | `PUBLIC_URL + notification.actionUrl` at line 1015 |
| `NOTIFICATION_EMAIL_DELIVERY` feature flag gates all email sends | FAIL | Flag does not exist in `featureFlags.ts`; `notificationService.ts` hook has no flag check — email delivery fires for all tenants on deploy |
| `notificationJobs.ts` registers `initializeDigestJob` and `shutdownDigestJob` | PASS | Both wrapped in try/catch blocks |
| BullMQ repeatable job at 3,600,000ms interval | PASS | `repeat: { every: 3_600_000 }` at line 486 |
| BullMQ uses `getRealtimeClient` / IORedis instance for connection | FAIL | Extracts `host`/`port` from `redis.options` instead of passing IORedis instance directly |
| Digest Redis key `notification:digest:last:{userId}` with 7-day TTL (604800s) | PASS | Line 431-436 |
| Redis unavailability falls back gracefully | PASS | Inner try/catch at line 377-392 |
| Per-user errors do not abort the entire digest run | PASS | Outer per-user try/catch at lines 365/442 |
| PII not in logs | PARTIAL | `userId` correctly logged (not email) in digest job and `sendNotificationDigest`; `sendNotificationEmail` logs `"redacted"` for userId which is misleading |
| `locale` read from `users` table in `notificationService.ts` hook | FAIL | `users` table has no `locale` column; hardcoded `"en"` passed to `sendNotificationEmail` — Thai users receive English email |
| Daily digest users processed only when UTC hour matches `emailDigestHour` | PASS | `currentHour !== digestHour` guard at line 369 |
| Daily fallback for Redis miss defaults to 24 hours ago | PASS | Line 383-387 |
| `notificationTemplateService.ts` stub exists with correct exports | PASS | Stub exports `renderNotification` matching the interface the email service expects |
| All 10 plan-required `sendNotificationEmail` tests present | PASS | All 10 test cases implemented |
| All 10 plan-required `notificationDigestJob` tests present | PASS | All 10 test cases implemented |

---

### Summary

The core email-building logic is solid: HTML escaping is thorough, the priority/digest routing is correct, the template stub contract is clean, and BullMQ scheduling follows the established pattern. Three issues need fixing before merge. The most critical is the absent `NOTIFICATION_EMAIL_DELIVERY` feature flag gate — email delivery goes live for every tenant on deploy with no rollback path. The second is the BullMQ connection extraction bug (`redis.options?.host/port`), which will silently route digest jobs to `localhost:6379` in any production environment where Redis is not on that address; the fix is a one-line change to pass the IORedis instance directly. The third is the hardcoded `"en"` locale, which is a known schema gap but must be documented rather than left as silent technical debt. The MEDIUM findings around query efficiency (`SELECT *`, missing SQL `IS NOT NULL` filter), deduplication loss, and the misleading `"redacted"` userId log are worth fixing in the same pass to avoid follow-up tickets.
