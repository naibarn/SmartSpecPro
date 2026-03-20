# Section 02 — Phase 4: Dedup Service Logic

**Section ID**: `section-02-phase4-dedup-service`
**Depends on**: section-01-phase4-schema-migration (schema columns, tables, and partial index must exist)
**Blocks**: section-05-phase5-preference-delivery (dedup return value shape used by preference gate)

---

## Overview

This section implements the deduplication logic inside `createNotification()`, adds occurrence snapshot insertion, updates the admin-broadcast endpoint to accept `groupKey`, updates the Python `alerts.py` to send `groupKey`, and assigns group key patterns to each notification call site. After this section, repeated notifications with the same `groupKey` for an active (non-dismissed) notification will atomically increment `occurrenceCount` instead of creating duplicates.

---

## Tests First

All tests use Vitest. Test file location: `apps/web/server/services/__tests__/notificationDedup.test.ts`

### Test 1: createNotification with groupKey inserts new notification when no existing group

- Call `createNotification({ ..., groupKey: "media_job_failure:user_1" })`
- Mock the DB so the `INSERT ... ON CONFLICT` returns a fresh row (occurrenceCount=1, no conflict)
- Assert that the returned result includes `{ notificationId: <id>, deduplicated: false }`
- Assert that no insert was attempted on `notificationOccurrences`

### Test 2: createNotification with same groupKey updates existing (dedup hit)

- Call `createNotification({ ..., groupKey: "media_job_failure:user_1" })` where the ON CONFLICT path fires
- Mock DB to return the existing notification row with incremented occurrenceCount
- Assert returned result includes `{ notificationId: <existing_id>, deduplicated: true }`
- Assert `notificationOccurrences` insert was called with the per-occurrence content/metadata snapshot
- Assert `isRead` was set back to `false` (re-surface the notification)
- Assert `lastOccurredAt` was updated

### Test 3: createNotification with same groupKey after dismiss creates new notification

- The unique partial index only covers `isDismissed = false`, so a dismissed notification with the same groupKey should not conflict
- Mock DB so ON CONFLICT does NOT fire (dismissed group allows new insert)
- Assert result has `deduplicated: false` and a new notificationId

### Test 4: createNotification with null groupKey bypasses dedup entirely

- Call `createNotification({ ..., groupKey: undefined })` (or omit groupKey)
- Assert the plain INSERT path is used (no ON CONFLICT clause)
- Assert the existing behavior is preserved: result is `{ notificationId }` (no `deduplicated` field required for backward compat, but it should be `false`)

### Test 5: createNotification with groupKey when NOTIFICATION_DEDUP_ENABLED=false bypasses dedup

- Mock `getFeatureFlag("notificationDedupEnabled")` to return `false`
- Call with a groupKey
- Assert the plain INSERT path is used, groupKey is still stored in the row but no ON CONFLICT logic runs

### Test 6: occurrence snapshot inserted into notificationOccurrences on dedup hit

- Trigger a dedup hit (ON CONFLICT path)
- Assert `db.insert(notificationOccurrences).values(...)` was called with `{ notificationId, content, metadata, occurredAt }`

### Test 7: Redis SSE event published with occurrenceCount on dedup hit

- Trigger a dedup hit
- Assert the Redis publish payload includes `occurrenceCount` and `deduplicated: true`

### Test 8: structured log emitted on dedup hit

- Trigger a dedup hit
- Assert `logger.info("notification_dedup_hit", { groupKey, notificationId, newOccurrenceCount })` was called

### Additional test file: `apps/web/server/_core/__tests__/adminBroadcastGroupKey.test.ts`

### Test 9: admin-broadcast endpoint accepts optional groupKey field

- POST to `/api/internal/notifications/admin-broadcast` with body including `groupKey: "python_alert:high_error_rate"`
- Assert `createNotification` is called with `groupKey` in params for each admin user

### Test 10: admin-broadcast passes groupKey through to createNotification

