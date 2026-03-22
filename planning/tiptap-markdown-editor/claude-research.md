# Research: Tiptap Single-Panel Markdown Editor

## 1. DocumentManagement.tsx — Full State Audit

**File**: `apps/web/client/src/pages/DocumentManagement.tsx` (2344+ lines)

### Key useState Hooks

| Hook | Line | Type | Purpose |
|------|------|------|---------|
| `markdownDraftByDocId` | 150 | `Record<number, MarkdownDraftState>` | Maps docId → {value, savedValue, updatedAt} |
| `isLibraryPanelOpen` | 153 | `boolean` | Left sidebar visibility |
| `isMarkdownPreviewPanelOpen` | 154 | `boolean` | Preview panel (TO BE REMOVED) |
| `isEditorPanelCollapsed` | 155 | `boolean` | Editor panel collapse |
| `isPreviewExpanded` | 156 | `boolean` | Preview expanded (TO BE REMOVED) |
| `libraryPanelWidth` | 161 | `number` | Left panel width (px, min 320) |
| `previewPanelWidth` | 162 | `number` | Preview panel width (TO BE REMOVED) |
| `mobileTab` | 170 | `"library" \| "editor" \| "preview"` | Mobile tab state |
| `openEditorTabs` | 172-185 | `DocumentEditorTab[]` | Open editor tabs with persistence |

### MarkdownDraftState Interface (Line 89-93)

```typescript
interface MarkdownDraftState {
  value: string;           // Current editor content
  savedValue: string;      // Last saved content (for dirty check)
  updatedAt?: string;      // Server's last update timestamp
}
```

### Dirty State System

- **`isEditorTabDirty(tabId)`** (line 375): Returns `draft.value !== draft.savedValue`
- **`hasUnsavedTabs`** (line 382): Memo checking any open tab is dirty
- **`beforeunload` guard** (lines 386-396): Prevents closing browser with unsaved changes
- **Tab-close confirmation** (line 484): Uses `closeDocumentEditorTab()` with dirty check
- **Dirty-dot indicator** (line 1680): Shows `*` on tab with unsaved changes

### Resize Handle System

Constants (lines 95-100):
- `MIN_LIBRARY_PANEL_WIDTH = 320`
- `MIN_PREVIEW_PANEL_WIDTH = 320`
- `MIN_EDITOR_PANEL_WIDTH = 420`
- `COLLAPSED_PANEL_WIDTH = 72`

`activeResizeRef` (lines 122-130): Tracks panel being resized, start positions, container width.

### Split-Panel Code to Remove

| Item | Line(s) | Action |
|------|---------|--------|
| `isMarkdownPreviewPanelOpen` | 154 | DELETE |
| `isPreviewExpanded` | 156 | DELETE |
| `previewPanelWidth` | 162 | DELETE |
| `isPreviewFullWidth` derived | 1082 | DELETE |
| Desktop SafeMarkdown preview | ~2232-2245 | DELETE |
| Mobile preview tab | ~1754-1760 | DELETE |
| Resize handle (preview) | ~1097-1108 | DELETE |
| `onEnterEditMode` (opens preview) | 2196 | CHANGE |

---

## 2. DocumentPreviewPanel.tsx — Integration Audit

**File**: `apps/web/client/src/components/library/DocumentPreviewPanel.tsx` (628 lines)

### MarkdownFileEditor Lazy Load (Line 21)

```typescript
const MarkdownFileEditor = lazy(() => import("./MarkdownFileEditor"));
```

### Props Passed to MarkdownFileEditor (Lines 297-311)

| Prop | Type | Purpose |
|------|------|---------|
| `value` | `string` | Markdown content |
| `onChange` | `(value: string) => void` | Draft value changed |
| `onSave` | `() => void` | Save button clicked |
| `onVersionRestore` | `() => void` | Version restored |
| `onEnterEditMode` | `() => void` | Entered edit mode |
| `updatedAt` | `string` | Server timestamp |
| `isSaving` | `boolean` | Save in-progress |
| `errorMessage` | `string` | Save error |
| `fullHeight` | `boolean` | Use 70vh |
| `editorOnly` | `boolean` | Hide split view |
| `documentId` | `number` | For version history |

