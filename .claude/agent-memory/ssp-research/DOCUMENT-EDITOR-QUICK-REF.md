---
name: Document Editor Quick Reference
description: Fast lookup for current editor architecture, key files, APIs, and constraints
type: reference
---

# Document Editor — Quick Reference (2026-03-18)

## Current Editor at a Glance

| Aspect | Details |
|--------|---------|
| **Type** | Split-panel (CodeMirror + markdown preview) |
| **Library** | @uiw/react-codemirror + @codemirror/lang-markdown |
| **Markdown Rendering** | marked (v16.4.2) + Streamdown + DOMPurify |
| **Route** | `/document-management` (query-based state) |
| **Storage** | PostgreSQL: libraryItems + libraryChunks + libraryContentVersions |
| **Save API** | `trpc.library.saveMarkdown(itemId, content, expectedUpdatedAt)` |
| **Read API** | `trpc.library.getMarkdownContent(itemId)` |
| **State Management** | TanStack Query + React hooks |

---

## Critical Paths

### Reading Markdown Content
```
DocumentManagement.tsx (mount)
  ↓
trpc.library.getMarkdownContent(itemId)
  ↓
libraryService.getLibraryMarkdownContent(itemId, actor)
  ↓
SELECT content FROM libraryChunks
  WHERE libraryItemId = ?
  AND chunkIndex = 0
  AND contentType = 'markdown_source'
  ↓
MarkdownFileEditor (value prop)
  ↓
CodeMirrorEditor (rendered to DOM)
```

### Saving Markdown Content
```
MarkdownFileEditor.handleSave()
  ↓
trpc.library.saveMarkdown({
  itemId: number,
  content: string,
  expectedUpdatedAt: Date,  // optimistic locking
  changeDescription?: string
})
  ↓
libraryService.saveLibraryMarkdown(input, actor)
  ↓
UPDATE libraryItems SET updatedAt = NOW()
INSERT INTO libraryContentVersions (versionNumber, contentHash, content, ...)
UPDATE libraryChunks SET content = ? WHERE chunkIndex = 0 AND contentType = 'markdown_source'
ENQUEUE libraryIndexJobs (re-index job)
  ↓
Return SaveLibraryMarkdownResult { item, indexJob }
  ↓
UI updates timestamp, disables save button
```

### Restoring Version
```
DocumentVersionHistory (version picker)
  ↓
trpc.library.restoreContentVersion(itemId, versionNumber)
  ↓
libraryService.restoreContentVersion(input, actor)
  ↓
Get old version content from libraryContentVersions
Create NEW version entry (labeled as "restore of version X")
UPDATE libraryChunks chunk 0 with restored content
ENQUEUE libraryIndexJobs
  ↓
MarkdownFileEditor updates with new content
```

---

## Frontend Components (Quick Map)

### Main Page
- **DocumentManagement.tsx** (1800 lines)
  - 3-panel layout: Library browser | Editor | Preview
  - Query state: scope, sort, mode (library/editor), docId
  - Tab management for multiple open documents

### Editor Components
- **MarkdownFileEditor.tsx** (520 lines) — **PRIMARY EDITOR**
  - CodeMirror wrapper + toolbar
  - Markdown formatting buttons: Bold, Italic, Headings, Lists, Links, Quotes, Code
  - Media pickers: Insert images/videos/audio from library
  - Collapse/expand controls
  - Line number toggle

- **CodeMirrorEditor.tsx** (220 lines)
  - CodeMirror integration + language detection
  - Supports 12+ languages (JavaScript, Python, JSON, YAML, SQL, etc.)
  - Ref-based imperative API

- **CodeFileEditor.tsx** (100 lines)
  - Generic code file editor (read-only or editable)

### Preview & Display
- **DocumentPreviewPanel.tsx**
  - Multi-format previewer: markdown, image, video, PDF, Excel, code
  - Delegates to appropriate viewer (SafeMarkdown, img, video, etc.)

- **SafeMarkdown.tsx** (200 lines)
  - marked + DOMPurify XSS-safe renderer
  - Supports clickable images, video/audio tags, tables
  - Sanitizes URLs (blocks javascript:, data:text, file:, blob:)

### Library & History
- **DocumentGridList.tsx** — Grid/list view of items
- **DocumentVersionHistory.tsx** — Version picker with restore
- **DocumentLibraryTabs.tsx** — Tab interface (My Library, Shared, Trash, etc.)

---

## Backend APIs (tRPC Procedures)

