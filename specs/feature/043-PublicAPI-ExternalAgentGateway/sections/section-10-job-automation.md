# Section 10 -- Job Automation

## Overview

This section implements the **Job Automation Service** and its REST API endpoints. The service manages asynchronous job lifecycle -- validation, credit reservation, BullMQ enqueueing, execution delegation, atomic credit refunds, and pipeline orchestration with template variable resolution. It depends on the skill, agency, presentation, and media API services built in sections 05-08, and provides the foundation for webhook event delivery in section 11.

**Dependencies:** Sections 01 (database schema -- `automation_jobs` table), 02 (API key service), 03 (auth extension -- `AuthContext`, `requireScopes`), 04 (rate limiter and audit), 05 (skill API service functions), 06 (agency API service functions), 07 (presentation API service functions), 08 (video/media API service functions).

**Blocks:** Section 11 (webhooks and events -- job completion triggers webhook delivery).

---

## Files to Create

| File | Purpose |
|------|---------|
| `apps/web/server/services/jobAutomationService.ts` | Core job lifecycle: create, execute, refund, pipeline resolution |
| `apps/web/server/routes/publicJobsApi.ts` | REST endpoints: POST/GET/DELETE /v1/jobs |
| `apps/web/server/services/__tests__/jobAutomationService.test.ts` | Unit tests for job service |
| `apps/web/server/routes/__tests__/publicJobsApi.test.ts` | Endpoint integration tests |

## Files to Modify

| File | Change |
|------|--------|
| `apps/web/server/_core/index.ts` | Mount `/v1/jobs` routes, initialize BullMQ `automation-jobs` queue and worker |

---

## Tests

All tests use **Vitest**. Write tests first, then implement.

### Test File: `apps/web/server/services/__tests__/jobAutomationService.test.ts`

```typescript
/**
 * jobAutomationService unit tests
 *
 * Mock dependencies: creditService, skillExecutor, agencyBridge,
 * presentation service, media service, BullMQ queue, db.
 */

// ── Job Type Validation ───────────────────────────────────────────────────

// Test: createJob validates type against VALID_JOB_TYPES
//   - Call createJob with type "skill_execution" -> succeeds
//   - Call createJob with type "unknown_type" -> throws InvalidJobTypeError

// Test: createJob rejects unknown job type
//   - Pass type "foo_bar" -> expect error with code "invalid_job_type"

// ── Credit Overflow Guard ─────────────────────────────────────────────────

// Test: createJob rejects estimated credits > MAX_SINGLE_JOB_CREDITS
//   - MAX_SINGLE_JOB_CREDITS = 10_000
//   - Pass params that estimate 15_000 credits -> expect 400 error

// ── Credit Reservation ───────────────────────────────────────────────────

// Test: createJob reserves credits before enqueueing
//   - Mock creditService.deductCredits to succeed
//   - Verify deductCredits called with estimated amount BEFORE queue.add()

// ── Job Completion & Refund ──────────────────────────────────────────────

// Test: completed job refunds excess reserved credits atomically
//   - Job reserved 100 credits, used 60
//   - Expect creditService.addCredits called with amount=40, type="refund"
//   - Expect automation_jobs.creditsUsed = 60

// Test: failed job refunds ALL reserved credits atomically
//   - Job reserved 100 credits, execution throws
//   - Expect creditService.addCredits called with amount=100, type="refund"
//   - Expect automation_jobs.status = "failed"

// ── Callback ─────────────────────────────────────────────────────────────

// Test: completed job triggers webhook callback if callbackUrl set
//   - Create job with callbackUrl
//   - On completion, verify webhook delivery is dispatched (event emitter or queue)

// ── Idempotency ──────────────────────────────────────────────────────────

// Test: idempotencyKey prevents duplicate job creation
//   - Create job with idempotencyKey "abc"
//   - Create again with same key -> returns existing job, no second credit deduction

// ── Pipeline Support ─────────────────────────────────────────────────────

// Test: pipeline resolves {{steps.stepId.field}} template variables
//   - Pipeline with 2 steps: step "a" produces { output: "hello" }
//   - Step "b" has param "{{steps.a.output}}" -> resolves to "hello"

// Test: pipeline rejects circular step references
//   - Step "a" references {{steps.b.result}}, step "b" references {{steps.a.result}}
//   - Expect error with code "circular_pipeline_reference"

// Test: pipeline enforces max depth of 5 template resolution levels
//   - Nested template variables 6 levels deep -> error

// Test: pipeline steps execute sequentially with correct parentJobId/stepIndex
//   - Pipeline with 3 steps -> child jobs have parentJobId = pipeline job id
//   - stepIndex values: 0, 1, 2
```

