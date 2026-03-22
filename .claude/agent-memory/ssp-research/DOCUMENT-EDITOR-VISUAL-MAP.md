---
name: Document Editor Visual Architecture Map
description: Diagrams and visual representations of the document editor system
type: reference
---

# Document Editor — Visual Architecture Map

## Component Hierarchy

```
DocumentManagement.tsx (main page @ /document-management)
│
├─── LibraryBrowser (left panel, collapsible)
│    └─ DocumentLibraryTabs.tsx
│       ├─ DocumentGridList.tsx (grid view of items)
│       ├─ GoogleDriveBrowser.tsx (external drive)
│       ├─ OneDriveBrowser.tsx (external drive)
│       └─ TrashPanel.tsx (deleted items)
│
├─── Editor (center panel, collapsible, main focus)
│    └─ MarkdownFileEditor.tsx ⭐ [TARGET FOR TIPTAP]
│       ├─ CodeMirrorEditor.tsx (the actual editor)
│       │  └─ @uiw/react-codemirror (CodeMirror wrapper)
│       │     └─ @codemirror/lang-markdown (syntax highlighting)
│       │
│       ├─ Toolbar (formatting buttons)
│       │  ├─ Bold, Italic, Underline, Code
│       │  ├─ Headings (H1-H4), Lists (ordered/unordered)
│       │  ├─ Quote, Code fence, Horizontal rule
│       │  ├─ Link, Image, Video, Audio insertion
│       │  ├─ Undo/Redo buttons
│       │  └─ Line numbers toggle
│       │
│       ├─ ImagePicker (modal)
│       │  └─ trpc.library.listDocuments({ itemType: "image" })
│       │
│       ├─ VideoPicker (modal)
│       │  └─ trpc.library.listDocuments({ itemType: "video" })
│       │
│       └─ AudioPicker (modal)
│          └─ trpc.library.listDocuments({ itemType: "audio" })
│
└─── Preview (right panel, collapsible)
     └─ DocumentPreviewPanel.tsx
        ├─ SafeMarkdown.tsx (for markdown files)
        │  └─ marked (v16.4.2) + DOMPurify
        ├─ <img> (for image files)
        ├─ <video> tag (for video files)
        ├─ <audio> tag (for audio files)
        ├─ PDF viewer (for PDF files)
        ├─ Excel viewer (for XLSX files)
        ├─ CSVViewer (for CSV files)
        ├─ JSONViewer (for JSON files)
        ├─ CodeViewer (for code files)
        └─ Fallback (for unsupported types)
```

---

## Data Flow: Reading Markdown Content

```
User clicks document in library
   ↓
DocumentManagement.tsx mounts MarkdownFileEditor
   ↓
trpc.library.getMarkdownContent.useQuery(itemId)
   ↓
┌─────────────────────────────────────────────────┐
│ Backend: library.ts                              │
│ ────────────────────────────────────────────────  │
│ library.getMarkdownContent(itemId)               │
│  → libraryService.getLibraryMarkdownContent()    │
└─────────────────────────────────────────────────┘
   ↓
┌─────────────────────────────────────────────────┐
│ libraryService.ts                                │
│ ──────────────────────────────────────────────── │
│ SELECT content FROM libraryChunks WHERE:         │
│  · libraryItemId = ?                             │
│  · chunkIndex = 0  ⭐ (CRITICAL)                │
│  · contentType = 'markdown_source' ⭐ (CRITICAL)│
└─────────────────────────────────────────────────┘
   ↓
┌─────────────────────────────────────────────────┐
│ Database: libraryChunks                          │
│ ──────────────────────────────────────────────── │
│ Row: {                                           │
│   id: 1001,                                      │
│   libraryItemId: 42,                             │
│   chunkIndex: 0,  ← Original markdown only       │
│   content: "# My Document\n\nThis is content",   │
│   contentType: "markdown_source"  ← Not indexed  │
│ }                                                │
│                                                  │
│ Rows 1002-1010 (chunkIndex 1+):                  │
│ {                                                │
│   contentType: "text"  ← Indexed for RAG         │
│ }                                                │
└─────────────────────────────────────────────────┘
   ↓
Return: { item_id: 42, content: "# My Document...", updated_at: "2026..." }
   ↓
MarkdownFileEditor receives value prop
   ↓
CodeMirrorEditor renders with syntax highlighting
   ↓
SafeMarkdown renders preview (marked + DOMPurify)
```

