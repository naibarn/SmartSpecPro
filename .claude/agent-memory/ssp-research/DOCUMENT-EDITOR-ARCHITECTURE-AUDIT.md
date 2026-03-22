---
name: Document Editor Architecture Audit
description: Current state of document editor, markdown handling, library system, database schema, and routes in SmartSpecPro
type: reference
---

# Document Editor Architecture Audit (2026-03-18)

## Research Scope
Comprehensive audit of the Document Editor / Library / Document Management system to understand existing architecture before planning a new Tiptap-based single-panel Markdown editor.

**Date:** 2026-03-18
**Status:** COMPLETE
**Key Files Audited:** 23 components, 3 routers, schema, library service (4.5K lines)

---

## SECTION 1: HIGH-LEVEL FINDINGS

### Current Document Editor Architecture
- **Type:** Split-panel Markdown editor (CodeMirror-based)
- **Current Library:** `@uiw/react-codemirror` (React wrapper) + `@codemirror/lang-markdown` (language support)
- **Markdown Rendering:** `marked` (v16.4.2) for parsing, `streamdown` for rendering, `DOMPurify` for XSS safety
- **Storage:** PostgreSQL via Drizzle ORM (libraryItems, libraryChunks, libraryContentVersions tables)
- **State Management:** TanStack Query (useQuery/useMutation), local React state with TiptapFileEditor pattern
- **Framework:** React 19 + TypeScript, Wouter for routing

### Key Capabilities (CURRENTLY IMPLEMENTED)
1. **Split-panel editing:** CodeMirror editor + live markdown preview
2. **Media insertion:** Insert images/videos/audio from library into markdown
3. **Toolbar formatting:** Bold, italic, headings, lists, links, quotes, code blocks
4. **Undo/Redo:** Full undo/redo stack via CodeMirror commands
5. **Version history:** Full content version tracking with restore capability
6. **Permissions:** Share documents with users, groups, or via public link
7. **Search:** Federated search across documents, images, videos, code files
8. **File types:** Markdown, code (JS, Python, JSON, YAML, SQL, etc.), images, videos, audio, PDFs, Excel, CSV, JSON, XML, HTML

### Critical Insight: Storage Architecture
- **Content stored in TWO PLACES:**
  1. `libraryChunks` table (chunk 0, contentType="markdown_source") = raw markdown source
  2. `libraryContentVersions` table = versioned snapshots of all edits
- **Key reason:** Indexing separates raw markdown from indexed text chunks
  - Chunk 0 with contentType="markdown_source" = original authored content
  - Other chunks with contentType="text" = indexed/searchable text (for RAG)
- **This split is load-bearing for RAG and search** — new editor must preserve this

---

## SECTION 2: CURRENT SYSTEM ARCHITECTURE

### Frontend Components (apps/web/client/src/components/library)

#### Page-Level Component
- **DocumentManagement.tsx** (lines 1-1800+)
  - Split-panel library browser + document editor
  - 3-panel layout: Library list | Editor (CodeMirror) | Preview (SafeMarkdown)
  - Collapsible panels, resizable handles, responsive breakpoints
  - Supports inline editing, version history, sharing
  - Query state management: scope (my_library/shared_with_me/trash), sort, view mode

#### Markdown Editor Component
- **MarkdownFileEditor.tsx** (520 lines)
  - CodeMirror wrapper with markdown toolbar
  - Props: value, onChange, onSave, documentId, editorOnly, fullHeight
  - Toolbar buttons:
    - Formatting: Bold, Italic, Underline, Code, Link, Quote
    - Headings: H1-H4 via insertHeading(level)
    - Lists: Unordered, ordered
    - Blocks: Horizontal rule, code fence
  - Media pickers:
    - Image picker: searches library.listDocuments(itemType="image")
    - Video picker: inserts HTML <video> tag with source_url
    - Audio picker: inserts HTML <audio> tag with source_url
  - Import/Export: Import markdown from file
  - Editor state: collapsed/expanded for editor and preview
  - Line numbers toggle

#### CodeMirror Wrapper
- **CodeMirrorEditor.tsx** (220 lines)
  - Language detection from file extension
  - Supports 12+ languages: JavaScript, TypeScript, Python, PHP, HTML, CSS, JSON, XML, YAML, SQL, Markdown
  - Ref-based imperative API: insertText, wrapSelection, replaceSelection, getSelection, undo, redo
  - Syntax highlighting, line numbers, basic editor configuration