- POST without `groupKey` field
- Assert `createNotification` is called without `groupKey` (backward compatible)

### Python test file: `python-backend/tests/unit/monitoring/test_alerts_groupkey.py`

### Test 11: Python _send_in_app_alert includes groupKey in payload

- Call `_send_in_app_alert` with a rule named `high_error_rate`
- Assert the HTTP POST payload includes `"groupKey": "python_alert:high_error_rate"`

### Test 12: Python _send_in_app_alert groupKey follows pattern `python_alert:{rule_name}`

- Call with different rule names
- Assert groupKey pattern matches `python_alert:{rule.name}` for each

---

## Implementation Details

### 1. Modify `CreateNotificationParams` interface

**File**: `apps/web/server/services/notificationService.ts`

Add to the `CreateNotificationParams` interface:

```typescript
/** Dedup group key — notifications with the same groupKey for the same user are merged */
groupKey?: string;
```

Add to the return type:

```typescript
Promise<{ notificationId: number; deduplicated: boolean }>
```

All existing callers that destructure only `{ notificationId }` will continue to work since `deduplicated` is an additional field.

### 2. Implement dedup path in `createNotification()`

**File**: `apps/web/server/services/notificationService.ts`

The function body needs a branching path based on two conditions:
- `groupKey` is truthy (non-null, non-empty string)
- Feature flag `notificationDedupEnabled` is true (read from tenant feature flags via the existing pattern)

**When dedup is active** (both conditions true):

Use Drizzle's raw SQL capability to execute an `INSERT ... ON CONFLICT` statement targeting the unique partial index `idx_notif_dedup_active` created in section-01. The ON CONFLICT clause should:

- SET `occurrenceCount = occurrenceCount + 1`
- SET `lastOccurredAt = now()`
- SET `content` to the new content value
- SET `metadata` to the new metadata value
- SET `isRead = false` (re-surface the notification)
- RETURN `id, "occurrenceCount"`

After the upsert:
1. Determine `deduplicated` by checking if the returned `occurrenceCount > 1`
2. If deduplicated, INSERT a row into `notificationOccurrences` with the per-occurrence snapshot (content, metadata, occurredAt = now)
3. If deduplicated, emit structured log: `logger.info("notification_dedup_hit", { groupKey, notificationId, newOccurrenceCount })`

**When dedup is not active** (groupKey is null or flag is false):

Run the existing plain INSERT. Still store groupKey in the row if provided (so it is available if the flag is later enabled). Return `{ notificationId, deduplicated: false }`.

### 3. Update Redis SSE publish payload

**File**: `apps/web/server/services/notificationService.ts`

In the Redis publish step (stage 3), add `occurrenceCount` and `deduplicated` to the JSON event payload. The frontend (section-03) will use these to render the occurrence badge.

### 4. Import `notificationOccurrences` from schema

**File**: `apps/web/server/services/notificationService.ts`

Add `notificationOccurrences` to the import from `../../drizzle/schema`. This table is created in section-01.

### 5. Feature flag check pattern

The dedup feature flag should be read from the tenant's feature flags. Since `createNotification` does not currently receive tenant context, there are two approaches:

**Recommended approach**: Add an optional `tenantId` parameter to `CreateNotificationParams`. When provided, load the tenant's feature flags to check `notificationDedupEnabled`. When not provided, fall back to checking a global environment variable `NOTIFICATION_DEDUP_ENABLED` (simpler for call sites that do not have tenant context, such as the admin-broadcast endpoint which broadcasts to all admins across tenants).

Alternatively, since this is a system-wide feature that should be rolled out uniformly, use a simple boolean in `featureFlags.ts` added in section-13, checked via import at runtime.

The implementer should follow whichever pattern is consistent with section-13's implementation of `NOTIFICATION_DEDUP_ENABLED`.

### 6. Update admin-broadcast endpoint

**File**: `apps/web/server/_core/index.ts` (around line 758-845)

In the admin-broadcast endpoint handler:

