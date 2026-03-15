# Section 05: Visual State Service

## Overview

This section implements `visualStateService.ts`, the service responsible for managing a per-conversation "visual working set" -- the set of images currently relevant to an ongoing conversation. It reads from and writes to the `conversation_visual_state` table (defined in section-01) and uses Redis caching for fast reads. The service tracks four categories of image asset IDs: recent (FIFO, max 12), active (max 5, set by reference resolution), compared (images being compared), and named sets (user-defined groups).

**File to create**: `/home/dev/projects/SmartSpecPro/apps/web/server/services/visualStateService.ts`

**Test file to create**: `/home/dev/projects/SmartSpecPro/apps/web/server/services/__tests__/visualStateService.test.ts`

### Dependencies

- **section-01-schema-and-migration**: Provides the `conversationVisualState` Drizzle table definition and the `mediaAssets` table. The `conversation_visual_state` table has these columns:
  - `conversationId` (int PK, FK conversations CASCADE)
  - `recentAssetIds` (jsonb, default `[]`)
  - `activeAssetIds` (jsonb, default `[]`)
  - `comparedAssetIds` (jsonb, default `[]`)
  - `namedSets` (jsonb, default `{}`)
  - `updatedAt` (timestamptz)

### Blocked By

- section-01 must be completed first (schema must exist).

### Blocks

- **section-06-retrieval-and-reference-resolution**: Uses `getOrCreateState` to supply recent image metadata for the LLM resolver.
- **section-07-context-packing-integration**: Uses visual state to determine whether adaptive budget should activate.

---

## Tests (Write First)

Create `/home/dev/projects/SmartSpecPro/apps/web/server/services/__tests__/visualStateService.test.ts`.

All database and Redis interactions should be mocked. The test file uses Vitest with `vi.mock()`.

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock Drizzle DB access
vi.mock("../../drizzle/schema", () => ({
  conversationVisualState: { /* mock table reference */ },
}));

// Mock Redis
vi.mock("../services/redis", () => ({
  getRedisClient: vi.fn(),
  isRedisAvailable: vi.fn(() => true),
}));