#### Other Editor Components
- **CodeFileEditor.tsx** (100 lines)
  - Wrapper for general code files (Python, JS, etc.)
  - Read-only or editable modes
  - Syntax highlighting + toolbar
- **DocumentPreviewPanel.tsx**
  - Multi-format preview (markdown, image, video, pdf, excel, code, etc.)
  - Delegates to appropriate viewer component
- **DocumentGridList.tsx**
  - Grid/list view of library items
  - Metadata, status badges, access labels
- **DocumentLibraryTabs.tsx**
  - Tab interface for: My Library, Google Drive, OneDrive, Shared with Me, Shared Groups, Trash
- **DocumentVersionHistory.tsx** + **MarkdownVersionHistory.tsx**
  - Shows version snapshots with restore capability
  - Timestamp, author, change description

#### Media Insertion Components
- **LibraryFilePicker.tsx** — Modal to select files from library
- Search for images/videos/audio via `trpc.library.listDocuments`
- Direct URL insertion from source_url field

### Backend Routers (apps/web/server/routers)

#### library.ts (1500+ lines)
**Type-safe tRPC procedures:**

1. **library.search** — Hybrid keyword + vector search across all library items
   - Input: query, limit, offset, filters (itemType, model, tags, status, date range)
   - Output: LibrarySearchResultV1 (items + metadata)
   - Uses: federatedSearch, vector provider config, tenant isolation

2. **library.listDocuments** — Paginated list with filtering
   - Input: query, limit, offset, scope (all/my_library/shared/shared_groups), filters
   - Output: LibraryDocumentListResponse
   - **Used by:** MarkdownFileEditor image/video/audio pickers (lines 116-165)

3. **library.getById** — Fetch single item with full metadata
   - Input: itemId
   - Output: LibraryItemDto (full details)

4. **library.getMarkdownContent** — Fetch markdown source + version info
   - Input: itemId
   - Output: LibraryMarkdownContentResult { item_id, content, updated_at }
   - **Key:** Reads from libraryChunks chunk 0 with contentType="markdown_source"
   - **Used by:** DocumentManagement when opening editor (line 430)

5. **library.saveMarkdown** — Save markdown changes
   - Input: SaveLibraryMarkdownInput { itemId, content, expectedUpdatedAt?, changeDescription? }
   - Output: SaveLibraryMarkdownResult { item, indexJob }
   - Creates version in libraryContentVersions
   - Enqueues re-indexing job
   - **Optimistic locking:** expectedUpdatedAt prevents concurrent edits
   - **Used by:** MarkdownFileEditor onSave (line 550)

6. **library.getContentVersionHistory** — List all versions
   - Input: itemId, limit, offset
   - Output: versions with timestamps, authors, sizes

7. **library.restoreContentVersion** — Revert to previous version
   - Input: itemId, versionNumber
   - Copies old content, creates new version as restore
   - **Used by:** DocumentVersionHistory (line 450)

8. **library.uploadFile** — Upload binary file
   - Input: fileName, fileType, fileBase64, title, visibility, parentId
   - Output: UploadLibraryFileResult (item, storageKey, billing)
   - Validates MIME type, handles sandbox parsing for PPTX/PDF/DOCX
   - Charges credits

9. **library.replaceFile** — Replace existing file
   - Input: itemId, fileName, fileType, fileBase64, changeDescription
   - Output: ReplaceLibraryFileResult { item, indexJob, versionNumber }

10. **library.shareItem** — Share with user/group
11. **library.updateSharePermission** — Modify permissions
12. **library.listShares** — Show who has access
13. **library.deleteShare** — Revoke access
14. **library.softDeleteItem** — Move to trash
15. **library.restoreFromTrash** — Recover deleted item
16. **library.permanentDeleteItem** — Purge from trash
17. **library.updateItem** — Update title, description, metadata, visibility
18. **library.listTrash** — Show deleted items

#### libraryOps.ts (smaller router)
- Additional library operations
- Likely contains CRUD for specific operations

### Backend Service (apps/web/server/services/libraryService.ts, 4.5K lines)

**Key Functions for Markdown Editing:**

1. **getLibraryMarkdownContent(itemId, actor)**
   - Returns: { item_id, content, updated_at }
   - Reads chunk 0 with contentType="markdown_source"
   - Validates permissions
   - **CRITICAL:** Does NOT read indexed text chunks — only raw markdown source