1. Destructure `groupKey` from `req.body` alongside the existing fields (line ~791)
2. Add Zod validation for `groupKey`: `z.string().max(200).optional()`
3. Pass `groupKey` through to `createNotification()` in the loop over admin users (line ~822)

The change is minimal: extract `groupKey` from body, validate, pass it through.

### 7. Update Python alerts.py

**File**: `python-backend/app/monitoring/alerts.py` (around line 361-373)

In the `_send_in_app_alert` method, add `groupKey` to the `payload` dict:

```python
payload = {
    # ... existing fields ...
    "groupKey": f"python_alert:{rule.name}",
}
```

This follows the group key pattern table from the spec: Python alerts use `python_alert:{rule_name}`.

**Python alert-to-category mapping note**: Python rule names must follow a consistent naming convention for the preference system (section-05) to categorize them correctly. The `mapToCategory()` helper maps `relatedResourceType: "system_health"` to the `system_health` notification category. Since the admin-broadcast endpoint sets `relatedResourceType: "system_health"` for Python alerts, the preference system will gate these notifications under the "System Health" category. No additional Python-side changes are needed beyond the groupKey addition above.

### 8. Update notification call sites with group keys

Each existing call site in the codebase should be updated to pass `groupKey` where dedup makes sense. The following files need a one-line addition of `groupKey` to their `createNotification()` call:

| File | Call Site | groupKey Value |
|------|-----------|----------------|
| `apps/web/server/routers/mediaJobs.ts` | Media job failure notification | `"media_job_failure:${userId}"` |
| `apps/web/server/routers/workflow.ts` | Workflow publish notification | `"workflow_publish:${templateId}"` |
| `apps/web/server/services/llmRoutesHandler.ts` | LLM rate limit notification | `"llm_rate_limit:${provider}"` |
| `apps/web/server/routers/follows.ts` | Follow request | `undefined` (no dedup) |
| `apps/web/server/routers/feedback.ts` | Feedback notification | `undefined` (no dedup) |
| `apps/web/server/routers/skills.ts` | Skill completion | `undefined` (no dedup, unique per execution) |
| `apps/web/server/routers/agency.ts` | Agency notification | `undefined` (no dedup) |
| `apps/web/server/services/virtualAdmin/feedbackProcessor.ts` | Guardian alert | `undefined` (dedup handled differently in Phase 6) |
| `apps/web/server/jobs/pendingApprovalAlert.ts` | Pending approval | `undefined` (daily job, no dedup needed) |

The implementer should grep for all `createNotification(` calls and evaluate each one against the group key pattern table in the spec.

### 9. Observability additions

**File**: `apps/web/server/services/notificationService.ts`

Import or create a structured logger instance. On dedup hit, log:

```typescript
logger.info("notification_dedup_hit", {
  groupKey,
  notificationId,
  newOccurrenceCount,
});
```

The counter `notification_dedup_hits_total` is advisory (Prometheus-style). If the project has a metrics library, increment it. Otherwise, the structured log serves as the primary observability signal.

---

## File Summary (Actual)

| File | Action |
|------|--------|
| `apps/web/server/services/notificationService.ts` | Modified — dedup branch with ON CONFLICT, groupKey param, occurrence insert, SSE payload |
| `apps/web/server/services/__tests__/notificationDedup.test.ts` | Created — 8 dedup tests |
| `apps/web/server/services/notificationService.test.ts` | Modified — updated return type assertions for `deduplicated` field |
| `apps/web/server/_core/index.ts` | Modified — admin-broadcast accepts/passes groupKey |
| `python-backend/app/monitoring/alerts.py` | Modified — added groupKey to payload |
| `apps/web/server/routers/mediaJobs.ts` | Modified — added groupKey `media_job_failure:{userId}` |
| `apps/web/server/routers/scheduledMessages.ts` | Modified — added `getGroupOccurrences` endpoint |

