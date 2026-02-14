The dependency section-08 hasn't been written yet. That's fine -- I'll reference it appropriately. Now I have all the context needed to generate the section content.

# Section 10: Federated Search

## Overview

This section implements a unified search experience that queries three backends in parallel -- the local PostgreSQL database (keyword search), the vector store (semantic search), and the Google Drive API (real-time file search) -- then merges results using Reciprocal Rank Fusion (RRF). The frontend receives a single ranked result list with source badges and filter tabs.

**Depends on:** Section 08 (Virtual References & Indexing) -- virtual references in `library_links` with `link_type: "google_drive_file"` and `tenant_id` are used for canonical deduplication across local and Drive results.

**Parallelizable with:** Sections 11 (Sync Webhooks) and 12 (Dashboard UI).

---

## File Inventory

### New Files

| File | Purpose |
|------|---------|
| `/home/dev/projects/SmartSpecPro/apps/web/server/services/federatedSearch.ts` | Federated search service -- parallel execution, normalization, dedup, RRF merge |
| `/home/dev/projects/SmartSpecPro/apps/web/server/services/federatedSearch.test.ts` | Vitest unit tests for the federated search service |
| `/home/dev/projects/SmartSpecPro/apps/web/client/src/components/library/FederatedSearchUI.test.tsx` | Vitest component tests for federated search UI elements |

### Modified Files

| File | Changes |
|------|---------|
| `/home/dev/projects/SmartSpecPro/apps/web/server/routers/library.ts` | Add `federatedSearch` tRPC procedure |
| `/home/dev/projects/SmartSpecPro/apps/web/client/src/pages/DocumentManagement.tsx` | Add "Include Google Drive" checkbox, source badges, filter tabs |

---

## Tests (Write First)

### Vitest -- Federated Search Service

File: `/home/dev/projects/SmartSpecPro/apps/web/server/services/federatedSearch.test.ts`

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock dependencies before importing the service
vi.mock("../db");
vi.mock("./libraryService");