### Test File: `apps/web/server/routes/__tests__/publicJobsApi.test.ts`

```typescript
/**
 * publicJobsApi endpoint tests
 *
 * Uses supertest against Express app with mocked auth middleware.
 * Mock jobAutomationService for isolation.
 */

// ── POST /v1/jobs ─────────────────────────────────────────────────────────

// Test: POST /v1/jobs requires jobs:create scope
//   - Request with API key lacking jobs:create scope -> 403

// Test: POST /v1/jobs creates job and returns job object
//   - Valid request body with type "skill_execution" -> 201 with { id, status: "pending" }

// Test: POST /v1/jobs returns 400 for invalid job type

// Test: POST /v1/jobs returns 400 when credits exceed MAX_SINGLE_JOB_CREDITS

// ── GET /v1/jobs ──────────────────────────────────────────────────────────

// Test: GET /v1/jobs returns paginated list with status filter
//   - GET /v1/jobs?status=pending&page=1&limit=10 -> returns filtered results

// Test: GET /v1/jobs requires jobs:read scope

// Test: GET /v1/jobs respects tenant isolation (only returns jobs for caller's tenant)

// ── GET /v1/jobs/:jobId ───────────────────────────────────────────────────

// Test: GET /v1/jobs/:jobId returns job detail
//   - Existing job id -> 200 with full job object including result/error

// Test: GET /v1/jobs/:jobId returns 404 for non-existent or other tenant's job

// ── DELETE /v1/jobs/:jobId ────────────────────────────────────────────────

// Test: DELETE /v1/jobs/:id cancels pending job
//   - Job in "pending" status -> sets status to "cancelled", refunds credits, returns 200

// Test: DELETE /v1/jobs/:id cannot cancel completed job
//   - Job in "completed" status -> 409 Conflict
```

---

## Implementation Details

### Constants and Types

Define in `apps/web/server/services/jobAutomationService.ts`:

```typescript
/**
 * Valid job types that the automation service can execute.
 * Each maps to a specific service function.
 */
export const VALID_JOB_TYPES = [
  "skill_execution",
  "media_generation",
  "agency_run",
  "batch_skill",
  "presentation_create",
  "video_project_create",
  "pipeline",
] as const;

export type JobType = (typeof VALID_JOB_TYPES)[number];

/**
 * Maximum credits a single job can reserve.
 * Prevents accidental runaway costs from misconfigured API calls.
 */
export const MAX_SINGLE_JOB_CREDITS = 10_000;

/**
 * BullMQ queue name for job automation.
 */
export const AUTOMATION_JOBS_QUEUE = "automation-jobs";

/**
 * Maximum wall-clock time for a single pipeline job.
 * Prevents runaway pipelines from consuming resources indefinitely.
 */
export const MAX_PIPELINE_DURATION_MS = 30 * 60 * 1000; // 30 minutes

/**
 * Maximum wall-clock time for a single job step.
 * Individual skill/media/agency executions are capped at this.
 */
export const MAX_STEP_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes
```

### Job Service: `jobAutomationService.ts`

The service exposes the following key functions:

**`createJob(params, authContext)`**
1. Validate `params.type` against `VALID_JOB_TYPES` -- reject unknown types with `{ code: "invalid_job_type" }`.
2. Estimate credits for the job based on type and params. The estimation logic is type-specific:
   - `skill_execution`: fixed estimate (e.g., 10 credits) or from skill metadata
   - `media_generation`: depends on model/quality, use existing credit calculation
   - `agency_run`: use `params.max_credits` or default estimate
   - `batch_skill`: sum of per-item estimates
   - `presentation_create`: fixed estimate (e.g., 50 credits)
   - `video_project_create`: duration-based (3/5/10 per minute by quality)
   - `pipeline`: sum of step estimates
3. Check credit overflow guard: if estimated > `MAX_SINGLE_JOB_CREDITS`, reject with 400.
4. Check `idempotencyKey` -- if a job with this key already exists for the same tenant, return the existing job without creating a duplicate or deducting credits again.
5. Reserve credits: call `creditService.deductCredits({ userId, amount: estimatedCredits, sourceType: "api_job", description: "Job reservation: {type}", idempotencyKey })`.
6. Insert row into `automation_jobs` table with status `"pending"`, `creditsReserved`, `traceId`.
7. Enqueue to BullMQ `automation-jobs` queue with job data `{ jobId, type, params, authContext }`.
8. Return the created job record.

