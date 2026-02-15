Now I have a thorough understanding of the current codebase and the migration plan. Let me compose the section content.

# Section 05: BullMQ Migration

## Overview

This section migrates all BullMQ-based job scheduling and queue processing from the Node.js side to Google Cloud Tasks and Cloud Scheduler. BullMQ relies on persistent Redis connections with blocking pops (`BRPOPLPUSH`), which are incompatible with Upstash Redis's serverless/HTTP model. After this migration, the `bullmq` package can be removed from `apps/web/package.json`, and the Node.js service can use Upstash for all its remaining stateless Redis needs.

**Dependency:** This section depends on Section 04 (Cloud Tasks Migration) being complete. Specifically, the `enqueueTask` function in `apps/web/server/services/cloudTasks.ts` and the Cloud Tasks OIDC validation middleware on the Python side must be operational before this section can be implemented.

**Parallelizable with:** Sections 06 (Cloud Scheduler) and 07 (Kie Integration).

---

## Current BullMQ Usage in the Codebase

The Node.js codebase uses BullMQ in the following areas (approximately 39 files reference it):

### 1. Scheduled Messages (chat-alerts queue)

**File:** `/home/dev/projects/SmartSpecPro/apps/web/server/services/scheduler.ts`

This service uses BullMQ `Queue`, `Worker`, and `Job` classes to manage the `chat-alerts` queue. It handles:
- One-time delayed jobs for scheduled message delivery (via `queue.add()` with `delay`)
- Recurring jobs via `queue.upsertJobScheduler()` with cron expressions
- Job execution that reads from the `scheduledMessages` DB table, optionally calls an LLM, creates notifications, and logs execution

Key functions to migrate:
- `createScheduledJob(scheduleId, cronExpression?, scheduledAt?)` -- creates BullMQ jobs
- `cancelScheduledJob(scheduleId, bullmqJobId?)` -- removes BullMQ jobs
- `initializeScheduler()` -- starts the BullMQ Worker
- `shutdownScheduler()` -- gracefully stops Worker/Queue/Connection
- `executeScheduledJob(job)` -- the job handler logic (this is reused, not rewritten)

### 2. LLM Queue Management

**File:** `/home/dev/projects/SmartSpecPro/apps/web/server/services/llmQueue.ts`

Uses BullMQ for background processing of:
- Credit deduction (`llm:credits` queue)
- Usage logging (`llm:usage` queue)
- Multi-step skill processing (`llm:skills` queue)

Key exports used elsewhere: `initializeQueues()`, `addCreditJob()`, `addUsageJob()`, `addSkillJob()`, `getQueueCounts()`, `getAllQueueStats()`, `getFailedJobs()`, `retryFailedJobs()`, `clearStaleJobs()`, `pauseQueue()`, `resumeQueue()`, `isQueuePaused()`, `getQueueHistory()`, `getAggregatedHistory()`, `shutdownQueues()`.

Also includes in-memory history tracking with periodic snapshots via `setInterval`.

### 3. Scheduled Messages Router

**File:** `/home/dev/projects/SmartSpecPro/apps/web/server/routers/scheduledMessages.ts`

References `createScheduledJob` and `cancelScheduledJob` from the scheduler service. Stores `bullmqJobId` on the `scheduledMessages` DB record.

### 4. Admin Queue Dashboard Components

**Files:**
- `/home/dev/projects/SmartSpecPro/apps/web/client/src/pages/AdminQueues.tsx` -- Full queue monitoring page with tabs for Rate Limiters, Background Queues, Config, History, LLM Models, Media
- `/home/dev/projects/SmartSpecPro/apps/web/client/src/pages/AdminQueueDashboard.tsx` -- Overview dashboard
- `/home/dev/projects/SmartSpecPro/apps/web/client/src/pages/AdminQueueLLM.tsx` -- LLM-specific monitoring

These components use tRPC endpoints from the `queues` router.

### 5. Queue tRPC Router

**File:** `/home/dev/projects/SmartSpecPro/apps/web/server/routers/queues.ts`

Imports heavily from `llmQueue.ts` for queue counts, stats, history, and management. Also imports rate limiter stats from `llmRateLimiter.ts` (rate limiters use Bottleneck, not BullMQ -- these do NOT need migration).

