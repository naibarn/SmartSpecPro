I now have all the context needed. Let me produce the section.

# Section 08 -- Credit Reconciliation

## Overview

This section adds post-completion credit reconciliation to the Node.js media status handler in `apps/web/server/routers/media.ts`. When the frontend polls for task status via the `getTask` tRPC procedure and the task has completed with `actual_duration` (and optionally `actual_resolution`) in `resultData`, the handler computes the actual credit cost using the model's pricing tiers and adjusts the user's balance: refunding the difference if the actual cost is lower than the pre-reserved amount, or charging additional credits if the actual cost is higher.

**Files modified:**
- `/home/dev/projects/SmartSpecPro/apps/web/server/routers/media.ts`

**Depends on:** section-04-gateway-routing (routing must store task data), section-05-celery-polling (must store `actual_duration` and `actual_resolution` in `result_data`)
**Blocks:** Nothing

---

## Tests First

### Test file: `/home/dev/projects/SmartSpecPro/apps/web/server/__tests__/creditReconciliation.test.ts`

```typescript
// creditReconciliation.test.ts
//
// Tests for the reconcileTaskCredits() function extracted from the media router.
// Uses Vitest with mocked creditService and pricingCalculator.

// --- Reconciliation logic ---
// Test: actual_duration < reserved_duration -> calls refundCredits with (reserved - actual) difference
// Test: actual_duration > reserved_duration -> calls deductCredits with (actual - reserved) difference
// Test: actual_duration == reserved_duration -> neither refund nor deduct called (no-op)
// Test: missing actual_duration in resultData -> skip reconciliation entirely (no refund, no charge)
// Test: missing resultData -> skip reconciliation entirely
// Test: reconciliation only runs once per task (checks for reconciled flag in metadata, sets it after)

// --- Cost calculation ---
// Test: uses model pricing tiers with actual resolution + actual duration to compute actual cost
// Test: resolution derived from actual_resolution field in resultData (e.g., "1080p", "1440p", "2160p")
// Test: when actual_resolution is missing, falls back to original reservation resolution
// Test: composite tier key built correctly (e.g., "1080p-6s" for matrix formula)
// Test: per_unit (TTS) models skip reconciliation (TTS is synchronous, no post-reconciliation needed)
// Test: flat formula models skip reconciliation (no duration-based variance)

// --- Edge cases ---
// Test: task with status != "completed" -> skip reconciliation
// Test: task model not in DB (getModelWithPricing returns null) -> skip reconciliation, log warning
// Test: refundCredits failure does not throw (catches and logs error)
// Test: deductCredits failure does not throw (catches and logs error)
// Test: zero difference (actual cost equals reserved cost after rounding) -> no-op
```

Implementation notes for tests:
- Extract the reconciliation logic into a standalone async function `reconcileTaskCredits()` so it can be unit tested in isolation
- Mock `getModelWithPricing` from the same module to return test pricing configs
- Mock `deductCredits` and `refundCredits` from `creditService.ts`
- Mock `calculateCreditCost` from `pricingCalculator.ts`
- Use `vi.fn()` for all mocks, assert on call arguments

---

## Background & Data Flow

### Current Credit Flow (Pre-Reservation)

The existing flow in the media router for async video generation (line ~1700 of `media.ts`):

1. User submits video generation request with `model`, `duration`, `resolution`
2. `getModelWithPricing(model)` fetches model's `creditCost` and `configJson` (pricing tiers) from DB
3. `calculateCreditCost(dbModel, { duration, resolution })` computes estimated cost using composite tier keys (e.g., `"1080p-6s": 360`)
4. `deductCredits({ userId, amount: creditCost, metadata: { type: "reservation", creditCost } })` pre-reserves credits
5. Task is submitted to Python backend; if submission fails, credits are refunded

### New Post-Completion Flow (This Section)

When the frontend polls `getTask` and receives a completed task:

