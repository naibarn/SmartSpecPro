Now I'll extract the content for section-10-caching-optimization from the context files and generate the complete self-contained section.

# Section 10: Caching Optimization

## Overview

This section implements performance optimization through Redis caching and database query batching to support large-scale tenants (100+ users, 1000+ files) without degrading user experience. The caching strategy is carefully designed to balance performance with the critical requirement for immediate permission enforcement.

## Critical Context

**Performance Requirements:**
- Permission check latency: < 100ms per request
- Search latency with permissions: < 1s
- Cache hit rate: > 80% for group membership queries
- Database connection pool utilization: < 80%

**Caching Philosophy (Interview Q7):**
- Permission changes MUST take effect immediately (0-second delay)
- Group membership changes can have 1-minute delay (acceptable)
- Therefore: Cache group memberships, NEVER cache permission levels

**Scale Targets:**
- Support 100+ users per tenant
- Support 50+ groups per tenant
- Support 1000+ files per tenant
- Support 3-8x permission overhead (multiple permission sources per file)

## Dependencies

This section requires:
- **section-02-groups-service** — Extends groupsService with caching
- **section-03-library-service** — Extends libraryService with batching

## Test Stubs (Write Tests FIRST)

### File: `apps/web/server/services/groupsService.test.ts` (EXTEND - Caching)

```typescript
describe('groupsService - Caching', () => {
  describe('getUserGroups caching', () => {
    it('should cache results in Redis with 1-minute TTL');
    it('should serve from cache on second call within TTL');
    it('should expire cache after 60 seconds');
    it('should use cache key format user:{userId}:groups:{tenantId}');
    it('should store minimal data (id, name, role) in cache');
  });

  describe('cache invalidation', () => {
    it('should invalidate only added user\'s cache on addGroupMember');
    it('should NOT invalidate other members\' caches on addGroupMember');
    it('should invalidate only removed user\'s cache on removeGroupMember');
    it('should NOT invalidate other members\' caches on removeGroupMember');
    it('should invalidate all members\' caches on deleteUserGroup');
    it('should invalidate user\'s cache on leave group');
    it('should invalidate owner\'s cache on createUserGroup');
  });

  describe('cache correctness', () => {
    it('should return same data from cache as from database');
    it('should exclude deleted groups from cached results');
    it('should exclude removed memberships from cached results');
    it('should handle cache miss gracefully (query DB, populate cache)');
  });
});
```

### File: `apps/web/server/services/libraryService.test.ts` (EXTEND - Performance)

```typescript
describe('libraryService - Performance', () => {
  describe('batchGetUserPermissions', () => {
    it('should fetch all items in one query (not N+1)');
    it('should return Map<itemId, PermissionInfo>');
    it('should use inArray for itemIds');
    it('should fetch user\'s groups once (cached)');
    it('should resolve permissions for each item correctly');
    it('should handle empty itemIds array gracefully');
    it('should handle user with no groups gracefully');
  });

  describe('pagination', () => {
    it('should limit library list to configured page size');
    it('should support offset for subsequent pages');
    it('should return total count for pagination UI');
  });

  describe('partial indexes usage', () => {
    it('should use partial index for deletedAt IS NULL queries');
    it('should use partial index for status = active queries');
    // Note: Verify with EXPLAIN ANALYZE in manual testing
  });
});
```

## Implementation Details

### 1. Redis Cache for Group Memberships

**File:** `apps/web/server/services/groupsService.ts` (EXTEND)

**Cache Key Format:**
```typescript
const cacheKey = `user:${userId}:groups:${tenantId}`;
```

**Cached Value Structure:**
```typescript
interface CachedGroup {
  id: number;
  name: string;
  role: 'admin' | 'member';
}
```

**Implementation Signature:**
```typescript
async function getUserGroupsWithCache(
  userId: number,
  tenantId: string
): Promise<CachedGroup[]> {
  // 1. Try cache first
  // 2. On cache miss, query database
  // 3. Store in cache with 60-second TTL
  // 4. Return groups
}
```