### Content Read/Write
| Procedure | Input | Output | Purpose |
|-----------|-------|--------|---------|
| `library.getMarkdownContent` | itemId | { item_id, content, updated_at } | Fetch markdown source |
| `library.saveMarkdown` | itemId, content, expectedUpdatedAt? | { item, indexJob } | Save + create version |
| `library.getContentVersionHistory` | itemId, limit, offset | versions[] | List all versions |
| `library.getContentVersionById` | versionId | content | Get specific version |
| `library.restoreContentVersion` | itemId, versionNumber | { item, indexJob } | Revert to old version |

### Item Management
| Procedure | Input | Output | Purpose |
|-----------|-------|--------|---------|
| `library.listDocuments` | query, scope, filters | { total, limit, offset, results } | Browse/filter items |
| `library.search` | query, filters | { results, ... } | Hybrid keyword + vector search |
| `library.getById` | itemId | LibraryItemDto | Get item metadata |
| `library.updateItem` | itemId, { title?, description?, ... } | item | Update metadata |
| `library.uploadFile` | fileName, fileType, fileBase64 | { item, storageKey, indexJob } | Upload new file |
| `library.replaceFile` | itemId, fileBase64 | { item, indexJob, versionNumber } | Replace file |

### Sharing & Access
| Procedure | Input | Output | Purpose |
|-----------|-------|--------|---------|
| `library.shareItem` | itemId, subjectType, subjectId, permissionLevel | permission | Grant access |
| `library.updateSharePermission` | itemId, subjectId, level | permission | Change permission |
| `library.listShares` | itemId | shares[] | Show who has access |
| `library.deleteShare` | itemId, subjectId | - | Revoke access |

### Lifecycle
| Procedure | Input | Output | Purpose |
|-----------|-------|--------|---------|
| `library.softDeleteItem` | itemId | item | Move to trash |
| `library.restoreFromTrash` | itemId | item | Recover from trash |
| `library.permanentDeleteItem` | itemId | - | Hard delete |
| `library.listTrash` | scope, limit, offset | items[] | Show deleted items |

---

## Database Tables

### libraryItems
- Primary metadata table (title, description, visibility, status)
- FK: tenantId, ownerUserId, parentId (for folders)
- Soft delete via deletedAt column
- Indexes on: (tenantId, visibility, status), (tenantId, ownerUserId, status)

### libraryChunks
- Content storage (markdown text or indexed text)
- **CRITICAL:** chunk 0 with contentType="markdown_source" = raw author content
- Other chunks with contentType="text" = indexed for RAG
- FK: libraryItemId
- Supports parent-child relationships (isParent, parentChunkId)

### libraryContentVersions
- Version history with SHA256 content hash
- Auto-increment versionNumber per item
- Stores full content snapshot
- Deduplication: skip insert if contentHash already exists

### libraryPermissions
- Row-level access control (user, group, tenant_role)
- Levels: read, write, delete, owner
- Optional expiresAt for time-limited shares
- Unique constraint: (libraryItemId, subjectType, subjectId)

### libraryIndexJobs
- Async re-indexing queue
- Status: pending, processing, retry_pending, completed, failed
- Throttled to prevent overwhelming indexer

---

## Key Constraints (DO NOT BREAK)

### Storage Pattern
- **MUST READ FROM:** libraryChunks WHERE chunkIndex=0 AND contentType='markdown_source'
- **MUST WRITE TO:** Same location (chunk 0, markdown_source type)
- **MUST CREATE VERSION:** Entry in libraryContentVersions after every save
- **MUST ENQUEUE INDEX JOB:** buildLibraryIndexJobPayload() after save

### Concurrency Control
- **Optimistic locking:** Pass expectedUpdatedAt to saveMarkdown()
- **If mismatch:** Throw LibraryMarkdownVersionConflictError
- **New editor MUST:** Fetch updatedAt before edit, pass it back on save

### Multi-Tenancy
- **All queries MUST filter:** WHERE tenantId = actor.tenantId
- **TenantId type:** varchar(36) (not integer)
- **Isolation:** Users from different tenants cannot access each other's items

### Permissions
- **Read access:** canReadLibraryItem() checks visibility + explicit shares
- **Write access:** canManageLibraryItem() checks "owner" or explicit "write" share
- **Delete access:** canDeleteLibraryItem() checks "owner" or explicit "delete" share
- **These checks inherited from tRPC context** — new editor doesn't need custom logic

### Indexing
- **After save:** Python backend process async index job
- **NEVER skip:** Re-indexing is required for search to work
- **Status transitions:** pending → processing → completed (or retry_pending on error)

---

## Config & Features

