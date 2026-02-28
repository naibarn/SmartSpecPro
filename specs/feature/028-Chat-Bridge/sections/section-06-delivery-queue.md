No sections have been created yet. I have all the context I need. Let me now generate the section content.

# Section 06: Delivery Queue

## Overview

This section creates the BullMQ-based reliable delivery queue for sending messages to Telegram. The queue decouples the message pipeline from Telegram API calls, providing retry logic, rate limiting, dead-letter handling, and delivery status tracking.

**File to create**: `/home/dev/projects/SmartSpecPro/apps/web/server/services/deliveryQueue.ts`
**Test file to create**: `/home/dev/projects/SmartSpecPro/apps/web/server/services/__tests__/deliveryQueue.test.ts`
**File to modify**: `/home/dev/projects/SmartSpecPro/apps/web/server/_core/index.ts` (init + shutdown registration)
**Package dependency**: `bullmq` must be installed in `apps/web`

## Dependencies

- **section-01-schema-migration**: The `channel_messages` table must exist with columns `id`, `deliveryStatus`, `attemptCount`, `lastAttemptAt`, `deliveredAt`, `failureCode`, `failureReason`, `externalMessageId`, `externalChatId`, `conversationChannelId`, `messageId`, `messageType`, `channelType`, `tenantId`, `metadata`.
- **Existing modules**: `getRealtimeClient()` from `/home/dev/projects/SmartSpecPro/apps/web/server/services/redisClients.ts`, `sendTelegramMessage()` from `/home/dev/projects/SmartSpecPro/apps/web/server/services/telegramService.ts`, `getTelegramSettings()` from `/home/dev/projects/SmartSpecPro/apps/web/server/services/telegramService.ts`, `decrypt()` from `/home/dev/projects/SmartSpecPro/apps/web/server/services/crypto.ts`, `getDb()` from `/home/dev/projects/SmartSpecPro/apps/web/server/db.ts`.

## Package Installation

BullMQ is not currently installed in the project. It must be added before implementation:

```bash
cd /home/dev/projects/SmartSpecPro/apps/web && pnpm add bullmq
```

BullMQ requires a Redis connection with `maxRetriesPerRequest: null`, which is exactly how `getRealtimeClient()` is configured in `redisClients.ts` (line 73: `maxRetriesPerRequest: null`). This makes `getRealtimeClient()` the correct Redis client for both the Queue and Worker.

---

## Tests First

### Test file: `/home/dev/projects/SmartSpecPro/apps/web/server/services/__tests__/deliveryQueue.test.ts`

All tests mock BullMQ, the database, `telegramService`, and `redisClients`. The test patterns follow the existing mock style in `/home/dev/projects/SmartSpecPro/apps/web/server/services/__tests__/agencyBridge.test.ts` and `/home/dev/projects/SmartSpecPro/apps/web/server/services/__tests__/abuseGuard.test.ts`.

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// --- Mock BullMQ ---
const mockQueueAdd = vi.fn();
const mockQueueClose = vi.fn();
const mockWorkerClose = vi.fn();
const mockWorkerOn = vi.fn();

vi.mock("bullmq", () => ({
  Queue: vi.fn().mockImplementation(() => ({
    add: mockQueueAdd,
    close: mockQueueClose,
  })),
  Worker: vi.fn().mockImplementation((_name, processor, _opts) => ({
    on: mockWorkerOn,
    close: mockWorkerClose,
    __processor: processor, // expose for direct testing
  })),
}));

// --- Mock redisClients ---
vi.mock("../redisClients", () => ({
  getRealtimeClient: vi.fn(() => ({ /* mock Redis */ })),
}));

// --- Mock telegramService ---
vi.mock("../telegramService", () => ({
  sendTelegramMessage: vi.fn(),
  getTelegramSettings: vi.fn(),
}));

// --- Mock crypto ---
vi.mock("../crypto", () => ({
  decrypt: vi.fn((v: string) => v),
}));

// --- Mock db ---
vi.mock("../../db", () => ({
  getDb: vi.fn(),
}));