**Cache Invalidation Logic:**
- `createUserGroup`: Invalidate owner's cache
- `addGroupMember`: Invalidate ONLY added user's cache
- `removeGroupMember`: Invalidate ONLY removed user's cache
- `deleteUserGroup`: Invalidate ALL members' caches
- `leave`: Invalidate leaving user's cache

**Rationale for Selective Invalidation:**
The cached value is user-specific (user's groups), not group-specific (group's members). When User A is added to a group, only User A's "list of groups" changed. Other members' lists are unchanged, so their caches remain valid.

**Invalidation Helper Signature:**
```typescript
async function invalidateUserGroupsCache(userId: number, tenantId: string): Promise<void>;
async function invalidateMultipleUserGroupsCaches(userIds: number[], tenantId: string): Promise<void>;
```

### 2. Batch Permission Checks

**File:** `apps/web/server/services/libraryService.ts` (EXTEND)

**Function Signature:**
```typescript
async function batchGetUserPermissions(
  itemIds: number[],
  actor: LibraryActor
): Promise<Map<number, PermissionInfo>> {
  // 1. Get user's groups (cached)
  // 2. Get all permissions for all items in ONE query
  // 3. Get all items' owner info in ONE query
  // 4. Resolve permissions for each item
  // 5. Return Map of itemId → PermissionInfo
}
```

**PermissionInfo Structure:**
```typescript
interface PermissionInfo {
  effectivePermissionLevel: 'read' | 'write' | 'delete' | 'owner' | null;
  sources: Array<{
    type: 'owner' | 'direct' | 'group' | 'tenant_role';
    permissionLevel?: string;
    subjectId?: string;
    groupName?: string;
  }>;
  canRead: boolean;
  canWrite: boolean;
  canDelete: boolean;
  isOwner: boolean;
}
```

**Query Optimization:**
```typescript
// Instead of N queries (one per item):
for (const item of items) {
  const permissions = await getPermissionsForItem(item.id); // N queries
}

// Use ONE query with inArray:
const permissions = await db
  .select()
  .from(libraryPermissions)
  .where(
    and(
      inArray(libraryPermissions.libraryItemId, itemIds),
      eq(libraryPermissions.tenantId, actor.tenantId)
    )
  );
```

### 3. Pagination Configuration

**File:** `apps/web/server/routers/library.ts` (EXTEND)

**Pagination Constants:**
```typescript
const LIBRARY_PAGE_SIZE = 50; // Default items per page
const GROUP_PAGE_SIZE = 50;   // Default groups per page
const MEMBER_PAGE_SIZE = 100; // Default members per page
const TRASH_PAGE_SIZE = 50;   // Default trash items per page
```

**Pagination Input Schema:**
```typescript
const paginationSchema = z.object({
  limit: z.number().min(1).max(100).default(50),
  offset: z.number().min(0).default(0),
});
```

### 4. Performance Monitoring

**File:** `apps/web/server/middleware/performanceMonitoring.ts` (NEW)

**Metrics to Track:**
```typescript
interface PerformanceMetrics {
  permissionCheckLatency: number;  // Milliseconds
  searchLatency: number;           // Milliseconds
  groupOperationLatency: number;   // Milliseconds
  cacheHitRate: number;            // Percentage (0-100)
  dbConnectionPoolUtilization: number; // Percentage (0-100)
}
```

**Logging Signature:**
```typescript
function logPerformanceMetric(
  metricName: keyof PerformanceMetrics,
  value: number,
  context: Record<string, any>
): void;
```

**Integration with Existing Audit Logger:**
```typescript
auditLogger.log({
  eventType: 'performance_metric',
  metricName: 'permission_check_latency',
  value: 45, // milliseconds
  target: 100, // target threshold
  context: { userId, itemId, tenantId },
});
```