2. **saveLibraryMarkdown(input, actor)**
   ```typescript
   interface SaveLibraryMarkdownInput {
     itemId: number;
     content: string;
     expectedUpdatedAt?: Date;  // optimistic locking
     changeDescription?: string;
   }
   ```
   - Validates permissions (must have "write" or "owner")
   - Checks expectedUpdatedAt for race condition detection
   - Creates libraryContentVersion record (version number auto-incremented)
   - Updates libraryChunks chunk 0 with new markdown_source
   - Enqueues re-indexing job via buildLibraryIndexJobPayload()
   - Returns: { item: LibraryItemDto, indexJob: LibraryEnqueueResult }

3. **createContentVersion(db, input)**
   - Writes to libraryContentVersions table
   - Calculates SHA256 content hash
   - Deduplicates identical content (skips duplicate write)
   - Increments version number atomically

4. **getContentVersionById(versionId, actor)**
   - Fetch specific version for restore

5. **restoreContentVersion(input, actor)**
   - Restore from version history
   - Creates new version as "restore of version X"

### Database Schema (apps/web/drizzle/schema.ts)

#### libraryItems (parent table)
```typescript
export const libraryItems = pgTable("library_items", {
  id: serial("id").primaryKey(),
  tenantId: varchar("tenant_id", { length: 36 }).notNull(),
  ownerUserId: integer("owner_user_id").notNull(),
  parentId: integer("parent_id").references(() => libraryItems.id),  // null = root-level
  itemType: varchar("item_type", { length: 32 }).notNull(),  // "document", "markdown", "image", "video", etc.
  source: varchar("source", { length: 64 }).notNull(),  // "library", "google_drive", "onedrive", "upload"
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description"),
  status: enum("status").notNull().default("ready"),  // draft, ready, indexing, archived, failed
  visibility: enum("visibility").notNull().default("private"),  // private, team, public
  metadata: json("metadata").$type<Record<string, any>>().notNull().default({}),
  sourceUrl: text("source_url"),  // S3/R2 URL after upload
  thumbnailUrl: text("thumbnail_url"),  // generated thumbnail (images only)
  allowedScopes: text("allowed_scopes").array().default([]),  // denormalized for vector filtering
  deletedAt: timestamp("deleted_at", { withTimezone: true }),  // soft delete
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});
```

#### libraryChunks (content storage)
```typescript
export const libraryChunks = pgTable("library_chunks", {
  id: serial("id").primaryKey(),
  libraryItemId: integer("library_item_id").references(() => libraryItems.id),
  chunkIndex: integer("chunk_index").notNull(),
  content: text("content").notNull(),  // raw markdown or indexed text
  contentType: varchar("content_type", { length: 32 }).notNull(),  // "markdown_source" or "text"
  tokenCount: integer("token_count"),  // for billing/limits
  vectorRefId: varchar("vector_ref_id", { length: 128 }),  // pgvector embedding ID
  metadata: json("metadata").$type<Record<string, any>>().default({}),
  allowedScopes: text("allowed_scopes").array(),  // tenant/share scopes
  isParent: boolean("is_parent").default(false),  // RAG parent-child relationships
  parentChunkId: integer("parent_chunk_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});
```

#### libraryContentVersions (history)
```typescript
export const libraryContentVersions = pgTable("library_content_versions", {
  id: serial("id").primaryKey(),
  libraryItemId: integer("library_item_id").references(() => libraryItems.id),
  versionNumber: integer("version_number").notNull(),
  contentHash: varchar("content_hash", { length: 64 }).notNull(),  // SHA256
  content: text("content").notNull(),  // full content snapshot
  contentType: varchar("content_type", { length: 32 }).notNull(),  // "markdown_source", "file_snapshot"
  contentSizeBytes: integer("content_size_bytes").notNull(),
  changeDescription: text("change_description"),  // user annotation
  snapshotObjectKey: varchar("snapshot_object_key", { length: 512 }),  // S3 key for binary
  createdByUserId: integer("created_by_user_id").references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});
```

#### libraryPermissions (access control)
```typescript
export const libraryPermissions = pgTable("library_permissions", {
  id: serial("id").primaryKey(),
  libraryItemId: integer("library_item_id").references(() => libraryItems.id),
  subjectType: varchar("subject_type", { length: 32 }).notNull(),  // "user", "tenant_role", "group"
  subjectId: varchar("subject_id", { length: 64 }).notNull(),
  permissionLevel: varchar("permission_level", { length: 32 }).notNull().default("read"),  // read, write, delete, owner
  expiresAt: timestamp("expires_at", { withTimezone: true }),  // time-limited shares
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});
```