### Header Structure (Lines 173-294)

- Title editing (isEditingTitle, Input + Save/Cancel)
- Badge row (item_type + status)
- Action buttons: DocumentVersionHistory (non-markdown), Upload, Share, Download

**Key**: Header ownership stays with DocumentPreviewPanel — UnifiedDocumentSurface gets only EditorToolbar.

---

## 3. MarkdownFileEditor.tsx — Complete Audit

**File**: `apps/web/client/src/components/library/MarkdownFileEditor.tsx` (937 lines)

### Split-Panel States (Lines 81-83)

```typescript
const [editorCollapsed, setEditorCollapsed] = useState(false);
const [previewCollapsed, setPreviewCollapsed] = useState(false);
const [isEditMode, setIsEditMode] = useState(false);
```

### Media Insertion Functions

**insertImageFromLibrary** (line 219-226): `![alt](url)` markdown syntax
**insertVideoFromLibrary** (line 228-234): `<video src="..." controls width="100%" style="..."></video>` HTML
**insertAudioFromLibrary** (line 236-243): `**title**\n<audio src="..." controls style="..."></audio>` HTML

### editorOnly Mode (Lines 295-596)

When `editorOnly=true`: Single view with Edit/View toggle — NO split pane.
- View mode: SafeMarkdown preview
- Edit mode: Toolbar + CodeMirror

### CodeMirror onChange

Direct pass-through: `onChange={onChange}` prop on CodeMirrorEditor.

---

## 4. SafeMarkdown.tsx — Media Handling

**File**: `apps/web/client/src/components/chat/SafeMarkdown.tsx` (347 lines)

### DOMPurify Config (Lines 66-73)

```typescript
DOMPurify.sanitize(sanitized, {
  ALLOWED_TAGS,
  ALLOWED_ATTR,
  ALLOW_DATA_ATTR: false,     // ← Must add ADD_ATTR for data-poster etc.
  ADD_ATTR: ["target"],        // ← Extend this
  FORBID_TAGS: ["style", "script", "iframe", "object", "embed", "form", "input"],
});
```

### MediaPart Type (Lines 205-208)

```typescript
type MediaPart =
  | { kind: "text"; value: string }
  | { kind: "video"; src: string }   // ← Must add poster?, caption?, assetId?
  | { kind: "audio"; src: string };  // ← Must add poster?, caption?, assetId?
```

### MEDIA_TAG_REGEX (Line 210)

```typescript
const MEDIA_TAG_REGEX = /<(video|audio)\b[^>]*\bsrc="([^"]*)"[^>]*>(?:<\/\1>)?/g;
```

Only captures 2 groups: tag name + src. Does NOT capture data-* attributes.

### splitByMedia() (Lines 212-236)

Bypasses DOMPurify entirely for media tags. Splits content into text/video/audio parts. Only preserves `src` attribute — all `data-*` attributes are lost.

**Phase 3 Fix Required**: Widen MediaPart type + extend regex to capture data-poster, data-caption, data-asset-id.

---

## 5. Library Router — Key tRPC Procedures

**File**: `apps/web/server/routers/library.ts`

### getMarkdownContent (Lines 345-365)

```typescript
Input:  z.object({ id: z.number().int().positive() })
Output: { id, content: string, updatedAt: string, version?: number }
```

### saveMarkdown (Lines 367-430)

```typescript
Input: z.object({
  id: z.number().int().positive(),
  content: z.string().max(5_000_000),
  expectedUpdatedAt: z.coerce.date().optional(),  // Optimistic lock
  changeDescription: z.string().max(500).optional(),
})
Output: { item, indexJob, versionNumber? }
Error:  LibraryMarkdownVersionConflictError (if expectedUpdatedAt mismatch)
```