## File Paths

**Files to Modify:**
- `/home/dev/projects/SmartSpecPro/apps/web/server/services/groupsService.ts` (add caching)
- `/home/dev/projects/SmartSpecPro/apps/web/server/services/libraryService.ts` (add batching)
- `/home/dev/projects/SmartSpecPro/apps/web/server/routers/library.ts` (add pagination constants)

**Files to Create:**
- `/home/dev/projects/SmartSpecPro/apps/web/server/middleware/performanceMonitoring.ts` (new)
- `/home/dev/projects/SmartSpecPro/apps/web/server/services/groupsService.test.ts` (caching tests)
- `/home/dev/projects/SmartSpecPro/apps/web/server/services/libraryService.test.ts` (batching tests)

## Implementation Notes

### Redis Connection

The project already uses IORedis. Reuse the existing Redis client from `apps/web/server/redis.ts`.

**Connection Reference:**
```typescript
import { redis } from '../redis';
```

### Cache TTL Configuration

**Environment Variable (Optional):**
```bash
# apps/web/.env
GROUPS_CACHE_TTL=60  # Seconds (default: 60)
```

### Database Connection Pool

Verify connection pool is sized appropriately for increased query load:

**Configuration Location:** `apps/web/server/db.ts`

**Recommended Pool Size:**
- Development: 10 connections
- Production: 20-50 connections (based on load testing)

### Partial Index Verification

Run EXPLAIN ANALYZE in staging/production to verify partial indexes are used:

```sql
EXPLAIN ANALYZE
SELECT * FROM user_groups
WHERE tenantId = 'tenant-123' AND deletedAt IS NULL;

-- Should show: "Index Scan using idx_user_groups_tenant"
-- Should NOT show: "Seq Scan on user_groups"
```

## Performance Targets

| Metric | Target | Critical Threshold |
|--------|--------|-------------------|
| Permission check latency | < 100ms | < 200ms |
| Search latency with permissions | < 1s | < 2s |
| Cache hit rate (group memberships) | > 80% | > 60% |
| Database connection pool usage | < 80% | < 95% |
| Group operation latency | < 200ms | < 500ms |

## Rationale for Design Decisions

### Why Cache Group Memberships?

- **Read-heavy workload:** Every permission check queries user's groups
- **Low churn rate:** Group memberships change infrequently (minutes to hours)
- **Acceptable staleness:** 1-minute delay for membership changes is acceptable (Interview Q7)
- **High cache hit rate:** Same user makes multiple permission checks within 1 minute

### Why NOT Cache Permission Levels?

- **Immediate enforcement required:** Permission changes must take effect instantly (Interview Q7)
- **High risk of stale data:** Cached permission level = security vulnerability
- **Mitigation:** Accept 3-8x query overhead for correctness

### Why Batch Permission Checks?

- **N+1 query problem:** Listing 50 files = 50 permission queries without batching
- **Reduces latency:** 1 query vs 50 queries = 50x speedup
- **Database efficiency:** Fewer round-trips, better connection pool utilization

### Why 1-Minute TTL?

- **Balance freshness and performance:** 1 minute is short enough for most use cases
- **Cache churn:** Longer TTL increases stale data risk, shorter TTL reduces hit rate
- **Invalidation fallback:** Critical operations (add/remove member) invalidate immediately

## Verification Steps

After implementing this section:

1. **Verify Cache Hit Rate:**
   - Monitor Redis `INFO stats` for `keyspace_hits` and `keyspace_misses`
   - Calculate hit rate: `hits / (hits + misses)` should be > 80%

2. **Verify Batch Queries:**
   - Enable query logging in development
   - List 50 files, count permission queries
   - Should see 1-2 queries, not 50

3. **Verify Partial Index Usage:**
   - Run EXPLAIN ANALYZE on common queries
   - Check for "Index Scan" on partial indexes

