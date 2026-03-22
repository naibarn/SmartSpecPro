---
name: Document Editor Research Brief
description: Executive summary of current document editor architecture, ready for Tiptap planning
type: reference
---

# Research Brief: Document Editor / Library System

## Executive Summary

SmartSpecPro's document management system uses a **split-panel CodeMirror editor** with markdown preview, integrated into a larger library browser. The architecture is mature, with:

- **18 tRPC procedures** for document CRUD, versioning, sharing, and search
- **5 database tables** managing documents, content, history, permissions, and re-indexing jobs
- **Version history** with SHA256 dedup and optimistic locking (conflict detection)
- **Multi-tenant isolation** with row-level permissions
- **Async re-indexing** for search/RAG integration

A **Tiptap-based WYSIWYG replacement** is feasible and would integrate cleanly, but must preserve several load-bearing backend patterns.

---

## Findings

### Current Editor Architecture
1. **Frontend:** React component stack in `apps/web/client/src/components/library/`
   - DocumentManagement.tsx (1800 lines): 3-panel layout with library browser + editor + preview
   - MarkdownFileEditor.tsx (520 lines): CodeMirror wrapper + toolbar
   - CodeMirrorEditor.tsx (220 lines): Language detection + imperative API
   - SafeMarkdown.tsx (200 lines): XSS-safe markdown renderer

2. **Backend:** tRPC router + service layer in `apps/web/server/`
   - library.ts (1500 lines): 18 tRPC procedures
   - libraryService.ts (4500 lines): Core CRUD, versioning, permissions
   - Database: libraryItems, libraryChunks, libraryContentVersions, libraryPermissions, libraryIndexJobs

3. **State Management:** TanStack Query (caching) + React hooks (local UI state)

4. **Markdown Stack:**
   - **Editor:** @uiw/react-codemirror + @codemirror/lang-markdown
   - **Parser:** marked (v16.4.2)
   - **Renderer:** Streamdown + DOMPurify (XSS safe)

### How Documents Are Stored
**Two-location model (load-bearing):**
1. **libraryChunks[0]** (contentType="markdown_source")
   - Raw author-created markdown source
   - Read by `getLibraryMarkdownContent()` for editor display
2. **libraryContentVersions** (versioned snapshots)
   - SHA256 hash + full content + metadata
   - Version number auto-incremented
   - Deduplication: skip insert if hash exists

**Why split?** Indexing process:
- Chunk 0 = raw markdown (what user sees in editor)
- Other chunks = indexed text for RAG/search (created by Python backend)

### Current Capabilities
1. **Split-panel editing** — CodeMirror editor + live markdown preview (SafeMarkdown)
2. **Toolbar formatting** — Bold, italic, headings, lists, links, quotes, code blocks
3. **Media insertion** — Buttons to insert images/videos/audio from library into markdown
4. **Undo/Redo** — Full stack via CodeMirror commands
5. **Version history** — Browse past versions, restore with one click
6. **Permissions** — Share documents with read/write/delete/owner levels
7. **Multi-format support** — Markdown, code (JS/Python/JSON/YAML/SQL), images, videos, audio, PDFs, Excel
8. **Search** — Federated keyword + vector search (pgvector optional)
9. **Soft delete** — Move to trash, then either restore or permanently delete
10. **Tenant isolation** — Each tenant sees only their own items

### Key Backend APIs
| Operation | API | Endpoint | Load-Bearing |
|-----------|-----|----------|--------------|
| Fetch markdown | `getMarkdownContent(itemId)` | `library.getMarkdownContent` | YES — reads libraryChunks chunk 0 |
| Save markdown | `saveMarkdown(itemId, content, expectedUpdatedAt)` | `library.saveMarkdown` | YES — writes chunk 0 + version |
| Get versions | `getContentVersionHistory(itemId)` | `library.getContentVersionHistory` | YES — version restore depends on this |
| Restore version | `restoreContentVersion(itemId, versionNumber)` | `library.restoreContentVersion` | YES — triggers re-index |
| Browse items | `listDocuments(query, scope, filters)` | `library.listDocuments` | Used by media pickers in editor |
| Search items | `searchLibraryItems(query, filters)` | `library.search` | Federated search |
| Upload file | `uploadLibraryFile(...)` | `library.uploadFile` | Creates new item + enqueues index |
| Share | `shareLibraryItem(itemId, subjectType, ...)` | `library.shareItem` | Permissions enforcement |