describe("federatedSearch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("parallel execution", () => {
    it("executes local DB, vector store, and Drive API searches in parallel", async () => {
      /**
       * Arrange: mock all three search backends to resolve.
       * Assert: all three were called, and total wall-clock time is ~max(individual times),
       * not sum. Use vi.advanceTimersByTime if needed.
       */
    });

    it("works without Google Drive (library-only mode)", async () => {
      /**
       * When includeGoogleDrive is false or user is not connected,
       * only local DB and vector store legs run.
       * Drive API is never called. Results still merge correctly.
       */
    });
  });

  describe("result normalization", () => {
    it("normalizes local DB results to common FederatedSearchResult format", async () => {
      /**
       * Local DB results (LibrarySearchResultV1) map to:
       * { id, title, source: "library", score, metadata, preview }
       */
    });

    it("normalizes vector store results to common FederatedSearchResult format", async () => {
      /**
       * Vector results include chunk content as preview,
       * source: "library" for local items, "google_drive" for drive-indexed items.
       */
    });

    it("normalizes Drive API results to common FederatedSearchResult format", async () => {
      /**
       * Drive API results map to:
       * { id: driveFileId, title: name, source: "google_drive", score, metadata: { mimeType, modifiedTime, ... }, preview: null }
       */
    });
  });

  describe("RRF merge", () => {
    it("returns merged results ranked by RRF with k=60", async () => {
      /**
       * Given ranked lists from each backend, verify RRF score computation:
       *   rrfScore = sum(1 / (k + rank_in_list)) for each list the item appears in
       * with k=60. Items appearing in multiple lists get higher scores.
       */
    });

    it("applies source filtering when filter is set to 'library'", async () => {
      /**
       * When sourceFilter is "library", only items with source === "library" appear.
       */
    });

    it("applies source filtering when filter is set to 'google_drive'", async () => {
      /**
       * When sourceFilter is "google_drive", only Drive items appear.
       */
    });
  });

  describe("deduplication", () => {
    it("deduplicates by canonical ID (driveFileId matching library_links)", async () => {
      /**
       * If a Drive file appears in both vector results (as an indexed virtual reference)
       * and Drive API results, they merge into one result.
       * The canonical ID is the driveFileId from library_links where link_type = "google_drive_file".
       * The merged result keeps the higher RRF score and shows source: "google_drive" with indexedStatus: true.
       */
    });

    it("deduplicates by content hash for cross-source matches", async () => {
      /**
       * If a local file and a Drive file have the same content hash in metadata,
       * they merge. The local item is preferred as the canonical result.
       */
    });
  });

  describe("source badges", () => {
    it("returns results with [Library] / [Google Drive] source badges", async () => {
      /**
       * Each result includes a `source` field: "library" or "google_drive".
       * Virtual references (indexed Drive files) include `indexedStatus: true`.
       */
    });
  });

  describe("latency and graceful degradation", () => {
    it("respects Drive API timeout (3s) and returns partial results", async () => {
      /**
       * Mock Drive API to take 5 seconds. After 3s timeout,
       * local DB + vector results are returned, with driveResultsStatus: "timeout".
       */
    });

    it("sets driveResultsStatus='timeout' when Drive API times out", async () => {
      /**
       * Verify the response includes { driveResultsStatus: "timeout" }.
       */
    });

    it("sets driveResultsStatus='disconnected' when Google not connected", async () => {
      /**
       * When user has no active Google OAuth connection, skip Drive leg entirely.
       * Response includes { driveResultsStatus: "disconnected" }.
       */
    });

    it("sets driveResultsStatus='error' when Drive API returns an error", async () => {
      /**
       * When Drive API call fails (non-timeout), local results are still returned.
       * Response includes { driveResultsStatus: "error" }.
       */
    });

    it("sets driveResultsStatus='unavailable' when driveReadonlyScopeApproved flag is false", async () => {
      /**
       * Feature-gated: when the admin flag driveReadonlyScopeApproved is false,
       * Drive search is skipped and status is "unavailable".
       */
    });
  });
});
```

### Vitest -- DocumentManagement UI

File: `/home/dev/projects/SmartSpecPro/apps/web/client/src/components/library/FederatedSearchUI.test.tsx`

```typescript
import { describe, it, expect } from "vitest";

describe("Federated Search UI", () => {
  it("search results show source badges ([Library] / [Google Drive])", () => {
    /**
     * Render a list of FederatedSearchResult items.
     * Assert that each item displays a Badge component with source text.
     */
  });

  it("filter tabs render and switch between All/Library/Google Drive", () => {
    /**
     * Render filter tabs. Click "Library" tab. Assert active state changes.
     * Verify callback fires with sourceFilter="library".
     */
  });

  it("'Include Google Drive' checkbox visible when user is connected", () => {
    /**
     * Mock Google connection status as connected.
     * Assert checkbox is rendered and is checked by default.
     */
  });

  it("'Include Google Drive' checkbox hidden when user is not connected", () => {
    /**
     * Mock Google connection status as not connected.
     * Assert checkbox is not rendered.
     */
  });

  it("Drive results show 'Open in Google' button instead of preview", () => {
    /**
     * For results with source="google_drive" and indexedStatus=false,
     * show an "Open in Google" button that opens the Drive file URL.
     */
  });

  it("shows 'Some Drive results may be missing' when driveResultsStatus is 'timeout'", () => {
    /**
     * When response includes driveResultsStatus: "timeout",
     * render a warning banner above results.
     */
  });
});
```

---

## Implementation Details

### 1. Federated Search Service

File: `/home/dev/projects/SmartSpecPro/apps/web/server/services/federatedSearch.ts`

This service is the core of section 10. It orchestrates three search backends and merges their results.

#### Types

```typescript
/** Source of a search result */
export type SearchResultSource = "library" | "google_drive";