describe("visualStateService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("getOrCreateState", () => {
    // Test: returns empty state for new conversation
    //   - When no row exists for conversationId, inserts a default row
    //   - Returns { recentAssetIds: [], activeAssetIds: [], comparedAssetIds: [], namedSets: {} }

    // Test: returns existing state for known conversation
    //   - When row exists, returns its JSONB columns deserialized

    // Test: reads from Redis cache when available (cache hit)
    //   - When Redis has a cached state with valid TTL, returns it without DB query

    // Test: falls back to DB when Redis unavailable
    //   - When isRedisAvailable() returns false, queries DB directly
  });

  describe("addRecentAsset", () => {
    // Test: appends assetId to recentAssetIds
    //   - After adding assetId=42 to an empty list, recentAssetIds is [42]

    // Test: evicts oldest when list exceeds 12
    //   - Start with 12 items [1..12], add 13 → result is [2..13]
    //   - Uses PostgreSQL atomic jsonb operation (not read-modify-write)

    // Test: handles concurrent calls without lost updates
    //   - Verifies the UPDATE uses SQL-level jsonb array manipulation
    //   - Two parallel addRecentAsset calls should both be reflected

    // Test: does not add duplicate assetId
    //   - If assetId already in list, moves it to the end (MRU behavior)

    // Test: invalidates Redis cache after update
  });

  describe("setActiveAssets", () => {
    // Test: sets activeAssetIds, capped at 5 items
    //   - Passing 7 asset IDs stores only the first 5

    // Test: replaces existing active set entirely

    // Test: invalidates Redis cache after update
  });

  describe("setComparedAssets", () => {
    // Test: updates comparedAssetIds list

    // Test: invalidates Redis cache after update
  });

  describe("createNamedSet", () => {
    // Test: stores a named set in namedSets JSON
    //   - createNamedSet(convId, "favorites", [10, 20]) → namedSets = { favorites: [10, 20] }

    // Test: overwrites existing named set with same name
  });

  describe("resolveNamedSet", () => {
    // Test: retrieves correct asset IDs for a known set name

    // Test: returns empty array for unknown set name
  });

  describe("removeAssetFromState", () => {
    // Test: removes assetId from all lists (recent, active, compared)
    //   - Given state { recent: [1,2,3], active: [2,4], compared: [2,5] }
    //   - removeAssetFromState(convId, 2) → { recent: [1,3], active: [4], compared: [5] }

    // Test: removes assetId from all namedSets that contain it

    // Test: invalidates Redis cache after update
  });
});
```

---

## Implementation Details

### File: `apps/web/server/services/visualStateService.ts`

#### Imports and Setup

The service imports from:
- `drizzle-orm` for `eq` and `sql` (the raw SQL template tag)
- The shared Drizzle DB getter (follow the pattern used by `memoryService.ts` with `getDb()`)
- The `conversationVisualState` table from `drizzle/schema`
- Redis client from `./redis` (`getRedisClient`, `isRedisAvailable`)

#### Constants

- `MAX_RECENT_ASSETS = 12` -- FIFO cap for the recent list
- `MAX_ACTIVE_ASSETS = 5` -- cap for the active working set
- `REDIS_CACHE_PREFIX = "visual_state:"` -- key prefix
- `REDIS_CACHE_TTL = 30` -- seconds (30-second TTL as specified in the plan)

#### Type Definition

Export a `VisualState` interface:

```typescript
export interface VisualState {
  conversationId: number;
  recentAssetIds: number[];
  activeAssetIds: number[];
  comparedAssetIds: number[];
  namedSets: Record<string, number[]>;
  updatedAt: Date | null;
}
```

#### `getOrCreateState(conversationId: number): Promise<VisualState>`

1. Check Redis cache first: key `visual_state:{conversationId}`. If hit, deserialize and return.
2. Query `conversation_visual_state` by PK.
3. If no row, INSERT a default row with empty arrays/objects (use `onConflictDoNothing` to handle races).
4. Set Redis cache with 30-second TTL.
5. Return the `VisualState`.

#### `addRecentAsset(conversationId: number, assetId: number): Promise<void>`

This is the most important function for correctness. It must be **concurrency-safe** -- two simultaneous uploads in the same conversation must not lose updates.

**Approach**: Use a single PostgreSQL UPDATE with `jsonb` operations rather than read-modify-write. The SQL should:

1. Remove the assetId if already present (dedup / MRU behavior).
2. Append the assetId to the end of the array.
3. Trim from the front if length exceeds `MAX_RECENT_ASSETS`.

The Drizzle `sql` template tag enables this. The pattern looks like:

```typescript
await db
  .update(conversationVisualState)
  .set({
    recentAssetIds: sql`(
      SELECT jsonb_agg(elem)
      FROM (
        SELECT elem
        FROM jsonb_array_elements(
          COALESCE("recentAssetIds", '[]'::jsonb) - ${assetId}::text
        ) AS elem
        UNION ALL
        SELECT to_jsonb(${assetId}::int)
      ) sub
      -- keep only last MAX_RECENT items
      OFFSET GREATEST(0,
        (SELECT count(*) FROM jsonb_array_elements(
          COALESCE("recentAssetIds", '[]'::jsonb) - ${assetId}::text
        )) + 1 - ${MAX_RECENT_ASSETS}
      )
    )`,
    updatedAt: new Date(),
  })
  .where(eq(conversationVisualState.conversationId, conversationId));
```

If no row exists yet, call `getOrCreateState` first to ensure the row is created, then run the UPDATE.

After the UPDATE, invalidate the Redis cache key.

#### `setActiveAssets(conversationId: number, assetIds: number[]): Promise<void>`

1. Truncate `assetIds` to first `MAX_ACTIVE_ASSETS` entries.
2. UPDATE `conversation_visual_state` setting `activeAssetIds` to the truncated JSON array.
3. Invalidate Redis cache.

#### `setComparedAssets(conversationId: number, assetIds: number[]): Promise<void>`

Same pattern as `setActiveAssets` but writes to `comparedAssetIds`. No cap specified -- allow any length (the retrieval service limits what it actually uses).

#### `createNamedSet(conversationId: number, name: string, assetIds: number[]): Promise<void>`

1. Ensure the row exists (`getOrCreateState`).
2. Use `jsonb_set` in the UPDATE to set `namedSets->{name}` to the provided array:

```typescript
await db
  .update(conversationVisualState)
  .set({
    namedSets: sql`jsonb_set(
      COALESCE("namedSets", '{}'::jsonb),
      ${sql.raw(`'{${name}}'`)},
      ${JSON.stringify(assetIds)}::jsonb
    )`,
    updatedAt: new Date(),
  })
  .where(eq(conversationVisualState.conversationId, conversationId));