---

## Data Flow: Saving Markdown Content

```
User edits markdown in CodeMirrorEditor
   ↓
onChange handler updates local state: value = "new content"
   ↓
User clicks "Save Changes" button
   ↓
handleSave() calls: trpc.library.saveMarkdown.useMutation()
   ↓
┌──────────────────────────────────────────────────────┐
│ Frontend Request                                     │
│ ──────────────────────────────────────────────────── │
│ {                                                    │
│   itemId: 42,                                        │
│   content: "# My Document\n\nUpdated content",       │
│   expectedUpdatedAt: "2026-03-18T10:15:00Z" ← OLD   │
│ }                                                    │
└──────────────────────────────────────────────────────┘
   ↓
┌──────────────────────────────────────────────────────┐
│ Backend: library.ts                                  │
│ ──────────────────────────────────────────────────── │
│ library.saveMarkdown(itemId, content, expectedUpdatedAt)
│  → libraryService.saveLibraryMarkdown()             │
└──────────────────────────────────────────────────────┘
   ↓
┌──────────────────────────────────────────────────────┐
│ libraryService.ts: saveLibraryMarkdown()            │
│ ──────────────────────────────────────────────────── │
│ 1. Fetch current item from DB                       │
│ 2. Check permissions: canManageLibraryItem()?       │
│ 3. Verify optimistic lock:                          │
│    item.updatedAt == expectedUpdatedAt? ← COMPARE   │
│    NO → throw LibraryMarkdownVersionConflictError   │
│ 4. Create content version:                          │
│    SHA256(content) → contentHash                    │
│    versionNumber = prevNumber + 1                   │
│    Check if hash already exists (dedup)? → skip     │
│    INSERT into libraryContentVersions               │
│ 5. Update markdown source:                          │
│    UPDATE libraryChunks SET content = ?             │
│    WHERE libraryItemId = 42                         │
│    AND chunkIndex = 0                               │
│    AND contentType = 'markdown_source'              │
│ 6. Enqueue re-indexing:                             │
│    buildLibraryIndexJobPayload() → libraryIndexJobs │
│    Python backend will process async                │
│ 7. Update item timestamp:                           │
│    UPDATE libraryItems SET updatedAt = NOW()        │
└──────────────────────────────────────────────────────┘
   ↓
┌──────────────────────────────────────────────────────┐
│ Database State After Save                            │
│ ──────────────────────────────────────────────────── │
│ libraryItems[42]:                                    │
│   updatedAt = "2026-03-18T10:20:00Z" (NEW TIME)     │
│                                                      │
│ libraryChunks:                                       │
│   NEW: {chunkIndex: 0, content: "Updated...",       │
│         contentType: "markdown_source"}              │
│                                                      │
│ libraryContentVersions:                              │
│   NEW: {versionNumber: 3, contentHash: "abc123...", │
│         content: "Updated...", createdAt: "2026..."} │
│                                                      │
│ libraryIndexJobs:                                    │
│   NEW: {status: "pending", libraryItemId: 42}       │
│         (Python backend will process this)           │
└──────────────────────────────────────────────────────┘
   ↓
Return: { item: LibraryItemDto, indexJob: LibraryEnqueueResult }
   ↓
Frontend updates UI:
   ├─ Update timestamp in editor
   ├─ Update savedValue (mark as clean)
   ├─ Show "Saved" toast
   └─ Disable Save button (content matches saved)
```

---

## Data Flow: Restoring Version