#### libraryIndexJobs (re-indexing queue)
- Async re-indexing after content changes
- Status: pending, processing, retry_pending, completed, failed
- Throttling to prevent overwhelming indexer

---

## SECTION 3: ROUTES & NAVIGATION

### Document Management Page
- **Route:** `/document-management`
- **Page Component:** DocumentManagement.tsx
- **State in URL:** Query parameters via documentManagementUi.ts
  - `scope`: my_library | my_drive | my_onedrive | shared_with_me | shared_groups | trash
  - `sort`: updated_desc | created_desc
  - `mode`: library | editor (view mode)
  - `doc`: document ID (for editor)
  - `q`: search query
  - `type`: filter by item type
  - `folder`: folder ID for navigation

### Document Editor Tabs
- **DocumentManagement.tsx** manages open editor tabs
- Tab state stored in `documentEditorTabs` (lib/documentManagementTabs.ts)
- Multiple documents can be open simultaneously (tab interface)
- Closing tab triggers save check if dirty

### Inline Preview in DocumentManagement
- DocumentPreviewPanel renders in right sidebar
- Responds to selected item
- Multi-format: markdown → SafeMarkdown, images → img, videos → video tag, PDFs → PDF viewer, etc.

---

## SECTION 4: MARKDOWN RENDERING PIPELINE

### Current Stack
1. **Author writes markdown** in CodeMirror editor
2. **User clicks Save** → calls library.saveMarkdown
3. **Backend stores:**
   - Raw markdown in libraryChunks[0] (contentType="markdown_source")
   - SHA256 hash in libraryContentVersions (for dedup + history)
   - Metadata in libraryItems
4. **Preview renders:**
   - CodeMirror shows live preview (marked parser)
   - SafeMarkdown component uses marked + DOMPurify
5. **Index job:**
   - Python backend processes markdown
   - Extracts text for search chunks
   - Embeds for vector search (if enabled)

### Rendering Libraries
- **marked** (v16.4.2) — Parse markdown to HTML
- **streamdown** — Streaming markdown renderer
- **DOMPurify** — XSS sanitization
- **Sanitize-html** (v2.17.0) — Additional HTML sanitization
- **react-syntax-highlighter** (v16.1.0) — Code block highlighting

### SafeMarkdown Component (/components/chat/SafeMarkdown.tsx)
- **Input:** Raw markdown string
- **Processing:**
  1. Protect fenced code blocks (preserve special chars like `-->`)
  2. Remove dangerous scripts/handlers (onclick, onload, etc.)
  3. Apply DOMPurify with ALLOWED_TAGS + ALLOWED_ATTR
  4. Restore code blocks (preserves original escaping)
  5. Validate all URLs (block javascript:, data:text, file:, blob:)
- **Output:** Safe HTML, rendered as React JSX
- **Special support:** `<video>`, `<audio>`, `<table>`, clickable images with lightbox

---

## SECTION 5: MEDIA & ASSET HANDLING

### Image/Video/Audio Insertion in Markdown Editor
1. User clicks toolbar button (ImagePlus, Video, Music2 icons)
2. Picker modal opens, queries library.listDocuments with filter
3. User selects item from library
4. insertImageFromLibrary() / insertVideoFromLibrary() / insertAudioFromLibrary()
   - Wraps in markdown: `![alt](source_url)` or HTML: `<video src="...">`
   - Inserts at cursor position
5. Content saved to libraryChunks markdown_source

### Storage Architecture
- **source_url:** Permanent S3/R2 URL (from storagePut)
- **thumbnail_url:** Generated thumbnail (images only, null initially)
- **metadata:** Flexible JSON (extension, dimensions, model name, etc.)

### Search Integration
- libraryService.searchLibraryItems() for federated search
- Filters by itemType: "image", "video", "audio"
- Limits to items with source_url (excludes incomplete uploads)

---

## SECTION 6: DOCUMENT EDITOR PATTERNS & CONVENTIONS

### Props Pattern (MarkdownFileEditor)
```typescript
interface MarkdownFileEditorProps {
  value: string;                              // Current markdown content
  onChange: (value: string) => void;          // Update on edit
  onSave: () => void;                         // Triggered by Save button
  onVersionRestore?: () => void;              // Triggered after version restore
  onEnterEditMode?: () => void;               // When user starts editing
  disabled?: boolean;                         // Disable editing
  isSaving?: boolean;                         // Show saving spinner
  updatedAt?: string;                         // Display last save time
  errorMessage?: string;                      // Show error inline
  fullHeight?: boolean;                       // 70vh vs auto
  editorOnly?: boolean;                       // Hide preview panel
  documentId?: number;                        // For version history
}
```

