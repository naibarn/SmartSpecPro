---
name: Video Editor Reference Images — Search & URL Storage
description: Complete analysis of library search, media URL storage, and why thumbnails don't display in Draft AI panel
type: reference
---

# Research Brief: Video Editor Reference Images Search & Display

## Findings

### 1. Library Search Capability — KEYWORD + VECTOR HYBRID
- **Search type**: Hybrid keyword + vector similarity scoring
- **Keyword matching**: Token overlap (exact word matches in title/description)
- **Vector matching**: Computed from library chunks with `vectorRefId` (embeddings indexed by Python backend)
- **Combined score**: 45% keyword + 55% vector (line 3030, libraryService.ts)
- **Search implementation**: `searchLibraryItems()` function returns results ranked by combined score
- **Current video editor usage**: `trpc.library.listDocuments()` with `query: "..."` parameter (VideoDraftAIPanel.tsx:129)
- **Limitation**: Uses `listDocuments` (simpler, permission-aware) instead of `searchLibraryItems` (full hybrid search)

### 2. Media URL Storage & Permanence

**Where media URLs are stored:**
- `libraryItems.sourceUrl` — Main media file URL (public or internal proxy)
- `libraryItems.thumbnailUrl` — Thumbnail/preview URL (optional, typically same as sourceUrl for images)
- `mediaCallbackEvents.resultUrl` — Temporary provider URL before download+store (line 1741, schema.ts)

**URL permanence:**
| Source | Permanence | Storage | Example |
|--------|-----------|---------|---------|
| Generated media (Kie.ai) | 7-14 days | Provider CDN | `https://cdn.kie.ai/task-123/result.jpg` |
| Library items (stored) | Permanent | S3/R2 internal | `/uploads/tenant-1/task-123/original.jpg` or CDN URL |
| Media callback events | Temporary | Provider | Expires when provider deletes |

**URL resolution flow** (mediaLibraryService.ts:102-175):
1. Task completes with provider `resultUrl` (temporary CDN)
2. `downloadAndStore()` fetches external URL
3. Stores in internal S3/R2 with key: `media-library/{tenantId}/{taskId}/original.{ext}`
4. Returns permanent proxy URL via `storagePut()`
5. Stored in `libraryItems.sourceUrl` and `libraryItems.thumbnailUrl` (for images)

### 3. Available Media Image Sources for Reference Picker

**Current implementation** (VideoDraftAIPanel.tsx:129-143):
- ✅ Only queries `library.listDocuments` with `itemType: "image"` scope `"all"`
- Filters by image type in schema filters (line 137)
- Returns library items with `source_url` and `thumbnail_url` fields

**Missing sources** NOT currently queried:
1. **Media generations history** — `mediaGenerations` table has completed image tasks not in library
2. **Uploaded files** — Direct file uploads without indexing
3. **Temporary drafts** — Draft media assets waiting to be added to library

### 4. Reference Image Picker Thumbnail Display Issue

**Root causes:**

| Issue | Location | Details |
|-------|----------|---------|
| **NULL thumbnail_url** | libraryItems schema | Images added without thumbnail extraction return null |
| **Relative paths** | mediaLibraryService.ts:187 | For images: `thumbnailUrl: task.mediaType === "image" ? resolvedSourceUrl : null` — sets to sourceUrl |
| **URL validation** | VideoDraftAIPanel.tsx:182-183 | Frontend filters out empty strings: `const url = String(item.source_url or "").trim(); if (!url) return acc;` |
| **Missing vector indexing** | Python backend | Chunks without `vectorRefId` don't contribute to search relevance |
| **Fallback to keyword-only** | libraryService.ts:3020-3057 | If no vector scores, results ranked by keyword match only |

**What gets returned to UI** (libraryService.ts:2309-2310):
```typescript
source_url: item.sourceUrl,        // Maps to source_url in response
thumbnail_url: item.thumbnailUrl,  // Maps to thumbnail_url in response
```

**Frontend display logic** (VideoDraftAIPanel.tsx:175-214):
1. Extracts `source_url` and `thumbnail_url` from API response
2. Uses `thumbnail_url` if present (line 186), falls back to `source_url`
3. If URL is empty, icon is `undefined` (no preview)
4. Image `onError` handler shows 📷 emoji placeholder on 404

**Why thumbnails are blank:**
- `source_url` IS populated (checked line 182 filter)
- `thumbnail_url` may be NULL if not set during library item creation
- Frontend tries to load thumbnail, gets 404, falls back to emoji
- Or thumbnail URL is invalid (broken link)

### 5. Response Structure for Reference Images