### 6. Server Startup

**File:** `/home/dev/projects/SmartSpecPro/apps/web/server/_core/index.ts`

Line 476 calls `initializeScheduler()` and line 505 calls `initializeQueues()` during startup.

---

## Tests

Write tests FIRST, before implementation. All tests use Vitest and go in colocated test files.

### Scheduled Messages via Cloud Tasks

**File:** `/home/dev/projects/SmartSpecPro/apps/web/server/services/__tests__/schedulerCloudTasks.test.ts`

```typescript
/**
 * Tests for scheduled message delivery via Cloud Tasks.
 * Replaces BullMQ chat-alerts queue with Cloud Tasks delayed dispatch.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

describe("Scheduled Messages via Cloud Tasks", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("should enqueue Cloud Tasks task with correct delay for one-time scheduled message", async () => {
    // Schedule a message for 30 minutes in the future.
    // Verify enqueueTask is called with delaySeconds approximately equal to 1800.
    // Verify the handler path is '/tasks/deliver-scheduled-message'.
    // Verify payload includes scheduleId.
  });

  it("should deliver message and mark as complete via POST /tasks/deliver-scheduled-message", async () => {
    // Given a scheduledMessages record with status 'active'.
    // When the handler is invoked with { scheduleId }.
    // Then the message is delivered (notification created).
    // And the scheduledMessages record is updated with lastRunAt and status 'completed' (if non-recurring).
  });

  it("should skip delivery for already-delivered (non-active) scheduled message", async () => {
    // Given a scheduledMessages record with status 'completed'.
    // When the handler is invoked with { scheduleId }.
    // Then no notification is created.
    // And the handler returns success (idempotent).
  });

  it("should handle recurring scheduled messages by not marking as completed", async () => {
    // Given a scheduledMessages record with isRecurring=true.
    // When the handler is invoked.
    // Then lastRunAt is updated but status remains 'active'.
  });

  it("should fall back to Cloud Scheduler sweep for undelivered messages", async () => {
    // The fallback handler queries scheduledMessages where
    // scheduledAt <= now AND status = 'active' AND lastRunAt is null.
    // Each undelivered message gets a Cloud Tasks task enqueued.
  });
});
```

### Admin Queue Dashboard Data Source

**File:** `/home/dev/projects/SmartSpecPro/apps/web/server/routers/__tests__/queueHealthCloudTasks.test.ts`

```typescript
/**
 * Tests for admin queue health endpoints migrated from BullMQ to Cloud Tasks API.
 */
import { describe, it, expect, vi } from "vitest";

describe("admin.queueHealth via Cloud Tasks", () => {
  it("should return Cloud Tasks queue metrics including depth and retry count", async () => {
    // Mock the Cloud Tasks Admin API client.
    // Call the admin.queueHealth tRPC endpoint.
    // Verify response includes queue names, task counts, and retry metrics.
  });

  it("should return queue depth for each configured Cloud Tasks queue", async () => {
    // Verify that all 6 queues (media-jobs, video-jobs-short, video-jobs-long,
    // workflow-tasks, polling-tasks, periodic-tasks) are represented.
  });

  it("should include dead letter count from cloud_task_events table", async () => {
    // Query cloud_task_events with status='dead_letter'.
    // Verify the count is included in the response.
  });
});
```

### LLM Queue Migration

**File:** `/home/dev/projects/SmartSpecPro/apps/web/server/services/__tests__/llmQueueMigration.test.ts`

```typescript
/**
 * Tests for migrating LLM queues from BullMQ to in-process + Cloud Tasks.
 */
import { describe, it, expect, vi } from "vitest";

describe("LLM Queue Migration", () => {
  it("should process credit deductions synchronously when BullMQ is removed", async () => {
    // addCreditJob should call deductCreditsForModel directly (in-process).
    // No BullMQ queue interaction.
  });

  it("should process usage logging synchronously", async () => {
    // addUsageJob should log usage in-process.
  });

  it("should enqueue multi-step skill jobs to Cloud Tasks workflow-tasks queue", async () => {
    // addSkillJob should call enqueueTask with queueName 'workflow-tasks'.
  });
});
```