### State Management Pattern
- **React hooks:** useState for local UI state (collapsed panels, active tabs, search query)
- **TanStack Query:** trpc.library.* for data fetching (cached, auto-refetch)
- **Form state:** Controlled inputs via onChange handlers
- **Dirty tracking:** Compare current value with savedValue

### Save Flow
1. User edits markdown in CodeMirror
2. onChange updates local state: `value`
3. User clicks Save button
4. onSave called → calls trpc.library.saveMarkdown mutation
5. Backend saves to DB, enqueues re-index
6. Mutation returns new updatedAt timestamp
7. Update savedValue to current value (mark as clean)

### Error Handling
- Show inline error message in red box
- LibraryMarkdownVersionConflictError if expectedUpdatedAt doesn't match
- Toast notifications for success/failure

---

## SECTION 7: CONSTRAINTS & LOAD-BEARING PATTERNS

### DO NOT BREAK
1. **libraryChunks chunk 0 with contentType="markdown_source"**
   - This is where getLibraryMarkdownContent() reads from
   - New editor must write to this exact location
   - If missing, search and RAG will break

2. **libraryContentVersions versioning**
   - SHA256 hash-based dedup
   - Version number must auto-increment
   - Restore creates new version, doesn't overwrite

3. **Optimistic locking via expectedUpdatedAt**
   - Prevents race conditions in concurrent edits
   - New editor must pass item.updatedAt when saving

4. **Tenant isolation**
   - All queries must filter by tenantId
   - libraryItems + libraryChunks + libraryContentVersions must all be tenant-scoped

5. **Permission checking**
   - canReadLibraryItem() / canManageLibraryItem() / canDeleteLibraryItem()
   - New editor inherits these checks from tRPC procedures

6. **Re-indexing enqueue**
   - After save, buildLibraryIndexJobPayload() creates job in libraryIndexJobs
   - Python backend processes async
   - Don't skip or bypass this

### Patterns to Preserve
1. **Multi-format preview:** Editor must support markdown, code, images, videos, etc.
2. **Collapsible panels:** UI can collapse editor or preview (useful on mobile)
3. **Line numbers toggle:** User preference persisted in localStorage (useLineNumbersToggle hook)
4. **Undo/redo:** Full stack support via CodeMirror/Tiptap
5. **Media insertion:** Toolbar buttons to insert from library
6. **Version history:** Access to all past versions

---

## SECTION 8: RELATED SYSTEMS

### Vector Search Integration
- libraryItems + libraryChunks have allowedScopes (denormalized for vector filtering)
- Vector provider config read from system_settings
- All chunk queries filter by allowedScopes for RAG

### Presentation System Integration
- presentationDecks references libraryItems via libraryItemId
- presentationAssetLinks connects decks to library media
- Import of documents creates presentations from library items

### Google Drive / OneDrive Integration
- googleDriveEditSessions + onedriveEditSessions tables
- External edit workflows (user edits in Google Docs, sync back to library)
- Conversion records for PPTX/DOCX import

### Credit/Billing System
- uploadLibraryFile() charges credits based on file size
- replaceLibraryFile() also charges
- calculateLibraryUploadCreditCost() computes cost
- All operations audit-logged to creditTransactions

### Audit Logging
- auditLogger tracks all document operations
- JSONL-based event logging
- Includes: user, action, itemId, timestamp, outcome

---

## SECTION 9: KEY FILES SUMMARY

### Frontend (React Components)
| File | Lines | Purpose |
|------|-------|---------|
| DocumentManagement.tsx | 1800+ | Main page: 3-panel split with library + editor + preview |
| MarkdownFileEditor.tsx | 520 | CodeMirror wrapper + toolbar + media pickers |
| CodeMirrorEditor.tsx | 220 | CodeMirror integration + language detection |
| DocumentPreviewPanel.tsx | ~300 | Multi-format preview dispatcher |
| DocumentGridList.tsx | ~400 | Grid/list view of library items |
| SafeMarkdown.tsx | 200 | XSS-safe markdown renderer (marked + DOMPurify) |
| CodeFileEditor.tsx | 100 | Generic code file editor |

### Backend (Node.js / tRPC)
| File | Lines | Purpose |
|------|-------|---------|
| server/routers/library.ts | 1500+ | tRPC procedures for library CRUD + search |
| server/services/libraryService.ts | 4500+ | Core library logic: content CRUD, versioning, permissions |
| server/services/libraryUrlPolicy.ts | ~300 | URL validation (sourceUrl, thumbnailUrl) |

