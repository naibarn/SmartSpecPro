# ImageSourcePicker Component Research

## Research Brief

### Findings

**1. Media Library APIs Available**

SmartSpecPro has TWO separate listing endpoints for images:

| Endpoint | Purpose | Used For | Input Type | Returns |
|----------|---------|----------|-----------|---------|
| `library.listDocuments` | List library items (documents, images, videos) | General library browsing, watermarks, reference images | `{ query?: string, scope?: 'all'\|'my_library'\|'shared_groups'\|'shared_with_me', sort?: 'updated_desc'\|'created_desc', limit?, offset?, filters?: { itemType?, ownerUserId?, status?, fromDate?, toDate?, recentDays? } }` | `{ results: [{ id, title, item_type, source_url, thumbnail_url, metadata, status, ... }], total }` |
| `media.listTasks` | List generated media tasks (images, videos, audio) | Generated media history | `{ mediaType?: 'image'\|'video'\|'audio', status?, limit?, offset?, daysAgo? }` | Task objects with URLs |

**2. Library Search Implementation (Already Used)**

The `AIDraftModal.tsx` component demonstrates a full working "From Library" pattern:

- **Procedure**: `trpc.library.listDocuments.useQuery()`
- **Scope options**: `"all"` (public + shared + own), `"my_library"` (own only), `"shared_groups"`, `"shared_with_me"`
- **Image filtering**: Via `filters: { itemType: "image" }` (other types: "video", "audio", "document")
- **Search debouncing**: 300ms debounce on search input
- **Results mapping**: Extract `source_url` from each library item for thumbnails/display
- **Status filtering**: `filters: { status: "ready" }` for completed/ready items
- **Time filtering**: `filters: { recentDays: 1|3|7|15|30|all }`

Key code location: `AIDraftModal.tsx` lines 417-446 (watermark query) and 432-446 (reference images query)

**3. How AIDraftModal's "From Library" Works**

Location: `AIDraftModal.tsx` lines 1497-1604

Pattern:
```
Collapsible trigger "From Library"
  └─ Search input (debounced to referenceLibrarySearchQuery)
     └─ Grid display (max-h-[200px] overflow-y-auto, 4-5 columns)
        └─ Image thumbnails from library.listDocuments results
           └─ onClick: handleAddReferenceFromLibrary(url)
              └─ Validates against MAX_MEDIA_REFERENCES (5 images)
              └─ Checks for duplicates
              └─ Shows "already added" visual state (checkmark overlay)
```

**Data flow**:
1. User types in search input → `setReferenceLibrarySearchQuery()`
2. Debounce triggers → `setDebouncedReferenceLibrarySearchQuery()`
3. Query runs: `trpc.library.listDocuments.useQuery({ query: debouncedReferenceLibrarySearchQuery, filters: { itemType: "image" } })`
4. Results returned as `{ results: Array<{ source_url?, title? }> }`
5. Map results to image grid with click handlers
6. On click, extract URL → add to `referenceImages` state array

**4. Media Task History (Alternative: Recent Generations)**

For recently generated media:
- **Procedure**: `trpc.media.listTasks`
- **Input**: `{ mediaType: 'image', limit: 50, offset: 0, daysAgo: 30 }`
- **Returns**: Task objects with `resultUrl` or `outputUrl` properties
- **Video Editor uses this**: `MediaLibraryPanel.tsx` calls `trpc.library.listDocuments` with scope 'library' or 'shared_group'

**5. Shared Library Model**

- **Share scope in library.listDocuments**: `scope: "shared_groups"` fetches items shared to groups the user belongs to
- **Group relationship**: Defined in DB but not exposed directly in library API
- **Permission model**: User's effective permission determined by `getUserEffectivePermission()` in backend
- **Shares table**: `libraryShares` stores user/group/role permissions per library item

---

### Current Architecture

**File Map**:
- **tRPC routers** (backend):
  - `apps/web/server/routers/library.ts` — `listDocuments`, `search`, `createItem`, `uploadFile`, `shareItem`, `getFolderPath`
  - `apps/web/server/routers/media.ts` — `listTasks`, `generateImage`, `generateVideo`, `generateAudio`
  - `apps/web/server/routers/groups.ts` — `list`, `create`, `getMembers`, `invite`, `remove`