---

## Implementation Details

### Part 1: Migrate Scheduled Messages (chat-alerts queue)

The existing `executeScheduledJob()` logic in `/home/dev/projects/SmartSpecPro/apps/web/server/services/scheduler.ts` handles the actual message delivery (LLM call, notification, DB update). This logic is preserved and extracted into a standalone function that does not depend on BullMQ's `Job` type.

**Step 1a: Create a Cloud Tasks-based scheduler service.**

Create or refactor `/home/dev/projects/SmartSpecPro/apps/web/server/services/scheduler.ts` to:

1. Remove all `bullmq` imports (`Queue`, `Worker`, `Job`).
2. Remove the `getRedisConnection()`, `getSchedulerQueue()`, `initializeScheduler()`, `shutdownScheduler()` functions that depend on BullMQ.
3. Extract the message delivery logic from `executeScheduledJob(job)` into a new function `deliverScheduledMessage(scheduleId: number)` that takes a plain schedule ID instead of a BullMQ Job.
4. Rewrite `createScheduledJob()` to call `enqueueTask()` from `apps/web/server/services/cloudTasks.ts` (created in Section 04):
   - For one-time messages with `scheduledAt`: calculate `delaySeconds = Math.max(0, scheduledAt.getTime() - Date.now()) / 1000` and enqueue with `handlerPath: '/tasks/deliver-scheduled-message'` and `payload: { scheduleId }`.
   - For recurring messages with `cronExpression`: register a Cloud Scheduler job (see Section 06) instead of BullMQ's `upsertJobScheduler`. As an interim measure, recurring messages can enqueue a Cloud Tasks task for the next occurrence and re-enqueue themselves upon completion.
5. Rewrite `cancelScheduledJob()` to delete the Cloud Tasks task (or Cloud Scheduler job) instead of removing BullMQ jobs.
6. Remove the `initializeScheduler()` and `shutdownScheduler()` calls from `/home/dev/projects/SmartSpecPro/apps/web/server/_core/index.ts`.

**Step 1b: Add the task handler endpoint.**

On the Python orchestrator side (or a new Node.js endpoint -- since the scheduled message logic lives in Node.js, this handler should be a Node.js Express endpoint):

Create a new Express route at `POST /tasks/deliver-scheduled-message` in the Node.js service. This endpoint:
1. Validates the Cloud Tasks OIDC token (or in development, validates an internal shared token).
2. Reads `scheduleId` from the request body.
3. Calls `deliverScheduledMessage(scheduleId)`.
4. Returns 200 on success, 200 on already-delivered (idempotent), or 5xx on transient failure.

**File to create or modify:** `/home/dev/projects/SmartSpecPro/apps/web/server/routes/tasks.ts` (new file for Cloud Tasks handler endpoints on the Node.js side).

Register this route in `/home/dev/projects/SmartSpecPro/apps/web/server/_core/index.ts`.

**Step 1c: Add a fallback scheduler sweep.**

Create a handler for `POST /tasks/deliver-scheduled-fallback` that:
1. Queries `scheduledMessages` where `scheduledAt <= NOW()` AND `status = 'active'` AND `lastRunAt IS NULL`.
2. For each undelivered message, enqueues a Cloud Tasks task to `/tasks/deliver-scheduled-message`.
3. This endpoint is triggered by Cloud Scheduler every minute (configured in Section 06).

This belt-and-suspenders approach ensures messages are delivered even if the original Cloud Tasks enqueue failed.

**Step 1d: Update the scheduledMessages router.**

Modify `/home/dev/projects/SmartSpecPro/apps/web/server/routers/scheduledMessages.ts`:
1. Replace `bullmqJobId` references with `cloudTaskId` (or remove the field if Cloud Tasks task names are derivable from `scheduleId`).
2. Update create/update/delete flows to use the new `createScheduledJob()` and `cancelScheduledJob()` that operate on Cloud Tasks.
3. The `bullmqJobId` column in the `scheduledMessages` schema can be renamed or replaced. If the column exists in the Drizzle schema, update it to `cloudTaskId` or keep it for backward compatibility and just store the Cloud Tasks task name there instead.

