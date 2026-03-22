# Interview Transcript — Feature 049: Enterprise Notification System

## Q1: Expected notification volume per user per day?

**Answer:** Medium (50-500/day). Active users with media jobs, team runs, and monitoring. Dedup is important, retention job needed.

**Impact:** Dedup windows should be meaningful (5-10 min as spec suggests). Cursor-based pagination can wait for Phase 6. Retention job runs daily. LIMIT/OFFSET acceptable for Phase 4-5.

## Q2: Which phases to prioritize?

**Answer:** All phases (4-7). Full enterprise notification system planned as a single implementation.

**Impact:** Plan covers all 4 phases with proper dependency ordering. Phase 4 → 5 → 6 → 7 sequential implementation. Feature flags enable incremental rollout.

## Q3: Escalation policy — override or respect preferences?

**Answer:** Override preferences. Critical escalations bypass user preferences — always deliver on all available channels.

**Impact:** Escalation job must skip preference checks for escalated notifications. Add an `isEscalated` flag or check escalation context in the delivery pipeline. All channels (in-app, email, Telegram) are attempted for escalated alerts.

## Q4: Webhook scope — tenant-only or tenant + user?

**Answer:** Tenant + User. Both tenant-wide and per-user webhooks supported.

**Impact:** `notificationWebhooks` table needs an optional `userId` column. Tenant webhooks (userId=null) fire for all tenant notifications. User webhooks fire for that user's notifications only. SSRF validation required on both. Two webhook management UIs: admin page (tenant-wide) + user settings page (personal).

## Q5: Email digest frequency options?

**Answer:** Hourly + Daily only. Two frequencies cover most use cases.

**Impact:** BullMQ digest job runs hourly. For "daily" users, it checks if it's the configured digest hour before sending. No weekly option needed.

---

## Auto-Decisions (Technical — Not Asked)

1. **Database ORM:** Drizzle ORM with pgTable, camelCase columns (matches existing schema.ts pattern)
2. **Testing framework:** Vitest with chainable Drizzle mocks (matches notificationService.test.ts)
3. **API layer:** tRPC routers with protectedProcedure/adminProcedure (matches existing routers)
4. **Job scheduling:** BullMQ recurring jobs for escalation, digest, retention (spec recommends, superior to current setInterval pattern)
5. **Real-time:** Existing Redis pub/sub + SSE pattern (no architectural changes)
6. **Frontend framework:** Radix UI + Tailwind + TanStack Query (matches existing admin pages)
7. **Feature flags:** Simple boolean flags in featureFlags.ts (matches existing pattern)
8. **Dedup strategy:** Option A from spec — unique partial index + ON CONFLICT (avoids race conditions, no Redis lock needed)
9. **Operator allowlist:** TypeScript enum with switch statement (spec S7, prevents injection)
10. **Webhook signing:** HMAC-SHA256 with encrypted secret (spec S9)
11. **SSE reconnection:** Exponential backoff with max 5 attempts (spec fix)
12. **Enum migration:** Standalone ALTER TYPE ADD VALUE outside transaction (PostgreSQL requirement)