```
User clicks "Restore" on old version in DocumentVersionHistory
   ↓
trpc.library.restoreContentVersion.useMutation()
   ↓
┌──────────────────────────────────────────────────────┐
│ Backend: library.ts                                  │
│ ──────────────────────────────────────────────────── │
│ library.restoreContentVersion(itemId, versionNumber)│
│  → libraryService.restoreContentVersion()           │
└──────────────────────────────────────────────────────┘
   ↓
┌──────────────────────────────────────────────────────┐
│ libraryService.ts: restoreContentVersion()          │
│ ──────────────────────────────────────────────────── │
│ 1. Fetch old version from libraryContentVersions    │
│    WHERE versionNumber = ? (e.g., 1)                │
│ 2. Get old content: "# My Document\n\nOld content"  │
│ 3. Create NEW version (not overwrite):              │
│    versionNumber = prevNumber + 1 (e.g., 4)         │
│    content = oldContent                             │
│    changeDescription = "Restored from version 1"    │
│    INSERT into libraryContentVersions               │
│ 4. Update libraryChunks chunk 0 with restored text  │
│ 5. Enqueue re-indexing job                          │
│ 6. Update libraryItems.updatedAt = NOW()            │
└──────────────────────────────────────────────────────┘
   ↓
Return: { item: LibraryItemDto, indexJob: LibraryEnqueueResult }
   ↓
Frontend:
   ├─ MarkdownFileEditor updates with old content
   ├─ Show "Restored from version 1" message
   └─ Refresh DocumentVersionHistory to show new version 4
```

---

## API Endpoint Map

```
┌─────────────────────────────────────────────────────┐
│ tRPC Router: library                                │
│ ═════════════════════════════════════════════════════│
│                                                     │
│ READ OPERATIONS:                                    │
│ ├─ getMarkdownContent(itemId)                       │
│ │  ↓ Used by: MarkdownFileEditor mount              │
│ │  ↓ Returns: { item_id, content, updated_at }     │
│ │                                                   │
│ ├─ getById(itemId)                                  │
│ │  ↓ Fetch single item metadata                     │
│ │                                                   │
│ ├─ listDocuments(query, scope, filters)             │
│ │  ↓ Used by: Media pickers (image/video/audio)   │
│ │  ↓ Returns: { results, total, limit, offset }    │
│ │                                                   │
│ ├─ search(query, filters)                           │
│ │  ↓ Federated keyword + vector search              │
│ │                                                   │
│ ├─ getContentVersionHistory(itemId, limit, offset)  │
│ │  ↓ Used by: DocumentVersionHistory component     │
│ │                                                   │
│ ├─ getContentVersionById(versionId)                 │
│ │  ↓ Fetch specific version content                 │
│ │                                                   │
│ ├─ listTrash(scope, limit, offset)                  │
│ │  ↓ Show deleted items in trash panel              │
│ │                                                   │
│ ├─ listShares(itemId)                               │
│ │  ↓ Show who has access to document                │
│ │                                                   │
│ WRITE OPERATIONS:                                   │
│ ├─ saveMarkdown(itemId, content, expectedUpdatedAt)│
│ │  ↓ CRITICAL: Create version + update chunk 0     │
│ │  ↓ Returns: { item, indexJob }                   │
│ │                                                   │
│ ├─ restoreContentVersion(itemId, versionNumber)     │
│ │  ↓ Revert to old version (creates new version)   │
│ │                                                   │
│ ├─ updateItem(itemId, { title?, description?, ...})│
│ │  ↓ Update metadata only (not content)             │
│ │                                                   │
│ ├─ uploadFile(fileName, fileBase64, ...)            │
│ │  ↓ Upload new document                            │
│ │  ↓ Returns: { item, storageKey, indexJob }       │
│ │                                                   │
│ ├─ replaceFile(itemId, fileBase64, ...)             │
│ │  ↓ Replace existing file (creates new version)    │
│ │                                                   │
│ DELETE OPERATIONS:                                  │
│ ├─ softDeleteItem(itemId)                           │
│ │  ↓ Move to trash (set deletedAt)                  │
│ │                                                   │
│ ├─ restoreFromTrash(itemId)                         │
│ │  ↓ Recover from trash (clear deletedAt)           │
│ │                                                   │
│ ├─ permanentDeleteItem(itemId)                      │
│ │  ↓ Hard delete (cannot recover)                   │
│ │                                                   │
│ SHARING:                                            │
│ ├─ shareItem(itemId, subjectType, subjectId, level)│
│ │  ↓ Grant access to user/group                     │
│ │                                                   │
│ ├─ updateSharePermission(itemId, subjectId, level)  │
│ │  ↓ Change permission level                        │
│ │                                                   │
│ ├─ deleteShare(itemId, subjectId)                   │
│ │  ↓ Revoke access                                  │
│ │                                                   │
└─────────────────────────────────────────────────────┘
```