### Part 2: Migrate LLM Queue Management

The LLM queues in `/home/dev/projects/SmartSpecPro/apps/web/server/services/llmQueue.ts` serve three purposes:

**Credit deductions (`llm:credits` queue):** Currently enqueued as BullMQ jobs. These are fast DB operations. After migration, process them in-process (synchronously). The fallback path already exists in `addCreditJob()` -- when Redis is unavailable, it calls `deductCreditsForModel()` directly. Make this the primary path.

**Usage logging (`llm:usage` queue):** Similar to credits -- fast DB writes. Process in-process. The fallback already logs locally.

**Skill processing (`llm:skills` queue):** Multi-step skill jobs that need retry/backoff semantics. Migrate these to Cloud Tasks `workflow-tasks` queue. Rewrite `addSkillJob()` to call `enqueueTask({ queueName: 'workflow-tasks', handlerPath: '/tasks/execute-skill-step', payload: { ... } })`.

**Step 2a: Refactor `llmQueue.ts`.**

Rewrite `/home/dev/projects/SmartSpecPro/apps/web/server/services/llmQueue.ts` to:
1. Remove all BullMQ imports and queue/worker instantiation.
2. Make `addCreditJob()` always call `deductCreditsForModel()` directly (the current "Redis unavailable" fallback becomes the primary path).
3. Make `addUsageJob()` always process in-process.
4. Make `addSkillJob()` call `enqueueTask()` for Cloud Tasks.
5. Replace `getQueueCounts()`, `getAllQueueStats()`, `getFailedJobs()`, etc. with functions that query the Cloud Tasks Admin API (see Part 3).
6. Remove `initializeQueues()`, `startCreditWorker()`, `startUsageWorker()`, `startSkillWorker()`, `shutdownQueues()`.
7. Remove the `setInterval`-based history tracking (replaced by Cloud Monitoring in Section 16).
8. Keep the `QueueStats` interface and in-memory counters for backward compatibility with the admin dashboard, but source data from Cloud Tasks API or `cloud_task_events` table.

**Step 2b: Update server startup.**

Remove `initializeQueues()` call from `/home/dev/projects/SmartSpecPro/apps/web/server/_core/index.ts` (line 505 area).

### Part 3: Update Admin Queue Dashboards

The admin dashboard components currently display BullMQ queue stats. After migration, they should display Cloud Tasks queue metrics.

**Step 3a: Update the queues tRPC router.**

Modify `/home/dev/projects/SmartSpecPro/apps/web/server/routers/queues.ts`:
1. Replace BullMQ queue count queries with Cloud Tasks Admin API calls. Use `@google-cloud/tasks` client to call `listTasks()` or `getQueue()` for each queue.
2. The `getQueueStatus` endpoint should return Cloud Tasks queue depth, dispatch rate, retry counts.
3. The `getFailedJobs` endpoint should query the `cloud_task_events` table for tasks with `status = 'dead_letter'` or `status = 'failed'`.
4. Remove `pauseQueue`/`resumeQueue` mutations (Cloud Tasks queues are paused/resumed via `gcloud` or the Admin API -- expose these if needed, or remove the UI controls).
5. Remove `retryFailedJobs` mutation (Cloud Tasks handles retries automatically).
6. Remove `clearStaleJobs` mutation.
7. Keep the rate limiter endpoints unchanged -- Bottleneck rate limiters are NOT migrated and continue working in-process.

**Step 3b: Create a Cloud Tasks metrics service.**

Create `/home/dev/projects/SmartSpecPro/apps/web/server/services/cloudTasksMetrics.ts`:

```typescript
/**
 * Service for querying Cloud Tasks queue metrics via the Admin API.
 * Used by the admin dashboard to replace BullMQ queue introspection.
 */

export interface CloudTasksQueueMetrics {
  queueName: string;
  taskCount: number;
  oldestTaskAge: number | null;
  dispatchRate: number;
}

export async function getQueueMetrics(queueName: string): Promise<CloudTasksQueueMetrics>
  /** Query the Cloud Tasks API for queue stats. */

export async function getAllQueueMetrics(): Promise<CloudTasksQueueMetrics[]>
  /** Query all configured queues. */

export async function getDeadLetterCount(): Promise<number>
  /** Count dead letter entries from cloud_task_events table. */
```