### Document Types Supported
| Type | Extension | Editor | Preview |
|------|-----------|--------|---------|
| Markdown | .md | CodeMirror + toolbar | SafeMarkdown |
| JavaScript | .js, .ts, .jsx, .tsx | CodeMirror | CodeViewer |
| Python | .py | CodeMirror | CodeViewer |
| JSON | .json | CodeMirror | JSONViewer |
| YAML | .yaml, .yml | CodeMirror | CodeViewer |
| HTML | .html, .htm | CodeMirror | CodeViewer |
| CSS | .css, .scss | CodeMirror | CodeViewer |
| Images | .png, .jpg, .gif | N/A (read-only) | img tag |
| Videos | .mp4, .webm | N/A (read-only) | video tag |
| Audio | .mp3, .wav | N/A (read-only) | audio tag |
| PDF | .pdf | N/A (read-only) | PDF viewer |
| Excel | .xlsx | N/A (read-only) | Excel viewer |
| CSV | .csv | N/A (read-only) | CSV viewer |

### Search Features
- Keyword search (fuzzy matching via Fuse.js)
- Vector search (pgvector embeddings, optional)
- Filters: itemType, owner, status (draft/ready/indexing), date range
- Federated search (across documents, images, videos)

### Sharing Options
- **Visibility:** private, team, public
- **Permissions:** read, write, delete, owner
- **Share targets:** user, tenant_role, group
- **Time-limited:** Optional expiresAt timestamp

---

## Toolbar Actions (MarkdownFileEditor)

| Icon | Action | Shortcut | Markdown Output |
|------|--------|----------|-----------------|
| **B** | Bold | Ctrl+B | `**text**` |
| _I_ | Italic | Ctrl+I | `*text*` |
| <u>U</u> | Underline | Ctrl+U | `<u>text</u>` |
| `` ` `` | Code | Ctrl+` | `` `code` `` |
| # | Heading 1 | - | `# Heading` |
| ## | Heading 2 | - | `## Heading` |
| ### | Heading 3 | - | `### Heading` |
| #### | Heading 4 | - | `#### Heading` |
| ≡ | Unordered list | - | `- item` |
| 1. | Ordered list | - | `1. item` |
| > | Blockquote | - | `> quote` |
| `` ``` `` | Code block | - | ` ```\ncode\n``` ` |
| --- | Horizontal rule | - | `---` |
| 🔗 | Insert link | - | `[text](url)` |
| 🖼️ | Insert image | - | `![alt](url)` |
| 🎥 | Insert video | - | `<video src="...">` |
| 🎵 | Insert audio | - | `<audio src="...">` |
| ↶ | Undo | Ctrl+Z | - |
| ↷ | Redo | Ctrl+Y/Cmd+Shift+Z | - |
| # | Toggle line numbers | - | - |
| 👁️ | Preview toggle | - | - |

---

## URL Query State (documentManagementUi.ts)

```
/document-management?scope=my_library&sort=updated_desc&mode=editor&doc=42&q=search&type=markdown

- scope:  "my_library" | "my_drive" | "my_onedrive" | "shared_with_me" | "shared_groups" | "trash"
- sort:   "updated_desc" | "created_desc"
- mode:   "library" | "editor"
- doc:    document ID (numeric)
- q:      search query string
- type:   item type filter (e.g., "markdown", "image")
- status: status filter (e.g., "ready", "indexing")
- folder: folder ID (for navigation within library)
```

---

## Error Handling

| Error | Cause | Resolution |
|-------|-------|-----------|
| LibraryMarkdownVersionConflictError | expectedUpdatedAt mismatch | Refresh content, show conflict dialog |
| LibraryUrlValidationError | Invalid sourceUrl/thumbnailUrl | Reject upload, show reason |
| TRPCError FORBIDDEN | Insufficient permissions | Show "Access denied" |
| TRPCError NOT_FOUND | Item doesn't exist | Show "Item deleted or moved" |
| TRPCError BAD_REQUEST | Invalid input | Show validation error |

---

## Performance Notes

- **Caching:** TanStack Query default 5-min stale time
- **Vector search:** Depends on pgvector indexing (async re-index job)
- **Chunk limits:** No hard limit (PostgreSQL text column), but consider pagination for large files
- **Version retention:** Unlimited by default (consider archive/purge strategy)
- **Re-index throttling:** Prevents overwhelming Python backend

---

## Files to Modify (for Tiptap Replacement)

### Must Modify
1. MarkdownFileEditor.tsx — Replace CodeMirror with Tiptap
2. CodeMirrorEditor.tsx — Can keep for code files, or replace with Tiptap
3. DocumentManagement.tsx — Update editor props/handling

### May Modify
4. SafeMarkdown.tsx — If storing Tiptap JSON instead of markdown
5. DocumentPreviewPanel.tsx — If switching preview mechanism
6. MarkdownFileEditor props interface — Add/remove Tiptap-specific props

### Do NOT Modify
- library.ts router — Uses existing APIs
- libraryService.ts — All CRUD operations
- Database schema — No changes needed
- DocumentVersionHistory.tsx — Works with any content type
- Permission system — Inherited from tRPC