- **Frontend components** (reference implementations):
  - `apps/web/client/src/components/presentation/AIDraftModal.tsx` — lines 1497-1604 (From Library reference images), lines 417-446 (watermark library)
  - `apps/web/client/src/components/videoeditor/MediaLibraryPanel.tsx` — lines 42-150 (media library with library/shared_group tabs)
  - `apps/web/client/src/components/library/LibraryFilePicker.tsx` — generic file picker for library
  - `apps/web/client/src/components/library/DocumentGridList.tsx` — grid display of library items

- **Database schema** (`apps/web/drizzle/schema.ts`):
  - `libraryItems` — item_type, source_url, thumbnail_url, status, visibility
  - `libraryShares` — itemId, subjectType ('user'|'tenant_role'|'group'), subjectId, permissionLevel
  - `libraryContent` — actual file content (for documents)
  - `libraryFolders` — folder hierarchy with parentId

- **Services** (`apps/web/server/services/`):
  - `libraryService.ts` — core library operations (listLibraryDocuments, searchLibraryItems, etc.)
  - `federatedSearch.ts` — searches library + Google Drive + vector store
  - `mediaGenerationService.ts` — media task management

**Data flow for library browsing**:
```
React component
  ↓
trpc.library.listDocuments.useQuery({
  query, scope, filters, sort, limit, offset
})
  ↓
libraryRouter.listDocuments (protectedProcedure)
  ↓
libraryService.listLibraryDocuments()
  ↓
getDb().select().from(libraryItems)
  ├─ Filter by tenantId, ownership, shares
  ├─ Filter by itemType, status
  ├─ Full-text search on title/description
  └─ Paginate results
  ↓
Return: { results: LibraryItemWithPermissions[], total: number }
  ↓
Frontend maps results to UI (thumbnails, grid, list)
```

---

### Risks

**1. Scope Behavior is Unintuitive**
- `scope: "all"` does NOT mean "all items in the system" — it means "all items visible to user" (own + shared + public)
- `scope: "my_library"` is NOT the same as `scope: "all"` filtered to `ownerUserId: currentUserId`
- Public items might be included or excluded depending on tenant settings
- **Mitigation**: Document scope behavior in component; consider adding a `public_library` scope option if needed

**2. Image URLs Must Be Resolvable**
- `source_url` can be:
  - Absolute HTTP URL (generated media on external service)
  - Relative path like `/uploads/...` (uploaded files, needs base URL resolution)
  - Cloud storage URL (S3/R2)
- **Risk**: CORS issues for external domains, relative paths break if served from different origin
- **Mitigation**: Use `normalizeMediaSrc()` pattern from existing code; add CORS proxy option

**3. No Direct "Recently Generated Images" Endpoint**
- `media.listTasks` returns generation tasks, not a library query
- Tasks use different schema than library items
- Must convert/map between TaskSchema and LibraryItem schema
- **Mitigation**: Create separate tab for "Generated" vs "Uploaded"

**4. Permission Model Complexity**
- User might have different effective permissions (read/write/delete) per item
- Shared library browsing requires JOIN on libraryShares
- Large result sets (100+ items) could have N+1 permission lookup problem
- **Mitigation**: Use `listDocuments` which includes permission checking; don't reimplement

**5. Search Performance at Scale**
- Full-text search on libraryItems.title/description could be slow
- No mention of indexed columns or search optimization
- **Mitigation**: Implement pagination (required), consider rate-limiting on search, add debounce client-side

---

### Options

**Option A: Reuse AIDraftModal "From Library" Pattern (RECOMMENDED)**

- **What**: Extract the reference image picker from AIDraftModal into a standalone `LibraryImagePicker` component
- **How**:
  1. Create `ImageSourcePicker.tsx` (or repurpose existing pattern)
  2. Copy search + grid rendering logic from AIDraftModal lines 1541-1604
  3. Accept props: `onSelect(url)`, `scope?`, `maxItems?`, `allowedStatuses?`
  4. Return: Image URL string (user clicks image to add)
- **Pros**:
  - Proven working pattern already in codebase
  - Uses exact same tRPC query and scoping logic
  - Can handle multiple sources: personal library + shared + generated
  - Minimal code duplication if extracted to shared component
- **Cons**:
  - Requires extracting/refactoring from AIDraftModal
  - Doesn't include generated media history (separate `media.listTasks` call needed)
- **Effort**: 2-3 hours
- **Files to modify**: Create new file + potentially update AIDraftModal to import from it

**Option B: Build Custom ImageSourcePicker with Multi-Source Tabs**