---

## Database Schema (Simplified View)

```
┌──────────────────────────────┐
│ libraryItems                 │ Main document metadata
├──────────────────────────────┤
│ id (PK)                      │
│ tenantId (fk)                │ ← Multi-tenant isolation
│ ownerUserId (fk)             │
│ parentId (self-fk, nullable) │ ← Folders
│ itemType (varchar)           │ "markdown", "image", etc.
│ title (varchar)              │
│ description (text)           │
│ status (enum)                │ "draft", "ready", "indexing"
│ visibility (enum)            │ "private", "team", "public"
│ sourceUrl (text)             │ S3/R2 URL
│ thumbnailUrl (text)          │ Generated thumbnail
│ metadata (json)              │ Flexible data
│ createdAt, updatedAt (ts)    │
│ deletedAt (ts, nullable)     │ ← Soft delete
└──────────────────────────────┘
           │ 1:N
           │
           ├──────────────────────────────┐
           │                              │
      ┌────▼─────────────────────┐   ┌──▼──────────────────────────┐
      │ libraryChunks            │   │ libraryContentVersions       │
      │ Content storage          │   │ Version history              │
      ├──────────────────────────┤   ├──────────────────────────────┤
      │ id (PK)                  │   │ id (PK)                      │
      │ libraryItemId (fk)       │   │ libraryItemId (fk)           │
      │ chunkIndex (int)         │   │ versionNumber (int)          │
      │ content (text)           │   │ contentHash (varchar, sha256)│
      │ contentType (varchar)    │   │ content (text)               │
      │ ↕ critical: chunk 0 =    │   │ changeDescription (text)     │
      │   "markdown_source"      │   │ createdByUserId (fk)         │
      │ tokenCount (int)         │   │ createdAt (ts)               │
      │ vectorRefId (varchar)    │   │
      │ [RAG fields]             │   │ Deduplication: if contentHash│
      │                          │   │ matches prev, skip insert    │
      └──────────────────────────┘   │                              │
                                      │ Version sequence:            │
                                      │ 1. "Initial content"         │
                                      │ 2. "Updated section"         │
                                      │ 3. "Fixed typo"              │
                                      │ 4. "Restored from version 1" │
                                      └──────────────────────────────┘

           │ 1:N
           │
      ┌────▼─────────────────────┐
      │ libraryPermissions       │
      │ Access control           │
      ├──────────────────────────┤
      │ id (PK)                  │
      │ libraryItemId (fk)       │
      │ subjectType (varchar)    │
      │ subjectId (varchar)      │ "user", "group", "tenant_role"
      │ permissionLevel (varchar)│ "read", "write", "delete", "owner"
      │ expiresAt (ts, nullable) │
      └──────────────────────────┘

           │ 1:N
           │
      ┌────▼──────────────────────────┐
      │ libraryIndexJobs              │
      │ Re-indexing queue              │
      ├───────────────────────────────┤
      │ id (PK)                       │
      │ libraryItemId (fk)            │
      │ jobType (varchar)             │
      │ status (enum)                 │ "pending", "processing",
      │ attemptCount, maxAttempts     │ "completed", "failed"
      │ [retry logic, error tracking] │
      └───────────────────────────────┘
```

---

## State Flow in React