**`executeJob(jobId)`** -- Called by BullMQ worker
1. Update status to `"running"`, set `startedAt`.
2. Based on `type`, dispatch to the appropriate service:
   - `skill_execution`: call `skillExecutor.executeSkill()` with `AuthContext`
   - `media_generation`: call media generation service
   - `agency_run`: call `agencyBridge.executeRun()` with `AuthContext`
   - `batch_skill`: iterate `params.inputs[]`, execute each skill call
   - `presentation_create`: call presentation generation service
   - `video_project_create`: call video project service
   - `pipeline`: call `executePipeline()`
3. On success: update status to `"completed"`, store `result`, set `creditsUsed`, `completedAt`. Refund excess credits atomically (`creditsReserved - creditsUsed`).
4. On failure: update status to `"failed"`, store `error`. Refund ALL reserved credits atomically.
5. If `callbackUrl` is set on the job record, emit a `job.completed` or `job.failed` event (consumed by the webhook delivery system from section 11).

**`cancelJob(jobId, tenantId)`**
1. Look up job by id, verify tenant ownership.
2. If status is `"pending"` or `"running"`, set status to `"cancelled"`.
3. If `"pending"`, remove from BullMQ queue. If `"running"`, attempt to abort (best-effort).
4. Refund ALL reserved credits atomically.
5. If status is `"completed"` or `"failed"`, return 409 Conflict.

**`listJobs(tenantId, filters)`**
- Query `automation_jobs` WHERE `tenantId` matches, filtered by optional `status`, `type`.
- Paginate with `page` and `limit` (default 20, max 100).
- Order by `createdAt DESC`.

**`getJob(jobId, tenantId)`**
- Query single job by id, verify tenant ownership.
- Return full job record including `result`, `error`, `progress`.

### Credit Refund Atomicity

Refunds must be atomic to prevent double-refund or lost-refund scenarios. The pattern:

```typescript
// Pseudocode for atomic refund
async function finalizeJob(jobId: string, creditsUsed: number) {
  // Single transaction: update job + insert refund credit transaction
  await db.transaction(async (tx) => {
    const job = await tx.select().from(automationJobs)
      .where(eq(automationJobs.id, jobId))
      .for("update"); // row lock

    if (job.status === "completed" || job.status === "failed") return; // already finalized

    const refundAmount = job.creditsReserved - creditsUsed;
    await tx.update(automationJobs).set({
      status: "completed",
      creditsUsed,
      completedAt: new Date(),
    }).where(eq(automationJobs.id, jobId));

    if (refundAmount > 0) {
      // Insert refund transaction within same DB transaction
      await addCreditsInTx(tx, {
        userId: job.userId,
        amount: refundAmount,
        type: "refund",
        description: `Job refund: ${jobId}`,
        sourceType: "api_job",
      });
    }
  });
}
```

The key detail is that both the job status update and the credit refund happen in the **same database transaction**. If either fails, both roll back.

### Pipeline Execution: `executePipeline()`

Pipeline jobs have `params.steps[]` where each step is:

```typescript
interface PipelineStep {
  id: string;          // unique within pipeline, e.g. "step_1"
  type: JobType;       // "skill_execution", "media_generation", etc.
  params: Record<string, any>; // may contain {{steps.otherId.field}} templates
}
```

**Template variable resolution:**
- Pattern: `{{steps.<stepId>.<dotPath>}}` where dotPath accesses nested result fields.
- Before execution, scan all step params for template patterns.
- Build a dependency graph from template references.
- **Cycle detection:** If step A references step B and step B references step A (directly or transitively), reject with `circular_pipeline_reference` error. Use topological sort; if sort fails, there is a cycle.
- **Max depth:** Template variables can reference other template variables (nested). Limit resolution to 5 iterations. If after 5 passes there are still unresolved templates, reject with `max_template_depth_exceeded`.
- **Restricted substitution:** Only allow dot-notation path access on the result object. No function calls, no code execution, no bracket notation with computed keys. Use a simple regex to validate the template format: `/^\{\{steps\.[a-zA-Z0-9_]+(\.[a-zA-Z0-9_]+)*\}\}$/`.