### Routing & State Management
- **Route:** `/document-management`
- **Query params:** scope (my_library/shared/trash), sort, mode (library/editor), docId, query, filters
- **Tab interface:** Multiple documents open simultaneously (DocumentManagement manages tabs)
- **URL-driven state:** Users can bookmark editor states

### Current Limitations
1. **Split-panel only** — No true WYSIWYG (user reads markdown syntax)
2. **Manual save** — No autosave, requires clicking Save button
3. **No collaborative editing** — Single-user only
4. **No paste handling** — Users must manually format pasted text
5. **No keyboard shortcuts** — Limited Ctrl+S, no standard markdown shortcuts
6. **No embedded media preview** — Images/videos not visible in editor, only in preview

### What Tiptap Would Improve
1. **WYSIWYG editing** — True "What You See Is What You Get" with live formatting
2. **Extensible plugin system** — Custom nodes for embeds, mentions, code blocks, etc.
3. **Better mobile experience** — Touch-friendly UI, mobile-optimized toolbar
4. **Paste handling** — Intelligent detection of markdown, HTML, plain text
5. **Single-panel mode** — Preview always visible (optional, not side-by-side)
6. **Keyboard macros** — Built-in shortcuts (Ctrl+B for bold, Cmd+/ for command palette)
7. **AI integration hooks** — Custom nodes for AI suggestions, generated content
8. **Collaborative foundation** — Tiptap + Yjs support for multi-user editing (future)

---

## Current Architecture

### Frontend Data Flow
```
DocumentManagement.tsx (page)
  ├─ LibraryBrowser (tab panel)
  │  └─ DocumentGridList (grid view)
  │
  ├─ Editor (tab panel)
  │  └─ MarkdownFileEditor
  │     ├─ CodeMirrorEditor (editing)
  │     ├─ Toolbar (formatting buttons)
  │     ├─ Media pickers (images/videos/audio)
  │     └─ SafeMarkdown (preview)
  │
  └─ Preview (tab panel)
     └─ DocumentPreviewPanel (multi-format)
        ├─ SafeMarkdown (for markdown)
        ├─ img (for images)
        ├─ video tag (for videos)
        └─ [other viewers]
```

### Backend Data Flow (Save Operation)
```
MarkdownFileEditor.handleSave()
  ↓
trpc.library.saveMarkdown({
  itemId: 42,
  content: "new markdown text",
  expectedUpdatedAt: "2026-03-18T10:00:00Z"
})
  ↓
libraryService.saveLibraryMarkdown(input, actor)
  ├─ Check permissions (must have "write" or "owner")
  ├─ Check expectedUpdatedAt for race conditions
  ├─ Create libraryContentVersions entry (version 3)
  │  └─ SHA256 hash the content
  │  └─ Skip if identical to previous version (dedup)
  ├─ Update libraryChunks[0] contentType="markdown_source"
  ├─ Call buildLibraryIndexJobPayload() → enqueue re-index job
  └─ Return { item: LibraryItemDto, indexJob: LibraryEnqueueResult }
  ↓
UI updates timestamp, shows "Saved" message
  ↓
(Async) Python backend processes index job
  ├─ Extract searchable text from markdown
  ├─ Generate vector embeddings (if pgvector enabled)
  └─ Update libraryChunks text chunks
```