```
DocumentManagement.tsx (parent)
│
├─ State:
│  ├─ queryState: { scope, sort, mode, docId, ... } (from URL)
│  ├─ selectedDocId: number | undefined
│  ├─ openTabs: DocumentEditorTab[] (multiple docs open)
│  └─ libraryPanelCollapsed: boolean
│
├─ useQuery Results:
│  ├─ documentListQuery: { results, total, ... }
│  └─ selectedDocumentQuery: { item_id, content, updated_at }
│
└─ Derived State:
   ├─ MarkdownFileEditor (when mode = "editor" && docId set)
   │  └─ Props: { value, onChange, onSave, documentId, ... }
   │     └─ State:
   │        ├─ value: string (current edit)
   │        ├─ savedValue: string (last saved)
   │        ├─ isDirty: value !== savedValue
   │        ├─ editorCollapsed: boolean
   │        ├─ previewCollapsed: boolean
   │        └─ imagePickerOpen: boolean
   │
   ├─ useMutation Results:
   │  ├─ saveMarkdownMutation: { mutate, isPending, ... }
   │  └─ restoreVersionMutation: { mutate, isPending, ... }
   │
   └─ Effects:
      ├─ When selectedDocumentQuery data arrives → populate MarkdownFileEditor value
      └─ When user saves → saveMarkdownMutation() → update savedValue on success
```

---

## Permission Check Flow

```
trpc.library.saveMarkdown called
   ↓
tRPC context middleware:
   ├─ Verify JWT token is valid
   ├─ Extract userId + tenantId
   └─ Pass as actor object { userId, tenantId, role? }
   ↓
libraryService.saveLibraryMarkdown(input, actor)
   ├─ Fetch item from DB (and check it's not deleted)
   │  └─ SELECT * FROM libraryItems WHERE id = ? AND deletedAt IS NULL
   │
   ├─ Call getUserPermissionLevel(db, itemId, actor)
   │  ├─ Check item visibility:
   │  │  ├─ visibility = "public" → permissionLevel = "read"
   │  │  ├─ visibility = "team" + same tenant → permissionLevel = "read"
   │  │  ├─ visibility = "private" → only owner or explicit share
   │  │
   │  ├─ Check explicit shares:
   │  │  └─ SELECT * FROM libraryPermissions WHERE
   │  │     libraryItemId = ? AND
   │  │     (subjectId = userId OR subjectId IN userGroups OR...)
   │  │
   │  └─ Return highest permission level
   │
   ├─ Call canManageLibraryItem(item, actor, permissionLevel)
   │  ├─ Required: permissionLevel = "write" OR "owner"
   │  ├─ OR: ownerUserId = userId
   │  └─ Return true/false
   │
   ├─ If NOT canManage → throw TRPCError(code: "FORBIDDEN")
   │  └─ UI shows "You don't have permission to edit this document"
   │
   └─ Proceed with save if authorized
```

---

## File Size & Complexity Metrics

```
Frontend Components
├─ DocumentManagement.tsx              1800 lines (main page)
├─ MarkdownFileEditor.tsx               520 lines (editor + toolbar)
├─ CodeMirrorEditor.tsx                 220 lines (wrapper)
├─ DocumentPreviewPanel.tsx             300 lines (multi-format)
├─ DocumentGridList.tsx                 400 lines (list view)
├─ SafeMarkdown.tsx                     200 lines (renderer)
├─ DocumentLibraryTabs.tsx              200 lines (tabs)
├─ DocumentVersionHistory.tsx           150 lines (history)
└─ (other library components)          1500+ lines

   Total: ~5500 lines of React

Backend Routes & Services
├─ server/routers/library.ts           1500 lines (tRPC procedures)
├─ server/services/libraryService.ts   4500 lines (core logic)
├─ server/services/libraryUrlPolicy.ts  300 lines (URL validation)
└─ server/storage.ts                    200 lines (S3/R2 interface)

   Total: ~6500 lines of Node.js/TypeScript

Database
├─ libraryItems table                  ~15 columns, 6 indexes
├─ libraryChunks table                 ~10 columns, 4 indexes
├─ libraryContentVersions table        ~9 columns, 2 indexes
├─ libraryPermissions table            ~6 columns, 2 indexes
├─ libraryIndexJobs table              ~9 columns, 1 index
└─ [5 more related tables]

   Total: ~10 tables, ~80 columns, ~50 indexes

Dependencies
├─ @uiw/react-codemirror               (editor)
├─ @codemirror/lang-markdown           (syntax)
├─ marked                              (markdown parser)
├─ DOMPurify                           (XSS safety)
├─ TanStack Query                      (data fetching)
└─ [50+ others]
```