describe("deliveryQueue", () => {
  // --- Queue setup ---
  // Test: queue initializes with correct Redis client (getRealtimeClient)
  // Test: worker has concurrency 10 and rate limit 25/sec
  // Test: graceful shutdown calls worker.close() and queue.close()

  // --- Job processing ---
  // Test: successful delivery updates channel_messages status to 'sent'
  // Test: successful delivery stores externalMessageId from Telegram response
  // Test: job uses deterministic jobId (tg-deliver-{channelMessageId})

  // --- Error classification ---
  // Test: 403 Forbidden triggers permanent failure (no retry) — throws UnrecoverableError
  // Test: "bot was blocked by the user" triggers permanent failure
  // Test: "chat not found" triggers permanent failure
  // Test: 429 Too Many Requests uses retry_after value, doesn't count as attempt
  // Test: 500 server error triggers exponential backoff retry
  // Test: network error triggers exponential backoff retry
  // Test: after 5 failed attempts, job moves to DLQ

  // --- Delivery status tracking ---
  // Test: pending -> sent transition on success
  // Test: pending -> failed transition after max retries
  // Test: attemptCount increments on each retry
  // Test: failureCode and failureReason stored on failure
});
```

**Key test strategies:**

1. **Queue initialization tests**: Import the module, call `initDeliveryQueue()`, and verify that `Queue` and `Worker` constructors were called with the expected config (queue name `telegram-delivery`, concurrency 10, rate limiter `{ max: 25, duration: 1000 }`).

2. **Job processing tests**: Extract the worker processor function from the mock (captured via `__processor` on the mock Worker) and call it directly with a mock BullMQ job object. Verify that `sendTelegramMessage` was called with the correct arguments, and that the database was updated.

3. **Error classification tests**: The processor function should:
   - For permanent errors (403, bot blocked, chat not found): throw a `bullmq.UnrecoverableError` so BullMQ does not retry.
   - For 429 rate limits: throw a `Worker.RateLimitError` (or re-throw with `delay` set to `retry_after * 1000`), so the attempt does not count.
   - For transient errors (network, 5xx): throw a regular Error, which BullMQ retries with exponential backoff.

4. **DLQ tests**: Register the `"failed"` event on the worker. When a job exhausts all retries, add it to the `telegram-delivery-dlq` queue and update `channel_messages.deliveryStatus = 'failed'`.

5. **Shutdown tests**: Call `closeDeliveryQueue()` and verify both `worker.close()` and `queue.close()` were called.

---

## Implementation Details

### File: `/home/dev/projects/SmartSpecPro/apps/web/server/services/deliveryQueue.ts`

#### Constants and Types

```typescript
import { Queue, Worker, UnrecoverableError } from "bullmq";
import type { Job } from "bullmq";
import { getRealtimeClient } from "./redisClients";
import { sendTelegramMessage, getTelegramSettings } from "./telegramService";
import { decrypt } from "./crypto";
import { getDb } from "../db";
import { channelMessages } from "../../drizzle/schema";
import { eq } from "drizzle-orm";

const QUEUE_NAME = "telegram-delivery";
const DLQ_NAME = "telegram-delivery-dlq";

