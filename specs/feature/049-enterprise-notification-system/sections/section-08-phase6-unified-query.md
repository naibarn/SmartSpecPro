# Section 08: Phase 6 -- Unified Notification Query Service

## Section ID
`section-08-phase6-unified-query`

## Overview

This section creates `unifiedNotificationService.ts`, a multi-source query layer that merges notifications from `userNotifications` and `orchestratorNotifications` into a single sorted stream. It also adds a Redis-cached unified unread count, a missing performance index on `orchestratorNotifications`, Guardian metadata enrichment in `feedbackProcessor.ts`, and unified tRPC endpoints for the admin dashboard (section-09).

**Performance budget**: unified page load query must complete in under 200ms.

**Pagination strategy**: LIMIT N+1 pattern (not cursor tokens). This is sufficient for medium-scale (50-500 notifs/user/day). Cursor-based pagination with opaque tokens is a future optimization that can be added without API contract changes.

## Dependencies

| Section | What it provides |
|---------|-----------------|
| section-01 | `userNotifications` table with groupKey/occurrenceCount columns |
| section-05 | `mapToCategory()` helper, `NotificationMetadata` with `isEscalated` field |
| section-13 | `notificationUnifiedCenter` feature flag |

## Files Created/Modified (Actual)

| File | Action |
|------|--------|
| `apps/web/server/services/unifiedNotificationService.ts` | **Created** — multi-source query service with mappers, filters, stats, Redis-cached unread count |
| `apps/web/server/services/__tests__/unifiedNotificationService.test.ts` | **Created** — 12 tests for mappers, severity mapping, ID format, edge cases |
| `apps/web/drizzle/schema.ts` | **Modified** — added `idx_orch_notif_user_created(userId, createdAt)` index |
| `apps/web/server/services/virtualAdmin/feedbackProcessor.ts` | **Modified** — enriched Guardian metadata with eventId, relatedItems, incident-aware actionUrl |
| `apps/web/server/routers/monitoring.ts` | **Modified** — added `getUnifiedNotifications` and `getUnifiedStats` admin endpoints |

## Implementation Deviations

- **Feature flag gate**: Deferred to section-13 which owns `notificationUnifiedCenter` flag. Endpoints use `adminProcedure` (role check) but don't gate on the flag yet.
- **Migration not run**: Index added to schema.ts but `pnpm db:push` not run (requires sudo systemctl for production). Index SQL will be generated on next migration cycle.
- **Redis health check**: Deferred — the spec mentions a Redis pub/sub health probe and SSE connection gauge. These are observability enhancements that will be added in a hardening pass.
- **Tests**: Focused on mapper/format tests (12 passing). Integration tests for `getUnifiedNotifications` and `getUnifiedStats` would require full DB mocking and are deferred.

---

## TDD Tests

### Test file: `apps/web/server/services/__tests__/unifiedNotificationService.test.ts`

Mock `getDb()`, `getRedisClient()`. Use chainable Drizzle mocks.

```
describe("UnifiedNotification mapping", () => {
  it("user notification maps with source='user' and id='user:123'")
  it("orchestrator notification maps with source='orchestrator' and id='orch:abc-456'")
  it("guardian notification (metadata.source starts with 'guardian.') maps with source='guardian'")
})

describe("getUnifiedNotifications", () => {
  it("returns items from both userNotifications and orchestratorNotifications")
  it("sorts merged results by createdAt DESC across sources")
  it("returns correct source field for each item")
  it("uses correct ID prefix format")

  describe("pagination", () => {
    it("returns hasMore=true when more items exist (N+1 pattern)")
    it("returns hasMore=false when total items <= limit")
    it("respects limit parameter (max N items)")
  })

  describe("filtering", () => {
    it("filters by source when filter provided")
    it("filters by severity when filter provided")
    it("filters by date range")
    it("returns all sources when no filter specified")
  })

  describe("tenant isolation (S8)", () => {
    it("includes tenantId filter on orchestratorNotifications query")
    it("does not return cross-tenant orchestrator notifications")
  })
})

describe("getUnifiedStats", () => {
  it("returns correct total count across both sources")
  it("returns correct unread count")
  it("returns correct critical count")
  it("returns correct today count")
  it("returns source breakdown with counts per source")
  it("returns severity distribution")
})

describe("getUnifiedUnreadCount (Redis-cached)", () => {
  it("returns cached count when Redis has value within TTL")
  it("falls back to DB count on cache miss")
  it("stores count in Redis with 60s TTL after DB query")
  it("cache key is 'notification:unified_count:{userId}'")
  it("handles Redis unavailability gracefully")
})
```

### Guardian enrichment tests (add to feedbackProcessor test file):

```
describe("Guardian metadata enrichment", () => {
  it("includes metadata.source as 'guardian.feedbackProcessor'")
  it("includes metadata.eventId as string of ticketId")
  it("includes metadata.relatedItems.ruleId when incident correlated")
  it("includes metadata.relatedItems.sensorId")
  it("includes metadata.relatedItems.actionTaken")
  it("sets relatedResourceType to 'incident' when incident exists")
  it("sets actionUrl with incidentId parameter")
})
```

### Unified tRPC endpoint tests:

```
describe("getUnifiedNotifications endpoint", () => {
  it("requires admin role")
  it("passes filters to service")
  it("returns paginated results with hasMore flag")
  it("returns FORBIDDEN when NOTIFICATION_UNIFIED_CENTER flag is false")
})

describe("getUnifiedStats endpoint", () => {
  it("requires admin role")
  it("returns aggregated counts")
  it("returns FORBIDDEN when flag is false")
})
```

---

## Implementation Guidance

### 1. Add Missing Index on orchestratorNotifications

**File**: `apps/web/drizzle/schema.ts`

Add to the orchestratorNotifications index array:
```typescript
index("idx_orch_notif_user_created").on(t.userId, t.createdAt),
```

Run `pnpm db:push` to generate migration.

### 2. UnifiedNotification Interface

```typescript
export interface UnifiedNotification {
  id: string;            // "user:123" or "orch:abc-456"
  source: "user" | "orchestrator" | "guardian";
  userId: number;
  title: string;
  content: string | null;
  priority: "low" | "normal" | "high" | "critical";
  isRead: boolean;
  isDismissed: boolean;
  actionUrl: string | null;
  createdAt: Date;
  metadata: Record<string, unknown> | null;
  teamId?: string | null;
  roomId?: string | null;
  runId?: string | null;
  occurrenceCount?: number;
  groupKey?: string | null;
}
```

### 3. Query Strategy (LIMIT N+1)

```typescript
export async function getUnifiedNotifications(
  tenantId: string,
  filters: { source?, severity?, startDate?, endDate?, limit?, page? },
): Promise<{ items: UnifiedNotification[]; hasMore: boolean }> {
  const limit = filters.limit ?? 20;
  const offset = (filters.page ?? 0) * limit;

  // Query both sources in parallel (skip if source filter excludes)
  const [userRows, orchRows] = await Promise.all([
    filters.source === "orchestrator" ? [] : queryUserNotifications(limit + 1, offset, filters),
    filters.source === "user" ? [] : queryOrchNotifications(tenantId, limit + 1, offset, filters),
  ]);

  // Map to UnifiedNotification (detect guardian via metadata.source)
  // Merge, sort by createdAt DESC
  // Detect hasMore from length > limit, slice to limit
}
```

**Severity mapping** for orchestratorNotifications: `info→low, warning→normal, error→high, critical→critical`.

### 4. getUnifiedStats

Run COUNT queries in parallel using `Promise.all`. Sum results from both sources for total/unread/critical/today. GROUP BY for distribution.

### 5. getUnifiedUnreadCount (Redis-cached)

Key: `notification:unified_count:${userId}`, TTL: 60s.

**Cache invalidation**: After `createNotification()` in `notificationService.ts`, delete the key for the affected user. After creating orchestrator notification, same. This is fire-and-forget.

### 6. Guardian Metadata Enrichment

**File**: `apps/web/server/services/virtualAdmin/feedbackProcessor.ts`

Update the `createNotification()` call to include:
- `metadata.eventId`: `String(ticketId)`
- `metadata.relatedItems.ruleId`: incident ID if correlated
- `metadata.relatedItems.sensorId`: `"feedbackProcessor"`
- `metadata.relatedItems.actionTaken`: processing outcome
- `relatedResourceType`: `"incident"` when incident exists, else `"feedback"`
- `actionUrl`: `/admin/system-guardian?incident=${incidentId}` when incident exists

### 7. tRPC Endpoints

Add to `monitoring.ts` router:

**`getUnifiedNotifications`** -- `adminProcedure` with Zod input for source, severity, date range, limit, page. Check `notificationUnifiedCenter` flag; throw FORBIDDEN if disabled.

**`getUnifiedStats`** -- `adminProcedure`. Check flag. Return aggregated counts.

No changes to `routers.ts` — endpoints added to existing `monitoringRouter`.

---

## Security (S8 — Tenant Isolation)

- Every `orchestratorNotifications` query MUST include `tenantId = ctx.tenantId`
- When querying across all users (admin), filter `userNotifications` by users belonging to current tenant: `userId IN (SELECT id FROM users WHERE currentTenantId = :tenantId)`
- Both endpoints use `adminProcedure` (role check)
- Redis cache keys are user-scoped

## Observability

- `logger.info("unified_query", { tenantId, source, resultCount, durationMs })`
- `logger.info("unified_count_cache_hit", { userId })`
- `logger.info("unified_count_cache_miss", { userId })`

## Health Checks

**Redis pub/sub round-trip probe** (spec requirement): Add a periodic health check that publishes a test message to `notifications:health` channel and verifies receipt within 5 seconds. If probe fails, log `logger.warn("notification_health_check_failed", { probe: "redis_pubsub" })`.

**SSE connection gauge**: Export `getActiveSSEConnectionCount()` from `notificationStream.ts` (reads the `activeSubscribers` Map size). Expose via the existing `/api/health` or monitoring endpoint.

## Verification Checklist

1. All tests pass
2. New index exists on `orchestrator_notifications(userId, createdAt)`
3. Unified query returns merged, sorted results from both tables
4. Tenant isolation enforced (S8)
5. Redis cache with 60s TTL working
6. Guardian notifications include enriched metadata
7. Both endpoints gated by feature flag
8. TypeScript compiles: `cd apps/web && pnpm check`