```

**Security note**: The `name` parameter must be sanitized -- alphanumeric plus underscore/dash only, max 64 chars. Reject or sanitize before interpolation into the jsonb path to prevent injection.

#### `resolveNamedSet(conversationId: number, name: string): Promise<number[]>`

1. Call `getOrCreateState(conversationId)`.
2. Look up `state.namedSets[name]`.
3. Return the array, or empty array if the key does not exist.

#### `removeAssetFromState(conversationId: number, assetId: number): Promise<void>`

Remove `assetId` from all three array columns and from every named set in a single UPDATE:

1. For `recentAssetIds`, `activeAssetIds`, `comparedAssetIds`: use the jsonb subtraction operator (`- assetId::text`).
2. For `namedSets`: iterate keys and remove the value from each array. This is more complex in raw SQL. A pragmatic approach is to read the current `namedSets`, filter in TypeScript, and write back. Since named set removal is infrequent, the read-modify-write race risk is acceptable here (unlike the high-frequency `addRecentAsset`).
3. Invalidate Redis cache.

This function is called by the deletion flow in section-10.

#### Redis Cache Helpers (private)

Two private helper functions:

- `cacheGet(conversationId)` -- reads from Redis, parses JSON, returns `VisualState | null`
- `cacheSet(conversationId, state)` -- serializes to JSON, sets with `EX` TTL of 30 seconds
- `cacheInvalidate(conversationId)` -- DEL the key

All Redis operations should be wrapped in try/catch that degrades gracefully (log warning, fall back to DB). Follow the pattern in `groupsService.ts` which checks `isRedisAvailable()` before attempting Redis operations.

---

## Key Design Decisions

1. **Atomic JSONB operations** for `addRecentAsset` prevent lost updates under concurrency. This is critical because multiple images can be uploaded simultaneously in a single message.

2. **Redis 30-second TTL cache** balances freshness (state changes within seconds of upload) against DB read volume (every message in the conversation checks visual state during context building).

3. **FIFO with max 12** for recent assets keeps the working set small enough for the LLM resolver prompt while covering a reasonable conversation history.

4. **Max 5 active assets** matches the image slot budget in the context packing layer (section-07).

5. **Named sets use read-modify-write** because they are low-frequency operations (explicit user action) and the complexity of pure-SQL nested jsonb array filtering across dynamic keys is not worth the concurrency benefit.

---

## Relevant Existing Code Patterns

- **Redis caching pattern**: See `/home/dev/projects/SmartSpecPro/apps/web/server/services/groupsService.ts` lines 154-173 for `getRedisOrNull()` helper and cache-aside pattern.
- **Drizzle `sql` tag usage**: See `/home/dev/projects/SmartSpecPro/apps/web/server/services/creditService.ts` for examples of `sql` template usage with Drizzle updates.
- **DB access pattern**: See `/home/dev/projects/SmartSpecPro/apps/web/server/services/memoryService.ts` line 670+ for how `getDb()` is used in service functions.
- **`contextToMessages()` at memoryService.ts:842**: The downstream consumer that will use visual state to determine budget allocation (section-07 concern, not this section).

---

## Checklist for Implementer

1. Write the test file with all stubs described above.
2. Create `visualStateService.ts` with the exported `VisualState` interface and all six public functions.
3. Implement `getOrCreateState` with Redis cache-aside and DB upsert.
4. Implement `addRecentAsset` with atomic JSONB SQL (most complex function -- test concurrency carefully).
5. Implement `setActiveAssets` and `setComparedAssets` (straightforward SET operations).
6. Implement `createNamedSet` with input sanitization and `jsonb_set`.
7. Implement `resolveNamedSet` as a read-through from `getOrCreateState`.
8. Implement `removeAssetFromState` with jsonb subtraction for arrays and read-modify-write for named sets.
9. Add private Redis cache helpers (`cacheGet`, `cacheSet`, `cacheInvalidate`).
10. Ensure all Redis calls are wrapped in try/catch with graceful degradation.
11. Run tests: `cd /home/dev/projects/SmartSpecPro/apps/web && pnpm test -- visualStateService`.