### listDocuments (Lines 179-213)

```typescript
Input: z.object({
  query: z.string().optional(),
  filters: { itemType?, status?, dates? },
  limit: z.number().max(50).optional(),
  offset: z.number().optional(),
  folderId: z.number().nullable().optional(),
})
Output: { results: DocumentLibraryItem[], total, hasMore }
```

---

## 6. Feature Flags System

**File**: `apps/web/shared/featureFlags.ts`

- Interface: `TenantFeatureFlags` (22 flags, F01-F22)
- Validation: `ALLOWED_FEATURE_FLAGS` Set
- Defaults: `FEATURE_FLAG_DEFAULTS` (most false, costDisplay/personaSystem/orchestratorEnabled true)
- Convention: **camelCase** (e.g., `orchestratorEnabled`, `skillOrchestrator`)
- New flag needed: `tiptapEditorEnabled: boolean; // F23`

---

## 7. Testing Setup

**File**: `apps/web/vitest.config.ts`

- Framework: Vitest with React plugin
- Component tests: `jsdom` environment
- Server tests: `node` environment
- Path aliases: `@/`, `@shared/`, `@assets/`, `@db/`
- Setup file: `client/src/test-setup.ts`
- Run: `pnpm test` or `pnpm vitest run <path>`

---

## 8. Tiptap API Reference

### tiptap-markdown Package

```typescript
import { Markdown } from 'tiptap-markdown';
// Serialization: editor.storage.markdown.getMarkdown()
// Config: Markdown.configure({ html: true, transformPastedText: true })
```

**Limitations**:
- Tables: Multiple child nodes per cell lost in markdown round-trip
- Code blocks: Language tags preserved ✓
- Underline: Serializes as `<u>` HTML (not native markdown)

### Custom Node Views (React)

```typescript
import { ReactNodeViewRenderer } from '@tiptap/react';
import { NodeViewWrapper } from '@tiptap/react';

// Extension: addNodeView() { return ReactNodeViewRenderer(Component) }
// Component: receives { editor, node, selected, updateAttributes, deleteNode, getPos }
```

### Custom Attributes

```typescript
addAttributes() {
  return {
    src: { default: null, parseHTML: el => el.getAttribute('src') },
    poster: { default: null, parseHTML: el => el.getAttribute('data-poster') },
    caption: { default: '', parseHTML: el => el.getAttribute('data-caption') },
    assetId: { default: null, parseHTML: el => el.getAttribute('data-asset-id') },
  }
}
```

### React 19 Compatibility

- `useEditor({ immediatelyRender: false })` — recommended for StrictMode
- Known StrictMode double-invoke issues with ProseMirror lifecycle
- Generally works in practice; spike test recommended before Phase 1

### Paste Handling

```typescript
editorProps: {
  handlePaste(view, event, slice) {
    // Check for clipboard images
    const items = event.clipboardData?.items || [];
    for (const item of items) {
      if (item.type.includes('image')) {
        const file = item.getAsFile();
        uploadAndInsertImage(file);
        return true;
      }
    }
    return false;
  },
  transformPastedHTML(html) {
    return DOMPurify.sanitize(html, { ALLOWED_TAGS: [...] });
  },
}
```

### Editor Styling

```css
.tiptap-editor .ProseMirror {
  @apply text-base leading-relaxed;
  /* Heading, list, code, table, blockquote styles */
}
.tiptap-editor .ProseMirror p.is-editor-empty:first-child::before {
  content: attr(data-placeholder);
  @apply text-gray-400 float-left h-0 pointer-events-none;
}
```

---

## 9. Security Considerations

- `data-poster` with `javascript:` URL — must validate before using as `<video poster>`
- `transformPastedHTML` output must be DOMPurify-sanitized (not auto-applied)
- `ADD_ATTR` targeted approach (not blanket `ALLOW_DATA_ATTR: true`)
- Only uploaded/library assets for video sources (no arbitrary URLs)