`library.listDocuments` returns (LibraryDocumentListItem):
```typescript
{
  id: number;
  item_type: string;              // "image", "video", "document"
  source: string;                 // "media_task", "upload", etc.
  title: string;                  // User-provided or auto-generated
  description: string | null;     // Normalized prompt for media tasks
  status: "draft" | "ready" | "indexing" | "archived" | "failed";
  visibility: "private" | "team" | "public";
  source_url: string | null;      // Main file URL ← USED FOR REFERENCE IMAGES
  thumbnail_url: string | null;   // Preview URL ← SHOULD BE USED FOR THUMBNAILS
  owner_user_id: number;
  parent_id: number | null;
  metadata: Record<string, unknown>;  // { prompt, model, provider, task_id, ... }
  access_source: "owner" | "direct" | "group";
  permission_level: "read" | "write" | "delete" | "owner";
  shared_out_count: number;
  has_shared_out: boolean;
  created_at: string;
  updated_at: string;
}
```

### 6. Vector Search Integration

**Available but NOT used by video editor:**
- `searchLibraryItems()` supports semantic search via vector embeddings
- Uses Python backend for vector store propagation (libraryService.ts:1872-1879)
- Requires `libraryChunks.vectorRefId` to be populated by indexer
- Combined score formula: `45% * keywordScore + 55% * vectorScore`

**When vectors are populated:**
1. Document uploaded/created
2. Python backend receives webhook: library item created event
3. Indexer chunks document and computes embeddings
4. Stores in vector DB with reference ID
5. Sets `libraryChunks.vectorRefId` in database

---

## Current Architecture

### API Flow for Reference Images
```
VideoDraftAIPanel.tsx
  ↓ trpc.library.listDocuments({ itemType: "image" })
  ↓ server/routers/library.ts → listDocuments procedure
  ↓ libraryService.listLibraryDocuments()
  ↓ Query libraryItems table WHERE itemType="image"
  ↓ Check permissions (libraryPermissions table)
  ↓ Return LibraryDocumentListItem[] with source_url, thumbnail_url
  ↓ Frontend renders searchable combobox with thumbnail previews
```

### Media Callback Event Processing
```
Provider (Kie.ai) completes task
  ↓ POST /webhook/media-callback { providerTaskId, status, resultUrl }
  ↓ Python backend stores in mediaCallbackEvents.resultUrl (temporary CDN)
  ↓ mediaLibraryService.addMediaTaskToLibrary() called
  ↓ downloadAndStore() fetches resultUrl
  ↓ storagePut() stores in internal S3/R2
  ↓ createLibraryItem() saves with permanent sourceUrl
  ↓ safeEnqueueLibraryIndexJob() schedules indexing + vector embedding
```

---

## Risks

### Risk 1: NULL Thumbnail URLs Block Previews
- **Impact**: Thumbnails don't display in picker; users see emoji placeholder
- **Cause**: `thumbnailUrl` not set if image was added to library before thumbnail extraction
- **Scope**: All images in library without explicit thumbnail_url

### Risk 2: Expired Provider URLs in Fallback
- **Impact**: If `downloadAndStore()` fails, provider CDN URL expires in 7-14 days
- **Cause**: Fallback: `storedUrl ?? task.resultUrl ?? null` (line 175, mediaLibraryService.ts)
- **Scope**: Media added to library with failed download attempt

### Risk 3: Vector Search Not Used by Video Editor
- **Impact**: Search results ranked by keyword only, missing semantic matches
- **Cause**: Uses `listDocuments` instead of `searchLibraryItems`
- **Scope**: Video editor reference image discovery less effective than presentation draft

### Risk 4: CORS/Cross-Origin Issues with External CDNs
- **Impact**: Thumbnail loads fail if provider CDN restricts cross-origin requests
- **Cause**: Browser requests to `https://cdn.kie.ai/...` blocked
- **Scope**: May affect some provider CDN URLs that don't set CORS headers

### Risk 5: No Filter for "Ready" Status
- **Impact**: Draft/indexing items show in picker before ready
- **Cause**: `listDocuments` returns all items regardless of status
- **Scope**: Users see incomplete or processing items

---

## Options

### Option A: Use searchLibraryItems for Semantic Search
**Approach**: Switch from `listDocuments` → `searchLibraryItems` for reference images
- ✅ Hybrid keyword + vector search improves discovery
- ✅ Same API contract (query parameter works)
- ✅ Existing implementation tested
- ⚠️ Requires all media items to be indexed with vectors
- ⚠️ Vector indexing can take 5-30s per item

**Implementation**:
```typescript
// Current (VideoDraftAIPanel.tsx:129)
const referenceLibraryQuery = trpc.library.listDocuments.useQuery({
  query: debouncedReferenceLibrarySearchQuery,
  filters: { itemType: "image" },
});

// Proposed
const referenceLibraryQuery = trpc.library.search.useQuery({
  query: debouncedReferenceLibrarySearchQuery,
  filters: { itemType: "image" },
});
```