1. The Python `recover_stuck_tasks` Celery task (section-05) stores `actual_duration` and `actual_resolution` in `task.result_data` when the fal.ai queue completes
2. The `getTask` tRPC query in `media.ts` returns the task with `resultData.actual_duration`
3. **New code**: After `getTask` returns a completed task, call `reconcileTaskCredits()`:
   - If `resultData.actual_duration` is present, compute actual cost
   - Compare to pre-reserved amount (stored in the original deduction transaction metadata)
   - Refund or charge the difference

### Key Interfaces

**Task shape from `mediaGenerationService.mapTask()`** (file: `/home/dev/projects/SmartSpecPro/apps/web/server/services/mediaGenerationService.ts`, line ~1652):
```typescript
interface MediaTask {
  id: string;
  taskId?: string;        // External provider task ID
  status: TaskStatus;     // "pending" | "processing" | "completed" | "failed" | "cancelled"
  model: string;          // e.g., "fal-ai/ltx-2.3/text-to-video"
  resultData?: Record<string, unknown>; // Contains actual_duration, actual_resolution from Python
  // ... other fields
}
```

**`resultData` shape from Python Celery polling** (section-05 stores these):
```typescript
{
  actual_duration?: number;      // Actual video duration in seconds (e.g., 6)
  actual_resolution?: string;    // Derived resolution: "1080p", "1440p", "2160p"
  // ... other fal.ai response data
}
```

**`getModelWithPricing()` return type** (file: `/home/dev/projects/SmartSpecPro/apps/web/server/routers/media.ts`, line ~89):
```typescript
{ creditCost: number; configJson: Record<string, any> | null }
```

**`calculateCreditCost()` signature** (file: `/home/dev/projects/SmartSpecPro/apps/web/server/services/pricingCalculator.ts`, line ~150):
```typescript
function calculateCreditCost(
  model: { creditCost: number; configJson?: Record<string, any> | null },
  selections: UserSelections
): number
```

**`refundCredits()` signature** (file: `/home/dev/projects/SmartSpecPro/apps/web/server/services/creditService.ts`, line ~518):
```typescript
function refundCredits(params: {
  userId: number;
  amount: number;
  description: string;
  originalTransactionId?: number;
  metadata?: Record<string, any>;
  sourceType?: CreditSourceType;
}): Promise<...>
```

**`deductCredits()` signature** (file: `/home/dev/projects/SmartSpecPro/apps/web/server/services/creditService.ts`, line ~157):
```typescript
function deductCredits(params: DeductCreditsParams): Promise<...>
// DeductCreditsParams includes: userId, amount, description, sourceType?, metadata?
```

---

## Implementation Details

### 1. Extract `reconcileTaskCredits()` Helper Function

Add a new exported async function in `/home/dev/projects/SmartSpecPro/apps/web/server/routers/media.ts` (near the top, after the existing helper functions around line 84).

```typescript
/**
 * Post-completion credit reconciliation for async media tasks.
 * Compares actual output (duration/resolution from result_data) against
 * pre-reserved credits and adjusts the user's balance.
 *
 * Skips reconciliation when:
 * - Task is not completed
 * - resultData.actual_duration is missing (conservative: keep reservation)
 * - Model pricing data is unavailable
 * - Task has already been reconciled (idempotency via reconciled flag)
 * - Model uses per_unit or flat pricing (no duration-based variance)
 */
export async function reconcileTaskCredits(params: {
  task: MediaTask;
  userId: number;
  reservedCredits: number;
  reservedSelections: { duration?: number; resolution?: string };
}): Promise<{ adjusted: boolean; difference: number; action: "refund" | "charge" | "none" }>
```

Docstring-only stub; implementer fills in body.

### 2. Reconciliation Logic (Inside `reconcileTaskCredits`)

The function performs the following steps:

**Step A: Guard clauses**
- If `task.status !== "completed"`, return `{ adjusted: false, difference: 0, action: "none" }`
- If `task.resultData?.actual_duration` is `undefined` or `null`, skip (keep reservation)
- Check for `task.resultData?.__credits_reconciled === true` flag to ensure idempotency; if already reconciled, return no-op