**Execution flow:**
1. Validate all steps: each must have valid type, unique id.
2. Run cycle detection.
3. Record `pipelineStartedAt = Date.now()`.
4. Execute steps sequentially in declared order (or topological order).
5. For each step:
   a. Check `Date.now() - pipelineStartedAt < MAX_PIPELINE_DURATION_MS` (30 min). If exceeded, fail the pipeline with error `"pipeline_timeout"`.
   b. Create a child job with `parentJobId` set to the pipeline job id and `stepIndex` set to the step's position (0-based).
   c. Execute the step with a per-step timeout of `MAX_STEP_TIMEOUT_MS` (10 min) using `Promise.race([stepExecution, timeoutPromise])`.
6. After each step completes, resolve template variables in subsequent steps using the completed step's `result`.
7. If any step fails or times out, the pipeline fails. Remaining steps are skipped. All reserved credits for unexecuted steps are refunded.

### BullMQ Queue Setup

The `automation-jobs` queue and worker must be initialized during server startup. Follow the existing pattern from `deliveryQueue.ts` and `webhookDispatchQueue.ts`.

In `apps/web/server/_core/index.ts`, add initialization alongside existing queue setup:

```typescript
import {
  initAutomationJobsQueue,
  closeAutomationJobsQueue,
} from "../services/jobAutomationService";

// In the startup block:
initAutomationJobsQueue();

// In the shutdown block:
await closeAutomationJobsQueue();
```

The queue and worker setup in the service file:

```typescript
import { Queue, Worker } from "bullmq";
import { getRedisClient } from "./redis";

let automationQueue: Queue | null = null;
let automationWorker: Worker | null = null;

export function initAutomationJobsQueue() {
  const connection = getRedisClient();
  automationQueue = new Queue(AUTOMATION_JOBS_QUEUE, { connection });
  automationWorker = new Worker(
    AUTOMATION_JOBS_QUEUE,
    async (bullJob) => {
      await executeJob(bullJob.data.jobId);
    },
    { connection, concurrency: 3 }
  );
  automationWorker.on("failed", (job, err) => {
    console.error(`[automation-jobs] Job ${job?.id} failed:`, err.message);
  });
}

export async function closeAutomationJobsQueue() {
  await automationWorker?.close();
  await automationQueue?.close();
}
```

Worker concurrency is set to 3 to avoid overloading downstream services. This can be tuned via environment variable if needed.

### REST Endpoints: `publicJobsApi.ts`

Mount at `/v1/jobs` on the Express app.

**`POST /v1/jobs`** -- Create a new job
- Middleware: `requireScopes("jobs:create")`
- Request body (Zod validated):
  ```typescript
  {
    type: z.enum(VALID_JOB_TYPES),
    params: z.record(z.unknown()),
    idempotency_key?: z.string().max(64).optional(),
    callback_url?: z.string().url().max(2048).optional(),
    max_credits?: z.number().int().positive().max(MAX_SINGLE_JOB_CREDITS).optional(),
  }
  ```
- For `type: "pipeline"`, `params` must include `steps: PipelineStep[]`.
- Calls `jobAutomationService.createJob()`.
- Returns 201 with `{ id, type, status, credits_reserved, created_at }`.

**`GET /v1/jobs`** -- List jobs
- Middleware: `requireScopes("jobs:read")`
- Query params: `status` (optional filter), `page` (default 1), `limit` (default 20, max 100)
- Calls `jobAutomationService.listJobs()`.
- Returns `{ jobs: [...], pagination: { page, limit, total } }`.

**`GET /v1/jobs/:jobId`** -- Get job detail
- Middleware: `requireScopes("jobs:read")`
- Calls `jobAutomationService.getJob()`.
- Returns full job object or 404.

**`DELETE /v1/jobs/:jobId`** -- Cancel job
- Middleware: `requireScopes("jobs:create")` (same scope as create -- cancellation is a write operation)
- Calls `jobAutomationService.cancelJob()`.
- Returns 200 `{ id, status: "cancelled" }` or 409 if job cannot be cancelled.

### Error Format

All errors follow the common API error format established in section 04:

```json
{
  "error": {
    "code": "invalid_job_type",
    "message": "Job type 'foo' is not supported. Valid types: skill_execution, media_generation, ...",
    "type": "invalid_request_error"
  }
}
```

Error codes specific to this section:
- `invalid_job_type` -- unknown job type
- `credit_overflow` -- estimated credits exceed MAX_SINGLE_JOB_CREDITS
- `circular_pipeline_reference` -- cycle detected in pipeline step dependencies
- `max_template_depth_exceeded` -- template resolution exceeded 5 iterations
- `job_not_cancellable` -- job is already completed/failed
- `pipeline_timeout` -- pipeline exceeded MAX_PIPELINE_DURATION_MS (30 min)
- `step_timeout` -- individual step exceeded MAX_STEP_TIMEOUT_MS (10 min)