**Step 3c: Update admin dashboard components.**

Modify the following frontend files to work with the new data shape:

- `/home/dev/projects/SmartSpecPro/apps/web/client/src/pages/AdminQueues.tsx` -- Update the "Background Queues" tab to show Cloud Tasks queue metrics instead of BullMQ queue data. Remove pause/resume/retry/clear-stale UI controls (or adapt them to Cloud Tasks operations). Update the description text from "BullMQ queues for async processing" to "Cloud Tasks queues for async processing".
- `/home/dev/projects/SmartSpecPro/apps/web/client/src/pages/AdminQueueDashboard.tsx` -- Same updates. Change "BullMQ job queues for async processing" text.
- `/home/dev/projects/SmartSpecPro/apps/web/client/src/pages/AdminQueueLLM.tsx` -- Review for any direct BullMQ references.

The rate limiter tabs and LLM model stats tabs are unaffected because they use Bottleneck (not BullMQ).

### Part 4: Remove BullMQ Dependency

After all migrations are verified working:

**Step 4a:** Remove `bullmq` from `/home/dev/projects/SmartSpecPro/apps/web/package.json`.

**Step 4b:** Run `pnpm install` in the `apps/web/` directory to clean up the lockfile.

**Step 4c:** Search the codebase for any remaining BullMQ imports and remove them:
```bash
grep -r "from.*bullmq" apps/web/
grep -r "from.*'bullmq'" apps/web/
```

**Step 4d:** Verify no runtime errors by running the test suite:
```bash
cd apps/web && pnpm test
```

**Step 4e:** With BullMQ removed, the Node.js service no longer needs a persistent Redis connection for queue processing. The only remaining persistent Redis need is pub/sub for SSE progress streaming (handled by Memorystore -- see Section 10). Stateless Redis operations (rate limiting, locks, dedup) migrate to Upstash.

---

## Files Summary

### Files to Create
| File | Purpose |
|------|---------|
| `/home/dev/projects/SmartSpecPro/apps/web/server/routes/tasks.ts` | Express routes for Cloud Tasks handlers (deliver-scheduled-message, deliver-scheduled-fallback) |
| `/home/dev/projects/SmartSpecPro/apps/web/server/services/cloudTasksMetrics.ts` | Cloud Tasks Admin API metrics service |
| `/home/dev/projects/SmartSpecPro/apps/web/server/services/__tests__/schedulerCloudTasks.test.ts` | Tests for scheduled message Cloud Tasks migration |
| `/home/dev/projects/SmartSpecPro/apps/web/server/routers/__tests__/queueHealthCloudTasks.test.ts` | Tests for admin queue health endpoints |
| `/home/dev/projects/SmartSpecPro/apps/web/server/services/__tests__/llmQueueMigration.test.ts` | Tests for LLM queue migration |

### Files to Modify
| File | Changes |
|------|---------|
| `/home/dev/projects/SmartSpecPro/apps/web/server/services/scheduler.ts` | Remove BullMQ, use Cloud Tasks enqueue for scheduling |
| `/home/dev/projects/SmartSpecPro/apps/web/server/services/llmQueue.ts` | Remove BullMQ, make credit/usage in-process, skills via Cloud Tasks |
| `/home/dev/projects/SmartSpecPro/apps/web/server/routers/queues.ts` | Replace BullMQ queries with Cloud Tasks Admin API |
| `/home/dev/projects/SmartSpecPro/apps/web/server/routers/scheduledMessages.ts` | Replace bullmqJobId with cloudTaskId, use new scheduler API |
| `/home/dev/projects/SmartSpecPro/apps/web/server/_core/index.ts` | Remove initializeScheduler() and initializeQueues() calls, register task routes |
| `/home/dev/projects/SmartSpecPro/apps/web/client/src/pages/AdminQueues.tsx` | Update "Background Queues" tab for Cloud Tasks data |
| `/home/dev/projects/SmartSpecPro/apps/web/client/src/pages/AdminQueueDashboard.tsx` | Update queue overview for Cloud Tasks data |
| `/home/dev/projects/SmartSpecPro/apps/web/client/src/pages/AdminQueueLLM.tsx` | Remove any BullMQ-specific references |
| `/home/dev/projects/SmartSpecPro/apps/web/package.json` | Remove `bullmq` dependency |