**Step B: Determine applicable pricing formula**
- Call `getModelWithPricing(task.model)` to get model pricing config
- If model not found or `configJson` is null, log warning and skip
- Extract `pricingFormula` from `configJson`
- If `pricingFormula` is `"per_unit"` or `"flat"`, skip reconciliation (these have no duration-based variance)

**Step C: Compute actual cost**
- Build `UserSelections` from actual data:
  - `duration`: `task.resultData.actual_duration` (number)
  - `resolution`: `task.resultData.actual_resolution` or fallback to `reservedSelections.resolution`
- Call `calculateCreditCost(dbModel, actualSelections)` to get `actualCost`

**Step D: Compare and adjust**
- `difference = actualCost - reservedCredits`
- If `difference > 0`: charge additional credits via `deductCredits()`
- If `difference < 0`: refund excess via `refundCredits()`
- If `difference === 0`: no-op

**Step E: Mark as reconciled**
- The reconciliation status needs to be tracked to prevent double-reconciliation on repeated `getTask` polls. Two approaches (implementer chooses):
  1. Store a reconciliation flag in Redis with key `credit:reconciled:{taskId}` (TTL 24h)
  2. Track via the credit transaction's idempotency key `reconcile:{taskId}`

### 3. Wire into `getTask` tRPC Procedure

Modify the `getTask` procedure in `/home/dev/projects/SmartSpecPro/apps/web/server/routers/media.ts` (line ~1797) to call reconciliation after fetching the task.

The current `getTask` handler (line ~1798-1819):
```typescript
getTask: protectedProcedure
  .input(z.object({ taskId: z.string() }))
  .query(async ({ input, ctx }) => {
    const userToken = getUserToken(ctx);
    const task = await mediaGenerationService.getTask(input.taskId, userToken, { ... });
    return task;
  }),
```

Add reconciliation logic after the `getTask` call, before `return task`:

- Check if `task.status === "completed"` and `task.resultData?.actual_duration` exists
- Look up the original reservation amount from the deduction transaction (query `creditTransactions` where `metadata->>'type' = 'reservation'` and `metadata->>'model' = task.model` for this user, ordered by most recent)
- Alternatively, pass `reservedCredits` from the task's `parameters` field if it was stored there during submission
- Call `reconcileTaskCredits({ task, userId: ctx.user.id, reservedCredits, reservedSelections })`
- Wrap in try/catch: reconciliation failures must NOT break task polling

### 4. Retrieving the Pre-Reserved Amount

The pre-reserved credit amount is stored in the `deductCredits` call metadata during video submission (line ~1720-1735):
```typescript
metadata: {
  model,
  provider: modelMeta.provider,
  type: "reservation",
  creditCost,   // <-- This is the reserved amount
  duration,
}
```

To retrieve this during reconciliation, query the credit transactions table:
```typescript
// Query pattern (use Drizzle ORM):
const [reservation] = await db
  .select({ amount: creditTransactions.amount, metadata: creditTransactions.metadata })
  .from(creditTransactions)
  .where(
    and(
      eq(creditTransactions.userId, userId),
      sql`${creditTransactions.metadata}->>'type' = 'reservation'`,
      // Match by task correlation - use the model + approximate timestamp
    )
  )
  .orderBy(desc(creditTransactions.createdAt))
  .limit(1);
```

**Better approach**: Store the `reservedCredits` and `reservedSelections` on the task itself. Modify the video submission flow to include `creditCost` and user selections in the task parameters sent to Python backend. This avoids querying credit transactions. The `parameters` field on the task already stores request parameters.

Specifically, add to the `generateVideoAsync` call's parameters (or `apiConfig`):
```typescript
extraParams: {
  ...input.extraParams,
  __reserved_credits: creditCost,
  __reserved_resolution: input.resolution,
  __reserved_duration: duration,
}
```

Then in `reconcileTaskCredits`, read from `task.parameters.__reserved_credits`.

### 5. Credit Adjustment Calls