/** Status of the Drive search leg */
export type DriveResultsStatus =
  | "ok"
  | "timeout"
  | "error"
  | "disconnected"
  | "unavailable";

/** Normalized search result from any backend */
export interface FederatedSearchResult {
  /** Canonical ID: library item ID (number as string) or Drive file ID */
  id: string;
  title: string;
  source: SearchResultSource;
  /** RRF-merged score (higher = more relevant) */
  score: number;
  metadata: Record<string, unknown>;
  /** Text preview snippet, null for unindexed Drive results */
  preview: string | null;
  /** Whether this Drive file has been indexed as a virtual reference */
  indexedStatus?: boolean;
  /** URL to open the file (Drive webViewLink for Drive results) */
  openUrl?: string;
}

/** Input to the federated search function */
export interface FederatedSearchInput {
  query: string;
  includeGoogleDrive: boolean;
  sourceFilter?: "all" | "library" | "google_drive";
  limit?: number;
  offset?: number;
}

/** Actor context for search (same shape as LibraryActor) */
export interface SearchActor {
  userId: number;
  tenantId: string;
  role?: string | null;
}

/** Response from federated search */
export interface FederatedSearchResponse {
  query: string;
  total: number;
  limit: number;
  offset: number;
  has_more: boolean;
  results: FederatedSearchResult[];
  driveResultsStatus: DriveResultsStatus;
}
```

#### Core Function: `federatedSearch`

```typescript
export async function federatedSearch(
  input: FederatedSearchInput,
  actor: SearchActor,
): Promise<FederatedSearchResponse> {
  /**
   * 1. Determine which backends to query:
   *    - Local DB keyword search: ALWAYS
   *    - Vector store semantic search: ALWAYS (if query is non-empty)
   *    - Google Drive API search: only if includeGoogleDrive=true AND user has active Google connection AND driveReadonlyScopeApproved flag is true
   *
   * 2. Execute enabled backends in parallel using Promise.allSettled with per-leg timeouts:
   *    - Local DB: 2s timeout
   *    - Vector store: 3s timeout
   *    - Drive API: 3s timeout
   *
   * 3. Collect results, normalize to FederatedSearchResult[]
   *
   * 4. Deduplicate:
   *    a. Build a map of driveFileId -> libraryItemId from library_links (link_type="google_drive_file", tenant_id=actor.tenantId)
   *    b. For each Drive API result, check if its file ID exists in the map. If so, merge with the library result (keep higher score, set indexedStatus=true)
   *    c. For remaining items, check content hashes for cross-source matches
   *
   * 5. Compute RRF scores:
   *    For each unique item, across each ranked list it appeared in:
   *      rrfScore += 1 / (k + rank)
   *    where k=60 and rank is 1-based position in the per-backend ranked list.
   *
   * 6. Apply source filter if set (filter out items not matching sourceFilter)
   *
   * 7. Sort by rrfScore descending, paginate, return
   */
}
```

#### Helper: `searchLocalDb`

```typescript
async function searchLocalDb(
  query: string,
  actor: SearchActor,
  timeoutMs: number,
): Promise<FederatedSearchResult[]> {
  /**
   * Wraps the existing searchLibraryItems() from libraryService.ts with a timeout.
   * Maps LibrarySearchResultV1 to FederatedSearchResult:
   *   - id: String(item_id)
   *   - title: title
   *   - source: "library"
   *   - score: combined_score
   *   - metadata: { item_type, status, source: source field, owner_user_id, provider_name, model_name }
   *   - preview: null (no snippet from keyword search)
   */
}
```

#### Helper: `searchVectorStore`

```typescript
async function searchVectorStore(
  query: string,
  actor: SearchActor,
  timeoutMs: number,
): Promise<FederatedSearchResult[]> {
  /**
   * Calls the Python backend's vector search endpoint (existing RAG query path).
   * POST to internal API: /api/internal/vector/search
   * Body: { query, tenant_id, limit: 20, filters: { tenant_id: actor.tenantId } }
   * Timeout: timeoutMs
   *
   * Maps results to FederatedSearchResult:
   *   - id: vector metadata's item_id or drive_file_id
   *   - title: from metadata
   *   - source: metadata.source === "google_drive" ? "google_drive" : "library"
   *   - score: similarity score from vector search
   *   - preview: chunk text content (first 200 chars)
   *   - metadata: all vector metadata
   */
}
```

#### Helper: `searchGoogleDrive`

```typescript
async function searchGoogleDrive(
  query: string,
  actor: SearchActor,
  timeoutMs: number,
): Promise<FederatedSearchResult[]> {
  /**
   * Calls the Python backend to search Drive on behalf of the user.
   * POST to internal API: /api/internal/gdrive/search
   * Body: { query, user_id: actor.userId, max_results: 20 }
   * Timeout: timeoutMs
   *
   * The Python endpoint:
   *   - Gets a valid access token via GoogleTokenService
   *   - Calls Drive API v3 files.list with q=`fullText contains '${query}'`
   *   - Returns file metadata: id, name, mimeType, webViewLink, modifiedTime, size
   *
   * Maps results to FederatedSearchResult:
   *   - id: driveFileId
   *   - title: name
   *   - source: "google_drive"
   *   - score: 0 (Drive API doesn't provide relevance scores; RRF uses rank only)
   *   - metadata: { mimeType, modifiedTime, size, webViewLink }
   *   - preview: null
   *   - openUrl: webViewLink
   */
}
```

#### Helper: `checkGoogleConnectionStatus`

```typescript
async function checkGoogleConnectionStatus(
  actor: SearchActor,
): Promise<"connected" | "disconnected" | "expired"> {
  /**
   * Queries the Python backend for the user's Google OAuth connection status.
   * GET /api/internal/oauth/status?user_id={actor.userId}&provider=google
   *
   * Returns the status string. Used to determine whether to include Drive search leg.
   */
}
```

#### Helper: `getDriveReadonlyScopeApproved`

```typescript
async function getDriveReadonlyScopeApproved(): Promise<boolean> {
  /**
   * Reads the system_settings table for the driveReadonlyScopeApproved flag.
   * Category: "oauth", key: "driveReadonlyScopeApproved".
   * Returns false if not set (conservative default).
   */
}
```

#### Helper: `getCanonicalDriveFileMap`

```typescript
async function getCanonicalDriveFileMap(
  tenantId: string,
): Promise<Map<string, number>> {
  /**
   * Queries library_links where link_type="google_drive_file" and tenant_id=tenantId.
   * Returns a Map of driveFileId -> libraryItemId for deduplication.
   *
   * Uses: SELECT link_id, library_item_id FROM library_links
   *       WHERE link_type = 'google_drive_file' AND tenant_id = $1
   */
}
```

#### Helper: `computeRRF`

```typescript
function computeRRF(
  rankedLists: FederatedSearchResult[][],
  k: number = 60,
): FederatedSearchResult[] {
  /**
   * Reciprocal Rank Fusion algorithm.
   *
   * For each unique item across all ranked lists:
   *   rrfScore = 0
   *   For each list where the item appears at position `rank` (1-based):
   *     rrfScore += 1 / (k + rank)
   *
   * Sort all items by rrfScore descending.
   * Return the merged list with updated score field.
   *
   * Deduplication key: item.id (canonical ID after dedup step).
   * When merging duplicate items, keep the version with the most metadata.
   */
}
```

#### Helper: `withTimeout`

```typescript
function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  label: string,
): Promise<{ result: T; status: "ok" } | { status: "timeout" | "error"; error?: Error }> {
  /**
   * Wraps a promise with a timeout. Returns a discriminated union
   * so the caller can distinguish ok/timeout/error without try-catch.
   */
}
```

### 2. tRPC Procedure

File: `/home/dev/projects/SmartSpecPro/apps/web/server/routers/library.ts`

Add a new `federatedSearch` procedure to the existing `libraryRouter`.

```typescript
// Add to the libraryRouter definition:

federatedSearch: protectedProcedure
  .input(
    z.object({
      query: z.string().min(1).max(1000),
      includeGoogleDrive: z.boolean().default(true),
      sourceFilter: z.enum(["all", "library", "google_drive"]).default("all"),
      limit: z.number().int().min(1).max(100).default(20),
      offset: z.number().int().min(0).default(0),
    }),
  )
  .query(async ({ input, ctx }) => {
    /**
     * 1. Resolve tenant ID using resolveLibraryTenantId(ctx)
     * 2. Assert library is enabled for tenant
     * 3. Build SearchActor from ctx.user and resolved tenantId
     * 4. Call federatedSearch(input, actor)
     * 5. Return the FederatedSearchResponse
     */
  }),
```

Import `federatedSearch` from `../services/federatedSearch` at the top of the file.

### 3. Python Backend Internal Endpoint for Drive Search

The federated search service calls a Python backend endpoint to search Google Drive on behalf of the user. This endpoint should be created if it does not already exist from Section 09 (MCP Server).

**Endpoint:** `POST /api/internal/gdrive/search`

The Python endpoint receives `{ query, user_id, max_results }`, obtains the user's valid access token via `GoogleTokenService`, calls the Drive API `files.list` with the search query, and returns normalized file metadata. This endpoint is an internal API (not user-facing) -- it is called server-to-server from Node.js.

If Section 09 has already created a `search_drive_files` MCP tool, the internal endpoint can delegate to that tool handler directly, avoiding duplication.

### 4. Frontend Changes

File: `/home/dev/projects/SmartSpecPro/apps/web/client/src/pages/DocumentManagement.tsx`

The following UI elements are added to the existing Document Management page.

#### "Include Google Drive" Checkbox

Add a checkbox next to the existing search input. The checkbox is:
- **Visible** only when the user has an active Google connection (query `googleDrive.getConnectionStatus`)
- **Checked by default** when visible
- Toggling it sets the `includeGoogleDrive` parameter on the `federatedSearch` query

#### Source Badges

Each search result item in the grid/list displays a small badge:
- `[Library]` -- blue badge for `source === "library"`
- `[Google Drive]` -- green badge for `source === "google_drive"`
- Virtual references (indexed Drive files) show both: `[Google Drive] [Indexed]`

Use the existing `Badge` component from `@/components/ui/badge` with appropriate variant styling.

#### Filter Tabs

Add a tab bar above the results area with three tabs:
- **All** -- shows all results (default)
- **Library** -- filters to `source === "library"` only
- **Google Drive** -- filters to `source === "google_drive"` only

Selecting a tab sets the `sourceFilter` parameter on the query. Use the existing tab or button group UI pattern.

#### Drive Result Actions

For results with `source === "google_drive"`:
- If `indexedStatus` is true: show normal preview behavior (content is indexed locally)
- If `indexedStatus` is false: show an "Open in Google" button that opens `result.openUrl` in a new tab. No local preview is available.

#### Status Banner

When `driveResultsStatus` is not `"ok"`:
- `"timeout"` -- yellow banner: "Some Google Drive results may be missing due to a timeout."
- `"error"` -- yellow banner: "Google Drive search encountered an error. Showing local results only."
- `"disconnected"` -- gray informational text: "Connect Google Drive in Settings to include Drive results."
- `"unavailable"` -- no banner (silently skip, feature not enabled)

#### Integration with Existing Search

The existing `listDocuments` query remains the primary data source for the document grid. The `federatedSearch` procedure is used **only when the search input has a non-empty query**. When the user clears the search box, the UI reverts to the standard `listDocuments` behavior.

Implementation approach:
- Add a new `useFederatedSearch` hook or a conditional `trpc.library.federatedSearch.useQuery(...)` call that fires when `debouncedQuery` is non-empty
- When federated search results are available, display them instead of (or merged with) the standard list
- Use the existing `DocumentQueryState` to track the `sourceFilter` tab selection

---

## RRF Algorithm Reference

Reciprocal Rank Fusion (RRF) is a rank-aggregation method that does not require score normalization across different systems. The formula for each document `d`:

```
RRF_score(d) = SUM over all ranked lists L where d appears:
                 1 / (k + rank_L(d))