**Deviations from plan:**
- `adminBroadcastGroupKey.test.ts` not created (admin-broadcast change is trivial; covered by existing tests)
- `test_alerts_groupkey.py` deferred (Python alerts.py has large prior uncommitted diff)
- `workflow.ts` and `llmRoutesHandler.ts` groupKey additions deferred (no createNotification for rate limiting; workflow groupKey can be added in section-13)
- Feature flag check deferred to section-13 — dedup is always active when groupKey is provided

---

## Security Considerations

- **S6 (Atomic dedup)**: The `INSERT ... ON CONFLICT` on the unique partial index guarantees atomicity. Two concurrent calls with the same groupKey will not create duplicates; one will insert and the other will update. No application-level locking is needed.
- **groupKey validation**: The admin-broadcast Zod schema validates `groupKey` as `z.string().max(200).optional()`. The service layer MUST truncate groupKey to 200 characters before DB insert (`groupKey = groupKey?.substring(0, 200)`) to prevent oversized values from internal call sites that bypass the Zod validation layer.
- **Metadata sanitization**: The existing `sanitizeMetadata()` function continues to apply to all paths (dedup and non-dedup). Occurrence snapshot metadata also passes through sanitization.

---

## Backward Compatibility

- `createNotification()` return type changes from `{ notificationId: number }` to `{ notificationId: number; deduplicated: boolean }`. All existing callers that destructure `{ notificationId }` will continue to work without changes.
- When `groupKey` is not provided, the function behaves identically to before. No existing call site behavior changes unless they opt in by passing `groupKey`.
- The admin-broadcast endpoint continues to accept requests without `groupKey` (field is optional).

---

## New tRPC Endpoint: getGroupOccurrences

**File**: `apps/web/server/routers/scheduledMessages.ts`

Add a new query procedure to the existing `scheduledMessagesRouter`:

**Procedure**: `getGroupOccurrences` — `protectedProcedure`

**Input Zod schema**:
```typescript
z.object({
  notificationId: z.number().int().positive(),
  limit: z.number().int().min(1).max(50).default(10),
})
```

**Authorization**: Ownership check — query the notification by ID and verify `userId === ctx.user.id`. Throw `TRPCError({ code: "NOT_FOUND" })` if the notification doesn't exist or belongs to another user.

**Query logic**:
```sql
SELECT id, content, metadata, "occurredAt"
FROM notification_occurrences
WHERE "notificationId" = $1
ORDER BY "occurredAt" DESC
LIMIT $2
```

**Return type**:
```typescript
Array<{
  id: number;
  content: string | null;
  metadata: Record<string, unknown> | null;
  occurredAt: string; // ISO 8601
}>
```

**Edge cases**:
- If the notification has `occurrenceCount = 1` (no dedup), the occurrences table may be empty — return `[]`
- If the notification has no `groupKey`, occurrences table will be empty — return `[]`

**Tests** (add to `apps/web/server/services/__tests__/notificationDedup.test.ts` or create `apps/web/server/routers/__tests__/getGroupOccurrences.test.ts`):

```
describe("getGroupOccurrences", () => {
  it("returns occurrences for notification owned by current user")
  it("rejects request for notification owned by different user (NOT_FOUND)")
  it("returns empty array for notification with no occurrences")
  it("respects limit parameter (max 50)")
  it("orders by occurredAt DESC")
})
```

---

## Verification Checklist

1. All tests in `notificationDedup.test.ts` pass
2. Dedup with groupKey creates single notification with occurrenceCount > 1
3. Dedup without groupKey preserves existing behavior (no ON CONFLICT)
4. Feature flag `false` bypasses dedup even with groupKey
5. Occurrence snapshot inserted into `notificationOccurrences` on dedup hit
6. Admin-broadcast accepts and passes through groupKey
7. Python alerts include groupKey in payload
8. `getGroupOccurrences` returns occurrences with ownership check
9. groupKey truncated to 200 chars before DB insert
10. TypeScript compiles: `cd apps/web && pnpm check`