**Refund (actual < reserved):**
```typescript
await refundCredits({
  userId,
  amount: Math.abs(difference),
  description: `Credit reconciliation refund: ${task.model} (actual ${actualDuration}s vs reserved ${reservedDuration}s)`,
  sourceType: "media_video",
  metadata: {
    model: task.model,
    taskId: task.id,
    type: "reconciliation_refund",
    actualCost,
    reservedCost: reservedCredits,
    actualDuration,
    actualResolution,
  },
});
```

**Additional charge (actual > reserved):**
```typescript
await deductCredits({
  userId,
  amount: difference,
  description: `Credit reconciliation charge: ${task.model} (actual ${actualDuration}s vs reserved ${reservedDuration}s)`,
  sourceType: "media_video",
  metadata: {
    model: task.model,
    taskId: task.id,
    type: "reconciliation_charge",
    actualCost,
    reservedCost: reservedCredits,
    actualDuration,
    actualResolution,
  },
});
```

### 6. Idempotency

Since `getTask` is polled repeatedly by the frontend, reconciliation MUST be idempotent. Use a Redis key to track reconciliation:

```typescript
const redis = getRedisClient();
const reconcileKey = `credit:reconciled:${task.id}`;
const alreadyReconciled = await redis.get(reconcileKey);
if (alreadyReconciled) {
  return { adjusted: false, difference: 0, action: "none" };
}
// ... perform reconciliation ...
await redis.set(reconcileKey, JSON.stringify({ action, difference, timestamp: Date.now() }), "EX", 86400); // 24h TTL
```

---

## Applicability

Credit reconciliation applies ONLY to fal.ai video models using `"matrix"` pricing with duration-based composite tier keys. It does NOT apply to:

- **TTS (Lux TTS)**: Synchronous, credits deducted immediately based on character count (section-04)
- **Image (Flux)**: Synchronous with flat pricing, no duration variance
- **Audio-to-video, extend-video, retake-video**: These use flat per-second pricing and may benefit from reconciliation if actual duration differs from requested
- **Other providers (BytePlus, Kie.ai)**: Could potentially benefit but are out of scope for this section

The guard clause checking `pricingFormula` ensures only applicable models trigger reconciliation.

---

## Edge Cases

| Scenario | Behavior |
|----------|----------|
| `actual_duration` missing from `resultData` | Skip reconciliation, keep pre-reserved amount (conservative) |
| Model not found in DB | Skip reconciliation, log warning |
| `deductCredits` fails (insufficient balance for extra charge) | Catch error, log it, do not retry |
| `refundCredits` fails | Catch error, log it, do not retry |
| Repeated `getTask` polls on completed task | Redis idempotency key prevents double reconciliation |
| Task failed (not completed) | Skip reconciliation; failure refund already handled in submission catch block |
| Actual resolution differs from requested | Uses `actual_resolution` from `resultData` for cost calculation |
| `actual_duration` is 0 or negative | Treat as invalid, skip reconciliation |

---

## Dependencies on Other Sections

- **section-04-gateway-routing**: The gateway must pass through the `__reserved_credits` and `__reserved_resolution` fields in extraParams so they survive the round-trip to Python and back in `task.parameters`
- **section-05-celery-polling**: The Celery polling branch must store `actual_duration` (number, seconds) and `actual_resolution` (string, e.g., "1080p") in `task.result_data` when fal.ai completes. Resolution is derived from video width: width >= 3840 -> "2160p", >= 2560 -> "1440p", else "1080p"

---

## Verification

After implementation:
1. Run `pnpm test` in `/home/dev/projects/SmartSpecPro/apps/web` to verify the new test file passes
2. Manually verify by submitting a fal.ai video task, waiting for completion, and checking that credit transactions show both the initial reservation and the reconciliation adjustment
3. Verify repeated `getTask` polls do not create duplicate reconciliation transactions (check Redis key and credit transaction table)
4. Verify non-fal.ai tasks (BytePlus, Kie.ai) are unaffected -- no reconciliation triggered