### Option B: Fix Thumbnail URL Generation & Add Status Filter
**Approach**: Ensure ALL library images have valid thumbnails; filter by status
- ✅ Fixes blank thumbnail issue immediately
- ✅ Prevents unfinished items from appearing
- ✅ Works with existing `listDocuments` API
- ⚠️ Requires backfill migration for existing items

**Implementation**:
1. Drizzle migration to backfill NULL `thumbnailUrl` with `sourceUrl` for images
2. Add `status: "ready"` filter to listDocuments call
3. Enhance createLibraryItem to always set thumbnailUrl for images

**SQL backfill**:
```sql
UPDATE library_items
SET "thumbnailUrl" = "sourceUrl"
WHERE "itemType" = 'image' AND "thumbnailUrl" IS NULL AND "sourceUrl" IS NOT NULL;
```

### Option C: Create Media Generation History Endpoint
**Approach**: Add dedicated `media.getRecentGenerations()` endpoint for recent unindexed media
- ✅ Shows most recent generated images (not yet in library)
- ✅ Provides complementary source to library items
- ✅ Solves "generation not in library yet" discovery gap
- ⚠️ Requires new API endpoint
- ⚠️ Duplication with library items that were added

**Implementation**:
```typescript
// New endpoint in media.ts router
getRecentGenerations: protectedProcedure
  .input(z.object({
    limit: z.number().int().min(1).max(50).default(20),
    mediaType: z.enum(["image", "video"]).optional(),
  }))
  .query(async ({ input, ctx }) => {
    // Query mediaGenerations table WHERE userId=ctx.user.id AND status="completed"
    // Return recent generations with resultUrl as thumbnail
  })
```

---

## Recommendation

**Combination of Option B + A (phased approach):**

**Phase 1 (Immediate, 2 hours):**
- Implement Option B: Fix thumbnail URL generation and add status filter
- Backfill NULL `thumbnailUrl` for existing image library items
- Add `status: "ready"` filter to `listDocuments` call in VideoDraftAIPanel
- This unblocks the thumbnail display issue immediately

**Phase 2 (Optional enhancement, 4 hours):**
- Switch to `searchLibraryItems` instead of `listDocuments`
- Improve discovery with hybrid keyword + vector search
- Monitor vector indexing performance (ensure < 5s per item)

**Phase 2 Alternative (Simpler, 2 hours):**
- Implement Option C: Add `media.getRecentGenerations()` endpoint
- Show recent generations as separate section above library items
- No indexing dependencies; instant results

**Rationale:**
- Phase 1 solves the immediate thumbnail blank issue
- Phase 2 is optional; improves UX but not critical
- Phase 2 alternative if vector search has performance issues
- Keep existing `listDocuments` API; it's already permission-aware and tested

---

## Open Questions

1. **How many library images have NULL thumbnailUrl?**
   - Query: `SELECT COUNT(*) FROM library_items WHERE "itemType"='image' AND "thumbnailUrl" IS NULL;`
   - This determines backfill scope

2. **Are provider CDN URLs the issue?**
   - Check browser DevTools: do thumbnail img tags show 404 or timeout?
   - If 404: provider URL expired; internal storage didn't run
   - If timeout: CORS or network issue

3. **Do users expect vector search for reference images?**
   - Is keyword-only search sufficient?
   - Or would semantic matching (e.g., "red sunset") improve discovery?

4. **Should recent media generations appear in reference picker?**
   - Should users be able to use recently generated images immediately (before adding to library)?
   - Or enforce library indexing workflow for all reference images?

---

## Key Files

- **Frontend search UI**: `/home/dev/projects/SmartSpecPro/apps/web/client/src/components/videoeditor/VideoDraftAIPanel.tsx` (lines 129-214)
- **Library API**: `/home/dev/projects/SmartSpecPro/apps/web/server/routers/library.ts` (lines 179-213)
- **Library service**: `/home/dev/projects/SmartSpecPro/apps/web/server/services/libraryService.ts` (lines 2199-2399)
- **Media library service**: `/home/dev/projects/SmartSpecPro/apps/web/server/services/mediaLibraryService.ts` (lines 102-175, 177-196)
- **Schema**: `/home/dev/projects/SmartSpecPro/apps/web/drizzle/schema.ts` (libraryItems table, mediaCallbackEvents table)
- **Search implementation**: `/home/dev/projects/SmartSpecPro/apps/web/server/services/libraryService.ts` (lines 2939-3090, searchLibraryItems function)