- **What**: New standalone component with tabs for: My Images | Shared | Generated | URL Input
- **How**:
  1. Create `ImageSourcePicker.tsx` with tabs
  2. Tab 1: `library.listDocuments` with scope="my_library"
  3. Tab 2: `library.listDocuments` with scope="shared_groups"
  4. Tab 3: `media.listTasks` with mediaType="image"
  5. Tab 4: Manual URL input field
  6. Grid display for each source
- **Pros**:
  - Clear visual separation of sources
  - Supports all image sources in one component
  - Highly discoverable for users
  - Flexible: caller can disable tabs as needed
- **Cons**:
  - More complex state management (multiple queries, debounce per tab)
  - Larger component file
  - More API calls (even with `enabled: false` on hidden tabs)
- **Effort**: 4-5 hours
- **Files to modify**: Create new ImageSourcePicker.tsx, integrate into consumer component

**Option C: Minimal Direct Integration (Query Only)**

- **What**: Don't build a component; just document the API for consumers to implement their own UI
- **How**:
  1. Add JSDoc to `library.listDocuments` with example usage
  2. Export helper function from lib/hooks: `useLibraryImages(scope?, filter?)`
  3. Example implementation in docs
- **Pros**:
  - No new component to maintain
  - Caller has full control over UI
  - Works if different consumers need different UX
- **Cons**:
  - Every consumer reimplements the picker UI
  - No consistent UX across app
  - Higher risk of bugs in multiple implementations
- **Effort**: 1 hour (just docs)
- **Files to modify**: Just docs + new hook file

---

### Recommendation

**Option A: Extract Reusable ImageSourcePicker Component**

**Rationale**:
1. AIDraftModal already has a working, tested "From Library" pattern — don't reinvent it
2. Component is relatively simple (search input + grid + lazy-load images) — easy to extract
3. Can start with just library images; later extend with media.listTasks if needed
4. Avoids code duplication if other features need image picker
5. Allows gradual refactoring: start with copy-paste, then move to shared component

**Implementation Plan**:
1. Create `apps/web/client/src/components/shared/ImageSourcePicker.tsx`
   - Props: `{ onSelect(url: string), onRemove?(url: string), maxItems?: number, scope?: 'all'|'my_library'|'shared_groups', initialQuery?: string }`
   - State: `searchQuery`, `debouncedQuery`, `selectedItems`
   - Render: Search input + Grid + Status indicators
2. Extract from AIDraftModal (lines 1541-1604) into ImageSourcePicker
3. Update AIDraftModal to import and use the new component
4. Document the component with JSDoc + usage example
5. (Future) Add `media.listTasks` tab if needed for generated images

**Key Implementation Details**:
- Use `trpc.library.listDocuments.useQuery()` with dynamic scope
- Debounce search 300ms
- Handle image load errors gracefully (show placeholder)
- Prevent duplicate selections
- Lazy-load images with `loading="lazy"`
- Show loading + empty states
- Limit grid to 4-5 columns, max-h-200px with overflow-y-auto

---

### Open Questions

1. **Should ImageSourcePicker include generated/task media?**
   - Currently only handles `library.listDocuments` (uploaded/organized)
   - Should we add another tab for recent generations from `media.listTasks`?
   - If yes, need to handle URL format differences (task output URLs vs. library source_urls)

2. **Permission display: show locked items?**
   - Should users see images they don't have permission to view?
   - Current library.listDocuments only returns items user can read
   - No change needed if using existing API

3. **Scope default: what's most intuitive?**
   - `scope: "all"` shows everything user can see (might be overwhelming)
   - `scope: "my_library"` shows only own images (limited discovery of shared content)
   - Recommendation: Default to "all", but allow caller to override

4. **How to handle relative URLs (/uploads/...)?**
   - Library items can have relative paths
   - Need to resolve against app base URL
   - Should component handle this, or should caller provide a URL resolver?
   - Existing pattern: `normalizeMediaSrc()` in mediaModelInputs.ts

5. **Should component support keyboard shortcuts?**
   - Enter to select first result?
   - Escape to close?
   - Arrow keys to navigate grid?
   - Keep it simple for MVP: just click-based selection

**Key Files for Reference**:
- `apps/web/server/routers/library.ts` — `listDocuments` signature (lines 179-213)
- `apps/web/client/src/components/presentation/AIDraftModal.tsx` — working example (lines 417-446, 1497-1604)
- `apps/web/client/src/components/videoeditor/MediaLibraryPanel.tsx` — alternative pattern with tabs
- `apps/web/server/services/libraryService.ts` — backend logic for listLibraryDocuments