### Files to Potentially Modify (audit for BullMQ references)
| File | Reason |
|------|--------|
| `/home/dev/projects/SmartSpecPro/apps/web/server/services/telegramService.ts` | May reference BullMQ |
| `/home/dev/projects/SmartSpecPro/apps/web/server/services/marketplaceContentGenerator.ts` | May reference BullMQ |
| `/home/dev/projects/SmartSpecPro/apps/web/server/jobs/purgeOldTrashItems.ts` | May reference BullMQ |
| `/home/dev/projects/SmartSpecPro/apps/web/server/jobs/gdriveSessionCleanup.ts` | May reference BullMQ |
| `/home/dev/projects/SmartSpecPro/apps/web/server/deployment/verification.test.ts` | May reference BullMQ |

---

## Migration Sequence

Execute in this order:

1. **Write tests** -- Create all three test files listed above.
2. **Create task handler routes** -- `/home/dev/projects/SmartSpecPro/apps/web/server/routes/tasks.ts` with `POST /tasks/deliver-scheduled-message` and `POST /tasks/deliver-scheduled-fallback`.
3. **Refactor scheduler.ts** -- Remove BullMQ, implement Cloud Tasks-based scheduling.
4. **Refactor llmQueue.ts** -- Remove BullMQ, make credit/usage synchronous, skills via Cloud Tasks.
5. **Create cloudTasksMetrics.ts** -- Cloud Tasks Admin API metrics service.
6. **Update queues router** -- Replace BullMQ queries with Cloud Tasks metrics.
7. **Update scheduledMessages router** -- Replace bullmqJobId references.
8. **Update server startup** -- Remove BullMQ initialization calls.
9. **Update admin dashboard components** -- Replace BullMQ references in UI.
10. **Remove bullmq from package.json** -- Final cleanup.
11. **Run full test suite** -- `cd /home/dev/projects/SmartSpecPro/apps/web && pnpm test`.

---

## Environment Configuration

The following environment variables are required (set up in Section 04):

- `USE_CLOUD_TASKS` -- Feature flag. When `true`, scheduled messages use Cloud Tasks. When `false`, fall back to direct in-process execution (development mode).
- `GCP_PROJECT_ID` -- GCP project ID for Cloud Tasks API calls.
- `GCP_LOCATION` -- GCP region (e.g., `asia-southeast1`).
- `CLOUD_RUN_SERVICE_URL` -- Base URL of the Node.js Cloud Run service (used as the HTTP target for Cloud Tasks).

In development (`ENVIRONMENT=development`), the `enqueueTask()` function should either:
- Call the handler endpoint directly via HTTP (localhost), or
- Execute the handler function in-process without going through Cloud Tasks.

---

## Key Design Decisions

1. **Credit and usage jobs become synchronous.** These are fast DB operations (<50ms) that do not benefit from async queue semantics. The existing fallback code path in `llmQueue.ts` already handles this -- it becomes the primary path.

2. **Scheduled message delivery keeps the same business logic.** The `executeScheduledJob()` function body is preserved as `deliverScheduledMessage()`. Only the BullMQ-specific wrapper (Job type, retry handling) changes.

3. **Recurring scheduled messages** are handled by Cloud Scheduler (Section 06) creating periodic Cloud Tasks tasks that invoke `/tasks/deliver-scheduled-message`. The `cronExpression` in the `scheduledMessages` table maps to a Cloud Scheduler job.

4. **The fallback sweep runs every minute** to catch any Cloud Tasks enqueue failures. This matches the existing BullMQ model where the Worker would pick up jobs that had been waiting.

5. **Admin dashboard retains functionality** but data sources change from BullMQ introspection to Cloud Tasks Admin API and `cloud_task_events` table. Rate limiter monitoring (Bottleneck) is completely unaffected.