### Database Schema (Simplified)
```
libraryItems (metadata)
  ├─ id (primary key)
  ├─ tenantId (multi-tenant)
  ├─ ownerUserId
  ├─ itemType ("markdown", "image", "video", etc.)
  ├─ title, description
  ├─ status ("draft", "ready", "indexing", "archived")
  ├─ visibility ("private", "team", "public")
  ├─ sourceUrl (S3/R2 URL after upload)
  ├─ thumbnailUrl (generated thumbnail)
  └─ updatedAt (for optimistic locking)

libraryChunks (content storage)
  ├─ libraryItemId (FK)
  ├─ chunkIndex (0 = primary)
  ├─ content (raw text)
  ├─ contentType ("markdown_source" or "text")
  └─ [RAG fields: vectorRefId, isParent, parentChunkId]

libraryContentVersions (history)
  ├─ libraryItemId (FK)
  ├─ versionNumber (auto-increment)
  ├─ contentHash (SHA256, for dedup)
  ├─ content (full snapshot)
  ├─ changeDescription (user annotation)
  └─ createdByUserId

libraryPermissions (access control)
  ├─ libraryItemId (FK)
  ├─ subjectType ("user", "group", "tenant_role")
  ├─ subjectId
  ├─ permissionLevel ("read", "write", "delete", "owner")
  └─ expiresAt (optional time-limit)

libraryIndexJobs (re-indexing queue)
  ├─ libraryItemId (FK)
  ├─ jobType
  ├─ status ("pending", "processing", "completed", "failed")
  └─ [retry logic, error tracking]
```

---

## Risks & Constraints

### Load-Bearing Patterns (DO NOT BREAK)
1. **libraryChunks chunk 0, contentType="markdown_source"**
   - `getLibraryMarkdownContent()` reads here for editor display
   - If missing, editor shows empty content
   - Python indexer depends on this to distinguish raw vs. indexed text