/** Shape of jobs enqueued for Telegram delivery. */
export interface DeliveryJob {
  channelMessageId: string;    // channel_messages.id
  chatId: string;              // Telegram chat_id
  text: string;                // HTML-formatted message
  parseMode: "HTML";
  replyToMessageId?: string;   // For threading
  conversationId: string;      // For logging
  tenantId: string;            // For metrics
}
```

#### Module-Level State

The module holds lazy references to the Queue, DLQ, and Worker instances, created on `initDeliveryQueue()` and torn down on `closeDeliveryQueue()`.

```typescript
let deliveryQueue: Queue<DeliveryJob> | null = null;
let dlq: Queue<DeliveryJob> | null = null;
let deliveryWorker: Worker<DeliveryJob> | null = null;
```

#### `initDeliveryQueue()`

Called during server startup in `_core/index.ts`. Creates the BullMQ Queue and Worker using the realtime Redis connection.

Key configuration:
- **Queue default job options**: `{ attempts: 5, backoff: { type: "exponential", delay: 1000 }, removeOnComplete: 1000, removeOnFail: 5000 }`
- **Worker options**: `{ concurrency: 10, connection: getRealtimeClient(), limiter: { max: 25, duration: 1000 } }`
- The Worker receives `getRealtimeClient()` as its `connection` option. BullMQ requires a separate connection for the Worker (it cannot share the Queue's connection). Since `getRealtimeClient()` returns a singleton, use `getRealtimeClient().duplicate()` for the worker connection.

**Important BullMQ/IORedis note**: BullMQ needs its own IORedis connections. The Queue and Worker each need separate connections. Use `getRealtimeClient().duplicate()` to create cloned connections that inherit the same config (including `maxRetriesPerRequest: null`).

#### Worker Processor Function

The processor is an async function that receives a BullMQ `Job<DeliveryJob>` and performs the delivery.

Pseudocode:
1. Load bot settings via `getTelegramSettings()` (existing cached function in telegramService.ts).
2. Decrypt the bot token via `decrypt()`.
3. Call `sendTelegramMessage(botToken, job.data.chatId, job.data.text, job.data.parseMode)`.
4. On success: update `channel_messages` row where `id = job.data.channelMessageId` with `deliveryStatus: 'sent'`, `externalMessageId`, `deliveredAt: new Date()`, `attemptCount: job.attemptsMade + 1`.
5. On error: classify and re-throw appropriately (see error classification below).

#### Error Classification Logic

Inside the processor's catch block, classify the error from `sendTelegramMessage`:

- **Permanent failures** (no retry): If the error has `statusCode === 403`, or `blocked === true`, or the message includes "chat not found" or "bot was blocked" or "Forbidden": throw `new UnrecoverableError(message)`. Before throwing, update `channel_messages` with `deliveryStatus: 'failed'`, `failureCode`, `failureReason`.

- **Rate limited** (Telegram 429): If the error has `statusCode === 429` and a `retryAfter` field: use BullMQ's rate limit mechanism. Throw a `Worker.RateLimitError` is not directly available; instead, call `job.moveToDelayed(Date.now() + retryAfter * 1000)` and return. Alternatively, use the simpler pattern: update the `channel_messages.lastAttemptAt` and re-throw the error. BullMQ's built-in backoff will handle it. The more precise approach is to use a custom backoff strategy. Since BullMQ supports custom backoff via the `backoffStrategy` option on the Worker, register a strategy named `"telegramBackoff"` that checks for `retry_after` in the error and returns the appropriate delay. For rate-limited errors, the attempt should not count against the max attempts.

  **Practical approach**: The simplest reliable pattern is:
  1. Catch the 429 error.
  2. Update `channel_messages.lastAttemptAt`.
  3. Re-throw the error with `retryAfter` attached. BullMQ's exponential backoff will handle retry timing.
  4. The attempt counts against the 5-attempt limit, which is acceptable given our scale (<1K messages/day).

- **Transient failures** (exponential backoff): For network errors, timeouts, 500/502/503/504 responses: update `channel_messages.lastAttemptAt` and `attemptCount`, then re-throw the original error. BullMQ's built-in exponential backoff (1s base, doubling) handles the rest.

#### Failed Event Handler (DLQ)

Register a `"failed"` event listener on the worker:

```typescript
deliveryWorker.on("failed", async (job, err) => {
  if (!job) return;
  // Only handle exhausted retries (job.attemptsMade >= job.opts.attempts)
  if (job.attemptsMade < (job.opts?.attempts ?? 5)) return;

  // Move to DLQ
  await dlq?.add("dead-letter", job.data, {
    removeOnComplete: 5000,
  });

  // Update channel_messages status to 'failed'
  const db = await getDb();
  if (db) {
    await db.update(channelMessages)
      .set({
        deliveryStatus: "failed",
        failureCode: "max_retries_exhausted",
        failureReason: err.message,
      })
      .where(eq(channelMessages.id, job.data.channelMessageId));
  }
});
```

**Note on the `"failed"` event**: BullMQ fires this event on every failure, not just the final one. The handler must check `job.attemptsMade` against the max attempts to determine if this is the final failure. For `UnrecoverableError`, BullMQ fires the `"failed"` event with `attemptsMade` at whatever the current count is, but it won't retry, so the handler should also move those to DLQ.

#### `enqueueDelivery(job: DeliveryJob)`

Public function called by `channelGateway.emitEgress()` (section-05). Adds a job to the queue with a deterministic job ID.

```typescript
export async function enqueueDelivery(job: DeliveryJob): Promise<void> {
  if (!deliveryQueue) {
    console.warn("[DeliveryQueue] Queue not initialized, skipping delivery");
    return;
  }
  await deliveryQueue.add("deliver", job, {
    jobId: `tg-deliver-${job.channelMessageId}`,
  });
}
```

The deterministic `jobId` prevents duplicate enqueue if `emitEgress` is called multiple times for the same message (idempotency).

#### `closeDeliveryQueue()`

Called during graceful shutdown. Closes the worker first (stops accepting new jobs, waits for in-progress jobs), then closes both queues.

```typescript
export async function closeDeliveryQueue(): Promise<void> {
  if (deliveryWorker) {
    await deliveryWorker.close();
    deliveryWorker = null;
  }
  if (deliveryQueue) {
    await deliveryQueue.close();
    deliveryQueue = null;
  }
  if (dlq) {
    await dlq.close();
    dlq = null;
  }
  console.log("[DeliveryQueue] Shut down");
}
```

---

### Modifications to `/home/dev/projects/SmartSpecPro/apps/web/server/_core/index.ts`

Two changes are needed:

1. **Import and initialize**: Add an import for `initDeliveryQueue` and `closeDeliveryQueue` from `../services/deliveryQueue`. Call `initDeliveryQueue()` during startup, after Redis is ready. Place it near the existing `initializeTelegramQueue()` call (around the same section of startup code).

2. **Register shutdown**: Add `await closeDeliveryQueue().catch(() => {});` to both the SIGTERM and SIGINT handlers, in step 3 alongside the existing `shutdownTelegramWorker()` call.

The import line goes near line 40 of `_core/index.ts`:

```typescript
import { initDeliveryQueue, closeDeliveryQueue } from "../services/deliveryQueue";
```

In the startup sequence (inside `main()`), after Redis/Telegram initialization:

```typescript
await initDeliveryQueue();
console.log("[Startup] Telegram delivery queue initialized");
```

In both SIGTERM and SIGINT handlers, add:

```typescript
await closeDeliveryQueue().catch(() => {});
```

---

## Redis Client Usage Summary

This is critical to get right. The codebase has three Redis clients with distinct purposes:

| Client | Source | Config | Use in This Section |
|--------|--------|--------|---------------------|
| `getRealtimeClient()` | `redisClients.ts` | `maxRetriesPerRequest: null` (BullMQ-compatible) | BullMQ Queue + Worker connections (via `.duplicate()`) |
| `getCacheClient()` | `redisClients.ts` | `maxRetriesPerRequest: 3` | NOT used here (used by webhook dedupe in section-02) |
| `getRedisClient()` | `redis.ts` | Various | NOT used here (legacy, used by existing Telegram link codes) |

BullMQ requires `maxRetriesPerRequest: null` on its Redis connections. Only `getRealtimeClient()` satisfies this. Use `.duplicate()` to create separate connections for Queue and Worker (BullMQ requires distinct connections for each).

---

## Queue Configuration Reference

| Setting | Value | Rationale |
|---------|-------|-----------|
| Queue name | `telegram-delivery` | Descriptive, namespaced |
| DLQ name | `telegram-delivery-dlq` | Standard DLQ pattern |
| Max attempts | 5 | Balance between reliability and not hammering a down API |
| Backoff type | exponential | Standard for transient failures |
| Backoff base delay | 1000ms | 1s, 2s, 4s, 8s, 16s progression |
| Worker concurrency | 10 | Sufficient for <1K messages/day |
| Rate limiter | 25 per 1000ms | Below Telegram's 30/sec global limit |
| removeOnComplete | 1000 | Keep recent history for debugging |
| removeOnFail | 5000 | Keep failure history longer |

---

## Verification Checklist

After implementation, verify:

1. `pnpm add bullmq` succeeds and the package is in `apps/web/package.json`
2. `initDeliveryQueue()` creates the Queue and Worker without errors
3. `enqueueDelivery()` adds a job to the queue with the correct deterministic jobId
4. The worker processor successfully calls `sendTelegramMessage` and updates `channel_messages`
5. Permanent errors (403, bot blocked) throw `UnrecoverableError` and do not retry
6. Transient errors retry with exponential backoff
7. After 5 retries, the job moves to the DLQ and `channel_messages` is marked as failed
8. `closeDeliveryQueue()` cleanly shuts down worker and queue
9. Server startup and shutdown both work with the new queue
10. `pnpm test` passes (all existing tests unaffected)
11. `pnpm check` passes (TypeScript types valid)