---

## Tiptap Integration Points

```
MarkdownFileEditor.tsx (REPLACE CODEMIRROR)
   │
   ├─ Current: CodeMirrorEditor wrapper
   │  └─ Uses: @uiw/react-codemirror, @codemirror/lang-markdown
   │
   └─ Future: TiptapEditor wrapper
      └─ Uses: @tiptap/react, @tiptap/core, @tiptap/extension-*
      │
      ├─ Extension: StarterKit (basic formatting)
      ├─ Extension: Markdown (markdown parsing/serialization)
      ├─ Extension: CodeBlockLowlight (syntax highlighting)
      ├─ Custom Extension: LibraryImage (insert from library)
      ├─ Custom Extension: LibraryVideo (insert from library)
      ├─ Custom Extension: LibraryAudio (insert from library)
      └─ Custom Extension: MediaEmbed (optional, render in editor)

   │
   ├─ Props remain unchanged:
   │  ├─ value: string (markdown)
   │  ├─ onChange: (value: string) => void
   │  └─ onSave: () => void
   │
   ├─ Backend APIs unchanged:
   │  ├─ trpc.library.getMarkdownContent() [reads markdown]
   │  ├─ trpc.library.saveMarkdown() [saves markdown]
   │  └─ [all version history APIs]
   │
   ├─ Storage unchanged:
   │  └─ libraryChunks chunk 0 contentType="markdown_source" (markdown string)
   │
   └─ Preview unchanged:
      └─ SafeMarkdown.tsx (existing component works with markdown)

┌─────────────────────────────────────────────────────────────┐
│ Conversion Flow (if storing Tiptap JSON)                     │
│ ──────────────────────────────────────────────────────────── │
│                                                              │
│ On Save:                                                    │
│  Tiptap editor.getJSON()                                    │
│    ↓ convert                                                 │
│  Markdown string (via @tiptap/extension-markdown)           │
│    ↓                                                         │
│  trpc.library.saveMarkdown(markdown)                         │
│    ↓                                                         │
│  Save to libraryChunks chunk 0                               │
│                                                              │
│ On Read:                                                    │
│  trpc.library.getMarkdownContent()                           │
│    ↓                                                         │
│  Markdown string from libraryChunks                          │
│    ↓ convert                                                 │
│  Tiptap editor.setContent(json)                              │
│    ↓                                                         │
│  Render in editor                                            │
│                                                              │
│ Alternative: Store Markdown only (simpler)                  │
│  · No JSON conversion needed                                 │
│  · Easier for backward compat                                │
│  · Search/RAG still works                                    │
│  · Tiptap converts markdown on read (getMarkdown API)        │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## Error Handling Flow

```
User saves markdown
   ↓
trpc.library.saveMarkdown() called
   ↓
Try:
  ├─ Validate input (itemId, content)
  ├─ Fetch item (check exists)
  ├─ Check permissions (canManageLibraryItem?)
  ├─ Check expectedUpdatedAt == item.updatedAt?
  │  NO → throw LibraryMarkdownVersionConflictError
  │
  ├─ Create version in DB
  │  └─ On conflict (dedup) → silently skip
  │
  ├─ Update chunk 0 with new content
  ├─ Enqueue re-index job
  ├─ Update item.updatedAt
  │
  └─ Success → Return { item, indexJob }

Catch:
  ├─ LibraryMarkdownVersionConflictError
  │  └─ UI shows "Document was modified elsewhere. Refresh to see latest."
  │     Show merge dialog or force overwrite button
  │
  ├─ TRPCError(FORBIDDEN)
  │  └─ UI shows "You don't have permission to edit this document"
  │
  ├─ TRPCError(NOT_FOUND)
  │  └─ UI shows "Document not found or was deleted"
  │
  ├─ TRPCError(BAD_REQUEST)
  │  └─ UI shows validation error message
  │
  └─ Unknown error
     └─ Toast: "Failed to save. Please try again."
        Log to error tracking (Sentry)
```

