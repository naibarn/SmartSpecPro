# Section 05 Code Review Interview

## User Decisions

### Q1: OIDC Auth + Telegram Rate Limiting
**Question:** (1) /tasks/* endpoints have no OIDC auth — defer to section 18 or add now? (2) Telegram rate limiting removed — accept for low volume?
**Answer:** Fix both now.
**Applied:** Added OIDC validation middleware for production (google-auth-library), shared-secret/localhost for dev. Added Telegram rate limiting (25 msg/s token bucket) and retry with exponential backoff (3 retries). Bot-blocked detection sets telegramVerified=false.

## Auto-fixes Applied

### Fix 1: Package.json indentation
- `class-variance-authority` line lost indentation when bullmq was removed
- Fixed: restored 4-space indent

### Fix 2: Missing /tasks/execute-skill-step handler
- `addSkillJob()` enqueues to Cloud Tasks with handler path `/tasks/execute-skill-step`
- But only `deliver-scheduled-message` and `deliver-scheduled-fallback` handlers existed
- Fixed: Added execute-skill-step handler that imports skillRegistry + skillExecutor

### Fix 3: Dead dbRef variable in telegramService.ts
- `dbRef` was set in init and cleared in shutdown but never read
- Fixed: Removed dbRef, prefixed unused db param with underscore

### Fix 4: setTimeout leak in purgeOldTrashItems.ts
- Initial `setTimeout` handle was not tracked, so shutdown could miss it
- Fixed: Track `initialTimeoutId` and clear it in shutdown
- Also consolidated duplicate `eq` import into single drizzle-orm import line

### Fix 5: cloudTasksMetrics.ts creating new client per call
- Each `getQueueMetrics()` call created a new `CloudTasksClient` (6 per refresh)
- Fixed: Added singleton `_metricsClient` pattern matching cloudTasks.ts approach
- Added documentation note about pageSize=100 cap on task counts

## Items Let Go (Acceptable)

- `addUsageJob` only logs (preserves existing BullMQ behavior which was also just logging)
- `dispatchRate` shows max configured rate, not actual throughput (documented in display as `/s`)
- `listTasks` capped at pageSize=100 (acceptable for admin dashboard)
- Redis comments still reference BullMQ (cosmetic, non-functional)
- CLAUDE.md not updated (documentation scope, not code)
- `verification.test.ts` still has BullMQ todo (existing test file, not in scope)