4. **Verify Performance Targets:**
   - Use audit logger to track latency
   - Check 95th percentile latency for all metrics
   - Investigate if any metric exceeds critical threshold

## Known Limitations

1. **In-Memory Filtering Performance:**
   - Existing `listLibraryDocuments()` loads all tenant items into memory
   - At 1000+ files, this creates latency regardless of caching
   - **Mitigation:** Pagination limits memory impact to 50 items per render
   - **Post-MVP:** Refactor to push permission filtering into SQL WHERE clause

2. **Cache Invalidation Complexity:**
   - Adding a user to 10 groups requires 1 cache invalidation (user's cache)
   - Deleting a group with 100 members requires 100 cache invalidations
   - **Mitigation:** Use Redis pipeline for batch invalidations

3. **Redis Dependency:**
   - If Redis is down, all group membership queries hit database
   - **Mitigation:** Graceful degradation (cache miss → query DB)

## Implementation Notes

### Actual Files Modified
- `apps/web/server/services/libraryService.ts` — Core changes:
  - `getUserPermissionLevel()` now calls `getUserGroups()` and includes group permissions in query (fixes H1 from code review: 6 single-item operations now resolve group-based access)
  - `getPermissionLevelForItem()` accepts optional `userGroupIds` param and processes group permission rows
  - `getDocumentAccessSource()` accepts `hasGroupShare` in permissionInfo
  - `listLibraryDocuments()` includes group permissions in batch query via `getUserGroups()`
  - `searchLibraryItems()` passes group IDs to `getPermissionLevelForItem()`
  - `getLibraryItemShares()` uses batch `inArray` queries for name resolution (2 queries max vs N+1)
- `apps/web/server/services/groupsService.test.ts` — Added 12 caching tests (cache key format, TTL, cache hit, corrupt cache, selective invalidation on 5 mutation types)
- `apps/web/server/services/libraryService.test.ts` — Added batch permission check stubs + 6 canReadLibraryItem tests + groupsService mock
- `apps/web/server/services/libraryDocumentManagementService.test.ts` — Added groupsService mock
- `apps/web/server/services/librarySearchService.test.ts` — Added groupsService mock

### Deviations from Plan
1. **No `batchGetUserPermissions()` standalone function**: Group support was added inline to `getPermissionLevelForItem()` and the batch queries in `listLibraryDocuments`/`searchLibraryItems` (M1 from review — acceptable deviation)
2. **No `performanceMonitoring.ts` middleware**: Deferred to section 12 (M2 from review)
3. **No `LIBRARY_PAGE_SIZE` constants**: Values already inline in Zod schemas (M3 from review — low impact)
4. **No `GROUPS_CACHE_TTL` env var**: Hardcoded to 60 seconds (L4 from review — acceptable for now)
5. **Redis caching was already implemented** in prior sections (02-04), so this section focused on the missing group permission resolution in batch and single-item operations
6. **Critical fix H1**: `getUserPermissionLevel` was updated to resolve group permissions — without this, users with group-only access couldn't open files, read markdown, update items, or share items

### Test Results
- 12 new caching tests in groupsService.test.ts (all pass)
- 6 new permission resolution tests in libraryService.test.ts (all pass)
- 3 batch permission check stubs (test.todo)
- Pre-existing failures in library.test.ts, media.addToLibrary.test.ts, auth.logout.test.ts, gallery.test.ts confirmed unrelated

## Next Steps

After completing this section, proceed to:
- **section-11-security-tests** — Verify caching doesn't introduce security vulnerabilities
- **section-12-deployment-verification** — Load test in staging environment

## References

- Main implementation plan: `claude-plan.md` Part 4 (Performance Optimization)
- TDD stubs: `claude-plan-tdd.md` Part 4
- Interview Q7: Immediate permission enforcement requirement
- Research: Partial indexes reduce index size by 90%+ for soft-delete patterns

---

**End of Section 10**