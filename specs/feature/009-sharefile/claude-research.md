# Research Findings: Custom Groups & Permission-based File Sharing

**Research Date:** 2026-02-12
**Feature:** SSP-SHAREFILE-009
**Research Areas:** Codebase Analysis, Vector DB Permissions, React UI Patterns, tRPC Authorization, Soft Delete Patterns

---

## Table of Contents

1. [Codebase Analysis](#codebase-analysis)
2. [Permission-Based Vector DB Search](#permission-based-vector-db-search)
3. [React Permission UI Patterns](#react-permission-ui-patterns)
4. [tRPC Granular Permissions](#trpc-granular-permissions)
5. [PostgreSQL Soft Delete Patterns](#postgresql-soft-delete-patterns)
6. [Key Takeaways & Recommendations](#key-takeaways--recommendations)

---

## Codebase Analysis

### 1. EXISTING LIBRARY SYSTEM

#### Permission Checking Logic
**Location:** `apps/web/server/services/libraryService.ts` (lines 501-635)

**Core Permission Functions:**

```typescript
// Determines which permission level applies to an item for a user
function getPermissionLevelForItem(
  permissions: LibraryPermissionRow[],
  itemId: number,
  actor: LibraryActor,
): {
  effectivePermissionLevel: LibraryPermissionLevel | null;
  hasDirectShare: boolean;
  hasGroupShare: boolean;
}

// Checks if user can READ an item (includes visibility + permissions)
export function canReadLibraryItem(
  item: Pick<LibraryItemRow, "tenantId" | "ownerUserId" | "visibility">,
  actor: LibraryActor,
  permissionLevel: LibraryPermissionLevel | null,
): boolean {
  // Logic: tenant match + (admin || owner || public || team || explicit permission)
}

// Checks if user can WRITE/DELETE an item
export function canManageLibraryItem(
  item: Pick<LibraryItemRow, "tenantId" | "ownerUserId">,
  actor: LibraryActor,
  permissionLevel: LibraryPermissionLevel | null,
): boolean {
  // Logic: tenant match + (admin || owner || write/owner permission)
}
```

**Current Permission Levels:**
- `"read"` — View only
- `"write"` — Modify content
- `"owner"` — Full control + can grant permissions

**Gap for New Feature:** Need to add `"delete"` permission level between `"write"` and `"owner"`.

#### Existing shareLibraryItem Function
**Location:** `apps/web/server/services/libraryService.ts` (lines 939-982)

```typescript
export async function shareLibraryItem(
  input: ShareLibraryItemInput,
  actor: LibraryActor,
  dbClient?: DbClient,
): Promise<boolean> {
  // 1. Validates owner can manage item
  // 2. Inserts/updates libraryPermissions row
  // 3. Uses upsert pattern (onConflictDoUpdate) for idempotency
  // 4. Supports expiration dates
  // 5. Supports both direct user shares and tenant role shares
}
```

**Current Input Structure:**
```typescript
interface ShareLibraryItemInput {
  itemId: number;
  subjectType: "user" | "tenant_role";  // Who to share with
  subjectId: string;                     // User ID or role name
  permissionLevel: LibraryPermissionLevel;
  expiresAt?: Date | null;
}
```

**Gap for New Feature:** Need to add `subjectType = "group"` support.

#### Document Scopes
**Location:** `apps/web/server/services/libraryService.ts` (lines 176-222)

```typescript
export type LibraryDocumentScope = "all" | "my_library" | "shared_with_me" | "shared_groups";
export type LibraryDocumentAccessSource = "owner" | "shared_direct" | "shared_group";

// Scope filtering logic in listLibraryDocuments():
// - "my_library": accessSource === "owner" (user is ownerUserId)
// - "shared_with_me": accessSource === "shared_direct" (direct permission match)
// - "shared_groups": accessSource === "shared_group" (role-based OR visibility=team/public)
// - "all": includes all above
```

**Current Implementation:** `"shared_groups"` scope exists but only works with role-based permissions and visibility settings. Need to extend to support custom user groups.

#### Tenant Isolation Patterns
**Key Pattern:** Tenant ID normalization and consistent WHERE clauses

```typescript
// All queries filter by: eq(libraryItems.tenantId, normalizedTenantId)
// Permission checks: eq(libraryPermissions.tenantId, normalizedTenantId)
// Prevents cross-tenant access even with explicit permission records
```

**Normalization:**
```typescript
function normalizeLibraryTenantId(tenantId: LibraryTenantId): string {
  const normalized = String(tenantId).trim();
  if (!normalized) throw new Error("Invalid tenant ID");
  return normalized;
}
// Handles both numeric and string tenant IDs
```

**✅ Recommendation:** Replicate this pattern for all new group operations.

---

### 2. DATABASE SCHEMA

#### libraryItems Table
**Location:** `apps/web/drizzle/schema.ts` (lines 1428-1449)

**Key Columns:**
- `id` — Primary key
- `tenant_id` — Tenant isolation
- `owner_user_id` — Item owner
- `item_type` — "md", "image", "video", "document", "text", etc.
- `visibility` — "private", "team", "public"
- `deleted_at` — Soft delete marker (NULL = not deleted)
- `status` — "draft", "ready", "indexing", "archived", "failed"

**Gap for New Feature:** Need to add `deletedBy` column to track who deleted an item.

#### libraryPermissions Table
**Location:** `apps/web/drizzle/schema.ts` (lines 1490-1504)

**Current Structure:**
```sql
CREATE TABLE library_permissions (
  id SERIAL PRIMARY KEY,
  tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  library_item_id INTEGER NOT NULL REFERENCES library_items(id) ON DELETE CASCADE,
  subject_type VARCHAR(32) NOT NULL,      -- "user" or "tenant_role"
  subject_id VARCHAR(64) NOT NULL,        -- user ID (numeric string) or role name
  permission_level VARCHAR(32) NOT NULL DEFAULT 'read',  -- read, write, owner
  granted_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  expires_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Unique constraint ensures one permission entry per subject/item
UNIQUE INDEX: (library_item_id, subject_type, subject_id)
```

**Gap for New Feature:** Need to add support for `subjectType = "group"` and `permissionLevel = "delete"`.

#### libraryChunks Table (Vector/RAG Integration)
**Location:** `apps/web/drizzle/schema.ts` (lines 1470-1485)

**Purpose:** Stores document chunks for vector search and RAG.

**Key Columns:**
- `library_item_id` — Link to parent item
- `content` — Chunked text content
- `vector_ref_id` — External vector DB reference ID
- `metadata` — JSONB for additional context

**Soft Delete Handling:** Chunks remain in DB even when parent item is soft-deleted. Need to decide whether to exclude from vector search or keep for potential restore.

---

### 3. FRONTEND COMPONENTS

#### DocumentManagement.tsx
**Location:** `apps/web/client/src/pages/DocumentManagement.tsx`

**Current State Management:**
```typescript
const [queryState, setQueryState] = useState<DocumentQueryState>({
  scope: "my_library" | "shared_with_me" | "shared_groups",
  sort: "updated_desc" | "created_desc",
  viewMode: "editor" | "library",
  query: string,
  itemType?: string,
  status?: string,
  docId?: number,
});
```

**Current Features:**
- Three-panel layout (library sidebar, editor, preview)
- Upload support (images, videos, files)
- Markdown editing with auto-save
- URL state persistence

**Gap for New Feature:** Need to add:
- Share button in DocumentPreviewPanel
- Trash tab alongside existing tabs
- Permission badges in document list

#### DocumentLibraryTabs.tsx
**Location:** `apps/web/client/src/components/library/DocumentLibraryTabs.tsx`

**Current Tabs:**
- "My Library" — Owner documents
- "Shared With Me" — Direct shares
- "My Group" — Role-based + team visibility

**Gap for New Feature:** Need to add "Trash" tab for soft-deleted items.

#### DocumentPreviewPanel.tsx
**Location:** `apps/web/client/src/components/library/DocumentPreviewPanel.tsx`

**Current Features:**
- Title editing (inline rename)
- Download button
- Preview for multiple file types

**Gap for New Feature:** Need to add share button in header.

---

### 4. VECTOR DATABASE INTEGRATION

#### Current Setup
- **Providers:** ChromaDB (default), PGVector (PostgreSQL extension)
- **Configuration:** Stored in `system_settings` table with category `"vectordb"`
- **Integration Location:** Python backend (FastAPI)

#### Chunk Storage
- **Table:** `libraryChunks` stores document chunks
- **Vector reference:** `vectorRefId` column links to external vector DB entry

#### Search Implementation
**Location:** `apps/web/server/services/libraryService.ts` (lines 1378-1564)

**Current Approach:**
1. Fetches all items accessible to user (with permission checks)
2. Loads chunks for items
3. Computes keyword score: token overlap in title/description/metadata
4. Computes vector score: token overlap in chunk content
5. Combined score: 45% keyword + 55% vector
6. Sorts by combined score
7. Returns paginated results

**Gap for New Feature:** Vector search currently happens AFTER permission filtering (fetches accessible items first). This is correct but need to extend permission logic to include custom groups.

---

### 5. TESTING SETUP

#### Testing Framework
- **Framework:** Vitest
- **Test Files:**
  - `apps/web/server/routers/library.test.ts` — tRPC router integration tests
  - `apps/web/server/services/libraryService.test.ts` — Service layer unit tests

#### Test Patterns
**Service Unit Tests:**
```typescript
describe("ACL helpers", () => {
  it("rejects unauthorized read for private item", () => {
    const allowed = canReadLibraryItem(
      { tenantId: 10, ownerUserId: 1, visibility: "private" },
      { userId: 999, tenantId: 10, role: "user" },
      null, // no explicit permission
    );
    expect(allowed).toBe(false);
  });
});
```

**Router Integration Tests:**
```typescript
describe("libraryRouter.createItem", () => {
  it("passes resolved actor context to service", async () => {
    const fn = libraryRouter.createItem as Function;
    await fn({
      ctx: { user: { id: 9, currentTenantId: 44 }, tenantId: null },
      input: { itemType: "image", source: "media_history", title: "Demo" },
    });
    expect(mockCreateLibraryItem).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ userId: 9, tenantId: 44 }),
    );
  });
});
```

**✅ Recommendation:** Follow existing test patterns for new group and sharing functionality.

---

### 6. tRPC PATTERNS

#### Router Structure
**Location:** `apps/web/server/routers/library.ts`

**Key Endpoints:**
- `search` — Search with permissions
- `listDocuments` — List by scope
- `uploadFile` — Upload new file
- `createItem` — Create library item
- `updateItem` — Update metadata
- `deleteItem` — Soft delete
- `shareItem` — Share with user/role
- `getItem` — Get single item

**Gap for New Feature:** Need to add:
- Group management router (`groupsRouter`)
- Extended sharing endpoints (for groups)
- Trash management endpoints

#### Input Validation Schemas
```typescript
const visibilitySchema = z.enum(["private", "team", "public"]);
const permissionLevelSchema = z.enum(["read", "write", "owner"]);
const subjectTypeSchema = z.enum(["user", "tenant_role"]);
```

**Gap for New Feature:** Need to extend:
- `permissionLevelSchema` to include `"delete"`
- `subjectTypeSchema` to include `"group"`

#### Error Handling
```typescript
function toClientLibraryMutationError(error: unknown): TRPCError | null {
  if (error instanceof LibraryUrlValidationError) {
    return new TRPCError({
      code: "BAD_REQUEST",
      message: error.clientMessage,
    });
  }
  return null;
}
```

**✅ Recommendation:** Create similar custom error classes for group operations (e.g., `GroupNotFoundError`, `GroupMemberLimitError`).

---

### 7. KEY ARCHITECTURAL OBSERVATIONS

#### Permission Model
- **Hierarchical:** Admin > Domain Admin > User with explicit permissions > Role-based (team) > Public
- **Scope-based:** Items automatically appear in "shared_with_me" if user has explicit permission
- **Group-based:** Items visible through "My Group" if visibility is `"team"` or `"public"` OR user has role-based permission
- **Expiration support:** Permissions can expire (`expiresAt` column)

**Gap for New Feature:** Need to add custom group membership resolution to permission hierarchy.

#### Soft Delete Strategy
- Prevents accidental data loss
- Maintains referential integrity (no cascade delete)
- All queries filter out deleted items with `isNull(libraryItems.deletedAt)`
- No automatic cleanup (would need retention policy)

**Gap for New Feature:** Need to implement 90-day trash retention with auto-purge cron job.

#### Multi-tenant Safety
- **Tenant ID normalization:** String conversion + validation
- **Query filtering:** Every query includes tenant_id WHERE clause
- **Foreign key cascades:** Tenant deletion cascades to all related data
- **No cross-tenant queries:** Even with explicit permissions, tenant_id must match

**✅ Recommendation:** Apply same pattern to all group operations.

---

## Permission-Based Vector DB Search

### Best Practices from Research

**Filter-First Architecture** (CRITICAL)
- Apply permission filters BEFORE vector similarity search, not after
- Filtering after search causes two critical problems:
  1. Best matches may be removed, leaving worse results
  2. Security risk if unfiltered results are logged or cached

**Current Implementation in SmartSpecPro:**
✅ Already implements filter-first: `searchLibraryItems()` fetches accessible items first, then scores them.

**pgvector + Row Level Security Pattern**
- pgvector allows vectors to live in PostgreSQL alongside metadata
- Apply permissions in the same SQL query and let Postgres enforce them

**Example from Research:**
```sql
CREATE POLICY "Users can query their own document sections"
ON document_sections FOR SELECT TO authenticated USING (
  document_id IN (
    SELECT id FROM documents
    WHERE owner_id = auth.uid()
  )
);
```

**Recommendation for SmartSpecPro:**
Consider using PostgreSQL RLS policies if switching to pgvector (currently uses ChromaDB). This would provide automatic permission enforcement at the database level.

### Performance Considerations

**Measured Overhead (from research sources):**
- Simple role matching: ~3x latency overhead
- Time-based access windows: ~8x latency overhead
- Combined permission checks: ~5x latency overhead

**Optimization Strategies:**
- Use HNSW index with partitioning for role-based access (6x faster than post-filtering)
- Narrow candidate set with metadata filters (org, status) before vector similarity
- Consider denormalizing permission metadata into vector records for faster filtering

**Indexing for Permissions:**
Create partial indexes on permission fields for active records:
```sql
CREATE INDEX idx_library_permissions_active
ON library_permissions(library_item_id, subject_type, subject_id)
WHERE expires_at IS NULL OR expires_at > NOW();
```

### Common Pitfalls to Avoid

- ❌ **Post-filtering:** Never run full vector search then filter results
- ❌ **Inconsistent metadata types:** Standardize permission field formats
- ❌ **Missing indexes:** Always index permission filter columns
- ❌ **No capacity planning:** Permission filtering adds 3-8x overhead—plan infrastructure accordingly

---

## React Permission UI Patterns

### Best Practices from Research

**Dual-Layer Enforcement**
- **Backend enforcement (primary security):** API must reject unauthorized requests
- **Frontend toggling (UX enhancement):** Display only accessible UI elements
- Backend serves as ultimate gatekeeper

**Permission-Based Rendering (Not Role-Based)**
```typescript
// ❌ BAD: Role-based check
{user.role === "admin" && <DeleteButton />}

// ✅ GOOD: Permission-based check
{permissions["delete:projects"] && <DeleteButton />}
```

**Custom Hook Architecture**
```typescript
const usePermissions = (userId: string) => {
  const { data: permissions, isLoading, error } = useQuery({
    queryKey: ['permissions', userId],
    queryFn: () => fetchPermissions(userId),
  });

  return { permissions, isLoading, error };
};

// Usage in components
const { permissions } = usePermissions(user.id);

{permissions?.["create:projects"] && (
  <button className="new-project-btn">New Project</button>
)}
```

**Recommendation for SmartSpecPro:**
Create `useLibraryPermissions(itemId)` hook that fetches user's permission level for a specific library item.

### Radix UI Integration Patterns

**Component-Level Permission Gates**
```typescript
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';

<DropdownMenu.Root>
  <DropdownMenu.Trigger>Actions</DropdownMenu.Trigger>
  <DropdownMenu.Content>
    {permissions["read"] && (
      <DropdownMenu.Item>View</DropdownMenu.Item>
    )}
    {permissions["write"] && (
      <DropdownMenu.Item>Edit</DropdownMenu.Item>
    )}
    {permissions["delete"] && (
      <DropdownMenu.Item className="danger">Move to Trash</DropdownMenu.Item>
    )}
  </DropdownMenu.Content>
</DropdownMenu.Root>
```

**Recommendation for SmartSpecPro:**
Add permission-gated dropdown in DocumentPreviewPanel with View/Edit/Share/Delete actions based on user's permission level.

### Permission Badge/Indicator Patterns

**Accessible Badge Component**
```typescript
const PermissionBadge = ({
  level,
  label
}: {
  level: 'read' | 'write' | 'delete' | 'owner',
  label?: string
}) => {
  const badgeConfig = {
    read: { color: 'blue', icon: '👁️', label: 'Read Only' },
    write: { color: 'green', icon: '✏️', label: 'Can Edit' },
    delete: { color: 'orange', icon: '🗑️', label: 'Can Delete' },
    owner: { color: 'purple', icon: '👑', label: 'Owner' },
  };

  const config = badgeConfig[level];

  return (
    <span
      className={`badge badge-${config.color}`}
      role="status"
      aria-label={label || config.label}
    >
      <span aria-hidden="true">{config.icon}</span>
      {level}
    </span>
  );
};
```

**Recommendation for SmartSpecPro:**
Create `PermissionBadge` component and display it in:
- Document grid items (show permission level for shared files)
- Share dialog (show existing shares with badges)
- File detail panel (show current user's permission)

### Accessibility Considerations

**ARIA Attributes for Permission Badges:**
- `aria-label`: Provide accessible name when no visible text
- `aria-live="polite"`: Announce dynamic permission changes
- `role="status"` or `role="alert"`: Notify assistive tech
- `aria-hidden="true"`: Hide decorative icons from screen readers

**Best Practices:**
- Use disabled states instead of complete removal (maintains semantic structure)
- Provide clear feedback for permission-denied actions
- Maintain keyboard navigation for conditionally-rendered elements
- Include `title` attributes for disabled buttons explaining why

```typescript
<button
  disabled={!permissions["delete"]}
  title={!permissions["delete"]
    ? "You don't have permission to delete this file"
    : "Move to trash"}
  aria-disabled={!permissions["delete"]}
>
  Delete
</button>
```

---

## tRPC Granular Permissions

### Best Practices from Research

**Permission Hierarchy Implementation with tRPC-Shield**

```typescript
import { rule, shield, and, or, not } from 'trpc-shield';

// Define permission rules
const isAuthenticated = rule<Context>()(async (ctx) => {
  return ctx.user !== null;
});

const isOwner = rule<Context, { id: string }>()(async (ctx, { input }) => {
  const item = await db.libraryItem.findUnique({
    where: { id: input.id }
  });
  return item?.ownerUserId === ctx.user?.id;
});

const canDelete = rule<Context, { id: string }>()(async (ctx, { input }) => {
  const permission = await getUserEffectivePermission(input.id, ctx.actor);
  return permission === "delete" || permission === "owner";
});

// Hierarchical permission structure
const permissions = shield<Context>({
  mutation: {
    deleteItem: and(isAuthenticated, or(isOwner, canDelete)),
  },
});
```

**Recommendation for SmartSpecPro:**
Consider using tRPC-Shield for complex permission rules, but current middleware pattern is also acceptable:

```typescript
const requirePermission = (minLevel: PermissionLevel) =>
  t.middleware(async ({ ctx, input, next }) => {
    const permission = await getUserEffectivePermission(input.itemId, ctx.actor);

    if (!hasRequiredPermission(permission, minLevel)) {
      throw new TRPCError({
        code: 'FORBIDDEN',
        message: `Missing permission: ${minLevel}`,
      });
    }

    return next({ ctx });
  });
```

### Error Handling for Permission Denied

**tRPC Error Codes:**
```typescript
// 401 UNAUTHORIZED - Missing or invalid credentials
throw new TRPCError({
  code: 'UNAUTHORIZED',
  message: 'You must be logged in to access this resource',
});

// 403 FORBIDDEN - Valid credentials but insufficient permissions
throw new TRPCError({
  code: 'FORBIDDEN',
  message: 'You do not have permission to delete this file',
  cause: { requiredPermission: 'delete', currentPermission: 'read' },
});
```

**Centralized Error Handling:**
```typescript
export const appRouter = t.router({
  // ... routes
}).create({
  onError(opts) {
    const { error, type, path, input, ctx } = opts;

    // Log permission errors for security audit
    if (error.code === 'FORBIDDEN' || error.code === 'UNAUTHORIZED') {
      logger.security({
        type: 'permission_denied',
        path,
        userId: ctx.user?.id,
        error: error.message,
        timestamp: new Date(),
      });
    }
  },
});
```

**Recommendation for SmartSpecPro:**
Add security audit logging for all permission denials in the existing audit logger.

### Permission-Aware Response Types

```typescript
const libraryItemWithPermissions = z.object({
  id: z.number(),
  title: z.string(),
  // ... other fields
  userPermissions: z.object({
    canRead: z.boolean(),
    canWrite: z.boolean(),
    canDelete: z.boolean(),
    isOwner: z.boolean(),
  }),
});

export const libraryRouter = t.router({
  getItem: t.procedure
    .input(z.object({ id: z.number() }))
    .output(libraryItemWithPermissions)
    .query(async ({ input, ctx }) => {
      const item = await getLibraryItemById(input.id, ctx.actor.tenantId);
      const permission = await getUserEffectivePermission(input.id, ctx.actor);

      return {
        ...item,
        userPermissions: {
          canRead: permission !== null,
          canWrite: ["write", "delete", "owner"].includes(permission),
          canDelete: ["delete", "owner"].includes(permission),
          isOwner: permission === "owner",
        },
      };
    }),
});
```

**Recommendation for SmartSpecPro:**
Extend `getItem` endpoint to include `userPermissions` object so frontend knows which actions to display.

---

## PostgreSQL Soft Delete Patterns

### Best Practices from Research

**Schema Design**
```sql
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) NOT NULL,
  deleted_at TIMESTAMP NULL,  -- NULL = active, timestamp = deleted
  created_at TIMESTAMP DEFAULT NOW()
);
```

**Why Timestamp Over Boolean:**
- ✅ Tracks WHEN deletion occurred (audit trail)
- ✅ Enables time-based retention queries
- ✅ Same storage size as boolean
- ✅ More informative for debugging

**Recommendation for SmartSpecPro:**
✅ Already implements this pattern with `deleted_at` in `libraryItems` table.

### Indexing Strategies (CRITICAL)

**Partial Indexes for Active Records:**
```sql
-- Index only active records (where deleted_at IS NULL)
CREATE INDEX idx_library_items_active
ON library_items(tenant_id, owner_user_id, status)
WHERE deleted_at IS NULL;

-- This index is much smaller and faster than indexing all rows
-- If 99% of records are active, this index is 99% smaller
```

**Partial Unique Constraints:**
```sql
-- Allow only one active user per email
CREATE UNIQUE INDEX idx_users_email_active
ON users(email)
WHERE deleted_at IS NULL;
```

**Recommendation for SmartSpecPro:**
✅ Current indexes in schema.ts do not use partial indexes. Consider adding:
```sql
CREATE INDEX idx_library_items_active_tenant_owner
ON library_items(tenant_id, owner_user_id)
WHERE deleted_at IS NULL;

CREATE INDEX idx_library_permissions_active
ON library_permissions(library_item_id, subject_type, subject_id)
WHERE expires_at IS NULL OR expires_at > NOW();
```

### Trash Retention & Auto-Purge

**90-Day Retention Pattern:**
```sql
-- Hard delete records older than 90 days
DELETE FROM library_items
WHERE deleted_at IS NOT NULL
  AND deleted_at < NOW() - INTERVAL '90 days';
```

**Node.js Cleanup Job (BullMQ):**
```typescript
import { Queue, Worker } from 'bullmq';

// Define cleanup queue
const cleanupQueue = new Queue('soft-delete-cleanup', {
  connection: redis,
});

// Schedule daily cleanup
await cleanupQueue.add(
  'purge-old-deletes',
  {},
  {
    repeat: {
      pattern: '0 2 * * *', // Daily at 2 AM
    },
  }
);

// Worker to process cleanup
const worker = new Worker(
  'soft-delete-cleanup',
  async (job) => {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - 90);

    const dbInstance = await db.instance;

    // Find items deleted more than 90 days ago
    const oldTrashItems = await dbInstance
      .select({ id: libraryItems.id })
      .from(libraryItems)
      .where(
        and(
          isNotNull(libraryItems.deletedAt),
          lt(libraryItems.deletedAt, cutoffDate)
        )
      );

    logger.info(`Purging ${oldTrashItems.length} old trash items`);

    // Delete chunks, permissions, and items
    for (const item of oldTrashItems) {
      await dbInstance.delete(libraryChunks)
        .where(eq(libraryChunks.libraryItemId, item.id));

      await dbInstance.delete(libraryPermissions)
        .where(eq(libraryPermissions.libraryItemId, item.id));

      await dbInstance.delete(libraryItems)
        .where(eq(libraryItems.id, item.id));
    }

    logger.info(`Successfully purged ${oldTrashItems.length} items`);
  },
  { connection: redis }
);
```

**Recommendation for SmartSpecPro:**
Implement as `apps/web/server/jobs/purgeOldTrashItems.ts` using BullMQ (already used in project).

### Advanced Patterns

**Cascading Soft Deletes with Triggers:**
```sql
CREATE OR REPLACE FUNCTION soft_delete_item_cascade()
RETURNS TRIGGER AS $$
BEGIN
  -- When item is soft-deleted, mark chunks as deleted
  IF NEW.deleted_at IS NOT NULL AND OLD.deleted_at IS NULL THEN
    UPDATE library_chunks
    SET deleted_at = NEW.deleted_at
    WHERE library_item_id = NEW.id;
  END IF;

  -- When item is restored, restore chunks
  IF NEW.deleted_at IS NULL AND OLD.deleted_at IS NOT NULL THEN
    UPDATE library_chunks
    SET deleted_at = NULL
    WHERE library_item_id = NEW.id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER library_item_soft_delete_cascade
AFTER UPDATE OF deleted_at ON library_items
FOR EACH ROW
EXECUTE FUNCTION soft_delete_item_cascade();
```

**Recommendation for SmartSpecPro:**
Consider implementing trigger-based cascade if chunks should be excluded from vector search when parent item is in trash.

### Common Pitfalls to Avoid

- ❌ **Forgetting to filter deleted records:** Always include `WHERE deleted_at IS NULL`
- ❌ **No partial indexes:** Use partial indexes with `WHERE deleted_at IS NULL`
- ❌ **Ignoring cascading deletes:** Soft-deleting a parent should cascade to children
- ❌ **Unlimited retention:** Implement 90-day retention policy with automated cleanup
- ❌ **Missing unique constraints:** Use partial unique indexes for active records
- ❌ **Not handling foreign keys:** ON DELETE CASCADE doesn't work with soft deletes

---

## Key Takeaways & Recommendations

### Summary Table

| Area | Current State | Gap | Recommendation |
|------|--------------|-----|----------------|
| **Permission Levels** | read, write, owner | Missing "delete" level | Add "delete" level between write and owner |
| **Subject Types** | user, tenant_role | Missing "group" | Add "group" subject type + user_groups tables |
| **Soft Delete** | Implemented with deleted_at | No auto-purge, no deletedBy column | Add deletedBy column + BullMQ purge job |
| **Vector Search** | Filter-first ✅ | No group permission filtering | Extend permission checks to include groups |
| **Frontend UI** | Basic tabs and preview | No share button, no trash view | Add ShareDialog + TrashPanel components |
| **Testing** | Good Vitest coverage | No group tests yet | Write unit + integration tests for groups |
| **Indexes** | Basic indexes | No partial indexes for deleted_at | Add partial indexes for performance |
| **Error Handling** | Good tRPC patterns | No group-specific errors | Add GroupNotFoundError, etc. |

### Critical Implementation Priorities

1. **Database Schema** (Week 1)
   - Add `user_groups` table
   - Add `group_members` table
   - Add `deletedBy` column to `library_items`
   - Extend `library_permissions` to support `subjectType = "group"`
   - Add partial indexes for performance

2. **Backend Services** (Week 1-2)
   - Create `groupsService.ts` with CRUD operations
   - Update `getUserEffectivePermission()` to check group memberships
   - Implement `getUserGroups()` helper
   - Create `groupsRouter.ts` with tRPC endpoints

3. **Permission System** (Week 2)
   - Add "delete" permission level
   - Implement group membership resolution
   - Update permission checking logic
   - Add security audit logging for permission denials

4. **Frontend UI** (Week 3)
   - Create `ShareDialog` component
   - Create `GroupManagement` page
   - Add share button to DocumentPreviewPanel
   - Create `PermissionBadge` component
   - Implement permission-aware action dropdowns

5. **Trash System** (Week 4)
   - Create `TrashPanel` component
   - Add trash tab to DocumentManagement
   - Implement restore functionality
   - Create BullMQ job for auto-purge (90-day retention)

6. **Vector Search** (Week 4)
   - Extend permission filtering to include groups
   - Update search to respect group permissions
   - Test performance with 3-8x overhead expectation

### Testing Strategy

**Unit Tests:**
- Permission resolution with groups
- Group CRUD operations
- Soft delete and restore
- Permission hierarchy (read < write < delete < owner)

**Integration Tests:**
- End-to-end sharing flow (create group → add members → share file → verify access)
- Trash management (delete → view trash → restore → verify)
- Search with group permissions

**Performance Tests:**
- Permission filtering overhead (target: < 8x)
- Search with 1000+ library items
- Group membership resolution at scale

### Security Considerations

**Tenant Isolation:**
- ✅ Apply existing tenant ID normalization to all group operations
- ✅ Filter all group queries by `tenantId`
- ✅ Validate group members are from same tenant

**Permission Validation:**
- ✅ Always check `getUserEffectivePermission()` before allowing actions
- ✅ Never trust client-side permission checks
- ✅ Log all permission denials for security audit

**Rate Limiting:**
- Limit group creation: max 50 groups per user
- Limit member additions: max 100 members per group
- Limit share actions: max 20 shares per minute per user

### Architecture Patterns to Follow

**From Existing Codebase:**
- ✅ Tenant ID normalization pattern
- ✅ `LibraryActor` context pattern
- ✅ Drizzle ORM query composition
- ✅ TRPCError with appropriate codes
- ✅ Service layer separation
- ✅ Audit logging for mutations

**From Research:**
- ✅ Filter-first vector search (already implemented)
- ✅ Permission-based UI rendering (not role-based)
- ✅ Partial indexes for soft deletes
- ✅ Dual-layer enforcement (backend + frontend)
- ✅ Accessible UI with ARIA attributes

---

## Sources

**Codebase Analysis:**
- `apps/web/server/services/libraryService.ts`
- `apps/web/server/routers/library.ts`
- `apps/web/drizzle/schema.ts`
- `apps/web/client/src/pages/DocumentManagement.tsx`
- `apps/web/client/src/components/library/`

**Vector Database & Permissions:**
- [Best Vector Databases in 2025: A Complete Comparison Guide](https://www.firecrawl.dev/blog/best-vector-databases-2025)
- [pgvector vs managed vector database for semantic search | AppMaster](https://appmaster.io/blog/pgvector-vs-managed-vector-db)
- [RAG with Permissions | Supabase Docs](https://supabase.com/docs/guides/ai/rag-with-permissions)
- [HoneyBee: Efficient Role-based Access Control for Vector Databases](https://arxiv.org/html/2505.01538v1)

**React Permission Patterns:**
- [Implementing Role Based Access Control (RABC) in React](https://www.permit.io/blog/implementing-react-rbac-authorization)
- [Radix Primitives Documentation](https://www.radix-ui.com/primitives/docs/overview/introduction)
- [Accessibility – Radix Primitives](https://www.radix-ui.com/primitives/docs/overview/accessibility)

**tRPC Permissions:**
- [GitHub - omar-dulaimi/trpc-shield](https://github.com/omar-dulaimi/trpc-shield)
- [Error Handling | tRPC](https://trpc.io/docs/server/error-handling)
- [Middlewares | tRPC](https://trpc.io/docs/server/middlewares)

**PostgreSQL Soft Deletes:**
- [How to Implement Soft Deletes in PostgreSQL](https://oneuptime.com/blog/post/2026-01-21-postgresql-soft-deletes/view)
- [Soft deletion with PostgreSQL: but with logic on the database!](https://evilmartians.com/chronicles/soft-deletion-with-postgresql-but-with-logic-on-the-database)
- [Stop Using != deleted_at: Database Soft Delete Performance Guide](https://blog.thnkandgrow.com/stop-using-deleted_at-database-soft-delete-performance-guide/)

---

**End of Research Document**