### Database Schema
| Table | Purpose |
|-------|---------|
| libraryItems | Document metadata (title, status, visibility, permissions) |
| libraryChunks | Content storage (chunk 0 = markdown_source, others = indexed text) |
| libraryContentVersions | Version history (SHA256 hash, snapshot snapshots) |
| libraryPermissions | Share access control (user/group/tenant_role) |
| libraryIndexJobs | Re-indexing queue (async processing) |

### Utilities
| File | Purpose |
|------|---------|
| lib/documentManagementUi.ts | URL query state, preview type detection, sorting/filtering |
| lib/documentManagementTabs.ts | Open editor tab management |

---

## SECTION 10: CURRENT EDITOR LIMITATIONS & GAPS

### What's Missing from Current Editor
1. **No native rich-text editing** — only code view + markdown preview (split-panel)
2. **No WYSIWYG mode** — user must read markdown syntax
3. **No collaborative editing** — single-user only
4. **No realtime sync** — manual save button required
5. **No embedded media preview** — images/videos not visible in editor, only in preview
6. **No accessible keyboard shortcuts** — basic Ctrl+S, but no standard shortcuts
7. **No paste handling** — users must manually convert pasted content
8. **No markdown formatting detection** — can't detect when pasted text is already markdown

### What Tiptap Could Improve
1. **WYSIWYG editor** — True "What You See Is What You Get" with live formatting
2. **Extensible plugins** — Custom handling for code blocks, embeds, mentions, etc.
3. **Collaborative editing support** — Foundation for multi-user edits (TipTap + Yjs)
4. **Better mobile experience** — Touch-friendly UI, mobile formatting toolbar
5. **AI integration hooks** — Custom nodes for AI-generated content, suggestions
6. **Paste handling** — Intelligent paste (detect markdown, HTML, plain text)
7. **Single-panel mode** — Preview always visible (not side-by-side)
8. **Keyboard shortcuts** — Built-in shortcuts (Ctrl+B for bold, Cmd+/ for command palette)

---

## SECTION 11: IMPLEMENTATION NOTES FOR NEW EDITOR

### Must-Have Requirements
1. **Store in same libraryChunks location** — chunk 0, contentType="markdown_source"
2. **Use saveLibraryMarkdown() API** — Don't bypass existing backend
3. **Preserve version history** — Every save creates libraryContentVersions entry
4. **Support optimistic locking** — Pass expectedUpdatedAt to prevent race conditions
5. **Enqueue re-indexing** — After save, indexJob is created automatically
6. **Maintain permissions** — Leverage existing canManageLibraryItem() checks
7. **Support all file types** — Markdown, code, plain text (not just markdown)
8. **Work in split-panel context** — Fit into DocumentManagement 3-panel layout
9. **Support media insertion** — Toolbar to insert images/videos/audio from library
10. **Version history access** — Show/restore past versions via DocumentVersionHistory

### Optional Enhancements
1. **Single-panel mode** — Option to hide split-panel, use full editor width
2. **Collaborative editing** — Tiptap + Yjs for multi-user sync
3. **AI integration** — Suggest markdown formatting, grammar checks
4. **Custom toolbar** — Context-sensitive buttons based on selection
5. **Themes** — Light/dark mode support
6. **Keyboard macros** — User-defined shortcuts

### Technical Decisions
1. **Keep CodeMirror for code files** — Only replace MarkdownFileEditor with Tiptap
2. **Export to Markdown** — Tiptap JSON → Markdown for storage (or store Tiptap JSON and convert on read)
3. **Backward compatibility** — New editor must read old markdown-only content
4. **Preview rendering** — Reuse SafeMarkdown component for preview panel

---

## KEY METRICS

| Metric | Value |
|--------|-------|
| Current editor: CodeMirror library | @uiw/react-codemirror v4.25.4 |
| Markdown parser | marked v16.4.2 |
| XSS sanitization | DOMPurify v3.3.1 + sanitize-html v2.17.0 |
| Database versions per document | Unlimited (SHA256 dedup) |
| Chunk size limit | No hard limit (text column in PostgreSQL) |
| Supported file types | 20+ (markdown, code, images, video, audio, pdf, excel, csv, json, xml, html) |
| Tenant isolation | All tables scoped by tenantId varchar(36) |
| Search index | pgvector for vector embeddings (optional) |