### CreditSourceType

This section uses `api_job` as the credit source type for all job-related credit operations (reservation, usage tracking, refunds). This source type must be added to the `CreditSourceType` union in section 01.

### Integration with Webhooks (Section 11)

When a job completes or fails and has a `callbackUrl`, the service should emit an event that the webhook delivery system (section 11) can consume. The simplest approach is to publish to a Redis Pub/Sub channel:

```typescript
// After job finalization
const redis = getRedisClient();
await redis.publish(`events:${job.tenantId}`, JSON.stringify({
  type: job.status === "completed" ? "job.completed" : "job.failed",
  data: {
    job_id: job.id,
    type: job.type,
    status: job.status,
    credits_used: job.creditsUsed,
    result: job.result,
    error: job.error,
  },
  timestamp: new Date().toISOString(),
}));
```

The webhook delivery system in section 11 subscribes to this channel and dispatches to registered endpoints. The `callbackUrl` on the job record is a convenience -- the webhook system matches it against registered endpoints or delivers directly.

### Security Considerations

- **Tenant isolation:** All job queries filter by `tenantId` from the authenticated `AuthContext`. A job created by tenant A is never visible to tenant B.
- **Credit overflow guard:** The `MAX_SINGLE_JOB_CREDITS` cap prevents a single API call from draining an entire credit balance. This is a hard limit, not configurable per key.
- **SSRF on callbackUrl:** The `callback_url` field accepts arbitrary URLs. Section 11 handles SSRF validation when actually delivering webhooks. The job service itself stores the URL but does not make HTTP requests to it.
- **Pipeline template injection:** Template variables use a strict regex pattern that only allows dot-notation access. No code execution, no bracket notation, no prototype chain traversal. The resolved value is always a string or JSON primitive from the step result object.
- **Idempotency:** Duplicate job creation attempts with the same `idempotencyKey` return the existing job. The idempotency check happens before credit reservation to avoid double-charging.

---

## Pipeline Edge Case Tests and Guidance

Add these tests to `apps/web/server/routes/__tests__/publicJobsApi.test.ts`:

```
Test: pipeline with empty steps array returns 400
  - Body: { type: "pipeline", params: { steps: [] } }
  - Assert 400 with error code "invalid_request", message "Pipeline must have at least one step"

Test: pipeline with single step executes without dependency resolution
  - Body: { type: "pipeline", params: { steps: [{ type: "skill_execution", params: {...} }] } }
  - Assert job created and runs the single step directly

Test: template variable referencing non-existent step returns error
  - Step B depends on step A's output via {{steps.step_a.result.content}}
  - But step_a does not exist in the steps array
  - Assert job fails with error code "invalid_pipeline", not a runtime crash

Test: template variable with undefined nested path falls back to empty string
  - Step B references {{steps.step_a.result.nonexistent_field}}
  - Step A completed successfully but result has no nonexistent_field
  - Assert the resolved value is "" (empty string), not "undefined" or a crash

Test: pipeline with MAX steps (20) executes successfully
  - Submit pipeline with 20 sequential steps
  - Assert job is created (not rejected)
  - Assert steps execute in dependency order

Test: pipeline with >20 steps returns 400
  - Submit pipeline with 21 steps
  - Assert 400 with error code "invalid_request", message "Pipeline may not exceed 20 steps"
```

### Pipeline Step Dependency Resolution

Steps declare dependencies via the `depends_on` array. The execution engine must resolve these using topological sort (Kahn's algorithm or DFS-based). Key rules:

1. **Cycle detection:** Before execution, run a topological sort. If any cycle is found, fail immediately with `circular_pipeline_reference` error.
2. **Parallel execution:** Steps with no unresolved dependencies can run concurrently (up to the BullMQ worker concurrency limit).
3. **Template variable resolution:** Uses regex `/\{\{steps\.(\w+)\.result\.([a-zA-Z0-9_.]+)\}\}/g`. Only dot-notation traversal is allowed — no bracket notation, no prototype access, no code execution.
4. **Max depth:** Template resolution iterates at most 5 times to handle chained references. If still unresolved after 5 iterations, fail with `max_template_depth_exceeded`.
5. **Max steps:** Hard limit of 20 steps per pipeline to bound execution time and credit usage.