2. **libraryContentVersions auto-increment + dedup**
   - Version numbers must be sequential per item
   - SHA256 hash must match to skip duplicate
   - Restore creates NEW version (doesn't overwrite)

3. **expectedUpdatedAt optimistic locking**
   - Prevents race condition if multiple edits happen simultaneously
   - New editor MUST fetch updatedAt before edit, pass it on save
   - Mismatch throws LibraryMarkdownVersionConflictError

4. **Tenant isolation**
   - ALL queries must filter by tenantId varchar(36)
   - No cross-tenant visibility
   - New editor inherits this from tRPC context

5. **Re-indexing enqueue**
   - After save, Python backend must process index job
   - buildLibraryIndexJobPayload() must be called
   - Search/RAG break if this is skipped

6. **Permission checks**
   - canReadLibraryItem() / canManageLibraryItem() / canDeleteLibraryItem()
   - New editor inherits these from tRPC context
   - Don't bypass or re-implement

### Implementation Risks
| Risk | Mitigation |
|------|-----------|
| Tiptap JSON vs. markdown storage | Use markdown for storage (convert on save), not Tiptap JSON. Preserves backward compat + search. |
| Breaking existing content | Validate that new editor can read old markdown + libraryChunks structure. |
| Version history integrity | Keep creating entries in libraryContentVersions. Validate hash + dedup logic. |
| Concurrent edit conflicts | Always pass expectedUpdatedAt from item.updatedAt. Handle conflicts gracefully. |
| Search/RAG index stale | Always enqueue re-index job after save. Test that index jobs run. |
| Media insertion broken | Reuse existing media picker UI or reimplement same libraryItemId → sourceUrl logic. |
| Permissions wrong | Don't re-implement permission checks. Inherit from tRPC. Test with different permission levels. |

---

## Recommendations

### Option A: Replace MarkdownFileEditor with Tiptap (Recommended)
1. Keep all backend APIs unchanged (library.ts, libraryService.ts)
2. Store content as markdown in libraryChunks chunk 0 (not Tiptap JSON)
   - On save: Tiptap JSON → markdown string → store
   - On read: markdown string → Tiptap JSON → render
3. Tiptap extensions:
   - Markdown syntax support (via `@tiptap/extension-markdown`)
   - Custom toolbar (optional, can reuse existing button set)
   - Custom media embed nodes (for images/videos/audio from library)
   - Custom code block node (syntax highlighting)
4. Optional single-panel mode: Show preview inline vs. side-by-side
5. Time: 3-4 weeks (design + implementation + testing)

### Option B: Parallel Implementation (Gradual Migration)
1. Build Tiptap editor in new component (TiptapMarkdownEditor.tsx)
2. Behind feature flag, allow users to opt-in
3. New editor uses same backend APIs as old
4. Eventually migrate all documents to Tiptap (optional)
5. Time: 4-5 weeks (extra testing + feature flag logic)

### Option C: Custom Editor (Not Recommended)
1. Build editor from scratch using contentEditable or similar
2. Full control over UX, but much higher maintenance
3. Time: 6-8 weeks + ongoing maintenance

**Recommendation: Option A** — Replace MarkdownFileEditor with Tiptap, store as markdown (not JSON), preserve all backend APIs. Fast to implement, easy to test, maintains backward compatibility.

---

## Open Questions

1. **Single-panel vs. split-panel?**
   - Current: 50% editor + 50% preview
   - Tiptap option: WYSIWYG (no preview needed) or keep split-panel?
   - Decision needed before implementation.

2. **Keyboard shortcuts?**
   - Which shortcuts to support? (Ctrl+B for bold, Ctrl+/ for command palette, etc.)
   - Should follow Markdown editor conventions or Google Docs?

3. **Media embedding in editor?**
   - Current: Toolbar buttons insert markdown `![alt](url)`, not visible in editor
   - Tiptap option: Show thumbnail in editor (requires custom node)
   - Decision: Visual or markdown syntax only?

4. **Collaborative editing?**
   - Tiptap + Yjs support is available but requires backend changes (WebSocket, doc binding)
   - Scope for future phase or out of scope?

5. **Content migration?**
   - Existing markdown stays as-is in storage
   - Do we need to "upgrade" old documents to Tiptap format?
   - Or just support reading old markdown, writing new Tiptap?

6. **Autosave vs. manual save?**
   - Current: Manual Save button
   - Tiptap option: Autosave with debounce?
   - Decision needed for UX.

7. **Code file support?**
   - Current: CodeFileEditor handles code files separately
   - Keep CodeMirror for code? Or migrate to Tiptap with code block node?

---

## Next Steps (Implementation Plan)

### Phase 1: Spike & Planning (1 week)
1. Evaluate Tiptap extensions (markdown, tables, code blocks, custom media embed)
2. Build proof-of-concept: Tiptap editor with library media picker
3. Verify markdown ↔ Tiptap JSON conversion lossless
4. Validate all existing test cases still pass

### Phase 2: Implementation (2 weeks)
1. Create TiptapMarkdownEditor.tsx
2. Integrate with DocumentManagement.tsx
3. Replace MarkdownFileEditor in MarkdownFileEditor route
4. Implement media insertion (images, videos, audio)
5. Add toolbar with formatting buttons
6. Test version history + restore

### Phase 3: Testing & Refinement (1 week)
1. End-to-end tests (save, restore, share, search)
2. Edge cases (concurrent edits, large files, permission changes)
3. Performance testing (load times, re-index)
4. UAT with team

### Phase 4: Rollout (1 week)
1. Feature flag for gradual adoption
2. Documentation + user guide
3. Monitor for regressions
4. Gather feedback, iterate

**Total: 5-6 weeks**

---

## Key Files to Review (In Order)

1. **MarkdownFileEditor.tsx** (520 lines) — Current editor implementation
2. **DocumentManagement.tsx** (1800 lines) — Page layout, state management
3. **library.ts** (1500 lines) — tRPC procedures
4. **libraryService.ts** (4500 lines) — Backend CRUD logic
5. **drizzle/schema.ts** (libraryItems, libraryChunks, libraryContentVersions)
6. **SafeMarkdown.tsx** (200 lines) — Markdown renderer (can be reused)

For detailed reference: See `DOCUMENT-EDITOR-ARCHITECTURE-AUDIT.md` and `DOCUMENT-EDITOR-QUICK-REF.md`.