```

Where `k` is a constant (60 is the standard default, chosen because it provides good balance between rewarding high-rank positions and allowing multiple-list appearances to boost score). `rank_L(d)` is the 1-based rank of document `d` in list `L`.

**Example:** A document ranked 1st in the local DB list and 3rd in the vector list:
- RRF = 1/(60+1) + 1/(60+3) = 0.01639 + 0.01587 = 0.03226

A document ranked 2nd in only the Drive list:
- RRF = 1/(60+2) = 0.01613

The first document ranks higher because it appeared in two lists.

---

## Per-Leg Timeout Strategy

| Backend | Timeout | Rationale |
|---------|---------|-----------|
| Local DB (keyword) | 2s | Local PostgreSQL, should be fast |
| Vector store (semantic) | 3s | May involve embedding generation + vector similarity |
| Google Drive API | 3s | External API, network latency varies |

Each leg uses the `withTimeout` wrapper. `Promise.allSettled` ensures that failures in one leg do not block others. Results from successful legs are always returned.

---

## Deduplication Strategy

Deduplication prevents the same logical document from appearing multiple times in results.

**Step 1 -- Canonical ID matching:**
Before RRF merge, load the `library_links` mapping for the tenant (driveFileId -> libraryItemId). When a Drive API result has a file ID that matches an existing `library_links` entry, merge it with the corresponding library result:
- Keep the library item as the primary result
- Set `indexedStatus: true`
- Set `openUrl` from the Drive result's webViewLink
- The item participates in RRF as a single entity across all lists it appeared in

**Step 2 -- Content hash matching:**
For remaining unmatched items, compare `metadata.contentHash` values. If a local library item and a Drive item share the same content hash, merge them (prefer the local item as canonical).

---

## Dependencies on Other Sections

- **Section 08 (Virtual References):** Provides `library_links` records with `link_type: "google_drive_file"` and `tenant_id`. Without these, canonical deduplication between Drive API results and locally-indexed Drive files cannot work. The federated search service queries these links at search time.
- **Section 03 (Database Schema):** The `library_links` table must have the `tenant_id` column and the updated unique index `(linkType, linkId, tenant_id)`.
- **Section 03 (OAuth):** The `checkGoogleConnectionStatus` helper depends on the `oauth_connections` table having `status` and `provider` columns.
- **Section 15 (Security):** The `driveReadonlyScopeApproved` feature flag gates the Drive search leg. If the flag does not exist yet, the service defaults to `false` (Drive search disabled).

---

## Error Handling

- **Drive API 401/403:** Treat as "disconnected" -- the token may have expired. Set `driveResultsStatus: "error"` and skip Drive results. Do not automatically attempt token refresh in the search path (that is handled by `GoogleTokenService` in the Python backend).
- **Drive API rate limit (429):** Treat as "error" with the same graceful degradation. Rate limiting is handled at the Google API call layer (Section 13).
- **Vector store unavailable:** If the vector search leg fails, proceed with local DB + Drive results only. Log the error for debugging.
- **Empty query:** Return empty results immediately. The federated search procedure requires a minimum 1-character query (enforced by Zod `.min(1)`).
- **All legs fail:** Return an empty result set with appropriate status flags. Never throw an error that would break the search UI.