# Section 03: Editor Surface -- TiptapEditor, UnifiedDocumentSurface, and SourceModePanel

## Overview

This section creates the three core editor components that form the main editing surface:

1. **`TiptapEditor.tsx`** -- the ProseMirror editing surface wrapped via `@tiptap/react`
2. **`UnifiedDocumentSurface.tsx`** -- the shell component managing View/Edit/Source modes, auto-save, and dirty state
3. **`SourceModePanel.tsx`** -- a thin wrapper around the existing `CodeMirrorEditor` for raw markdown editing

These components live in: `apps/web/client/src/components/editor/`.

### Dependencies on Prior Sections

- **Section 01 (Tiptap Setup)**: Tiptap packages must be installed and `editor.css` must exist with ProseMirror base styles.
- **Section 02 (Markdown Bridge)**: `TiptapMarkdownBridge.ts` must exist with working `parse()` and `serialize()` functions.

### What This Section Blocks

- Section 04 (Toolbar Modes) -- toolbar attaches to the editor instance from this section
- Section 05 (Slash Commands) -- slash commands attach to the Tiptap editor created here
- Section 10 (Page Integration) -- `UnifiedDocumentSurface` is the component that replaces `MarkdownFileEditor`

---

## Tests (Write First)

All test files use Vitest with `jsdom` environment.

### File: `apps/web/client/src/components/editor/UnifiedDocumentSurface.test.tsx`

```
# --- Mode Switching Tests ---

# Test: renders in View mode by default (editable: false)
# Test: clicking Edit button switches to Edit mode (editable: true, toolbar visible)
# Test: clicking Source button shows CodeMirror, hides Tiptap
# Test: switching Edit->Source serializes current content to markdown
# Test: switching Source->Edit re-parses markdown into Tiptap
# Test: switching Edit->View triggers auto-save callback
# Test: switching Source->View triggers auto-save callback
# Test: View mode hides toolbar formatting buttons
# Test: Edit mode shows toolbar formatting buttons
# Test: double-click in View mode enters Edit mode

# --- Auto-Save Tests ---

# Test: onContentChange fires when Tiptap content changes
# Test: auto-save fires 2 seconds after last change (debounce)
# Test: rapid typing only triggers one save (debounce working)
# Test: Ctrl+S triggers immediate save (bypasses debounce)
# Test: save status shows "Saving..." during save
# Test: save status shows "Saved" after successful save
# Test: save status shows "Unsaved changes" when dirty
# Test: save error shows error banner
# Test: auto-save does NOT fire in View mode
```

### File: `apps/web/client/src/components/editor/TiptapEditor.test.tsx`

```
# Test: renders ProseMirror editor with provided content
# Test: editable=false makes editor read-only
# Test: editable=true allows editing
# Test: onUpdate callback fires on content change
# Test: editor uses immediatelyRender: false for React 19 compatibility
# Test: editor applies .tiptap-editor CSS class to wrapper
```

---

## Implementation Details

### Shared Types (`types.ts`)

```typescript
export type { JSONContent } from "@tiptap/core";

export type EditorMode = "view" | "edit" | "source";

// CANONICAL definition — EditorToolbar (S04) MUST import from here, NOT redefine locally
export type SaveStatus = "clean" | "dirty" | "saving" | "saved" | "error" | "conflict";

export interface UnifiedDocumentSurfaceProps {
  initialContent: string;
  updatedAt?: string;              // Server timestamp for optimistic locking (expectedUpdatedAt in saveMarkdown)
  onContentChange?: (markdown: string) => void;
  onSave?: (markdown: string) => void;
  onVersionRestore?: () => void;
  onEnterEditMode?: () => void;
  isSaving?: boolean;
  errorMessage?: string;
  documentId?: number;
}
```

### TiptapEditor.tsx

Core ProseMirror surface. Key points:

- `useEditor()` with `immediatelyRender: false` (React 19 compatibility)
- Import `getDefaultExtensions()` from `TiptapMarkdownBridge.ts` (S02) as the base extension list — do NOT duplicate the extension array inline
- Append `Placeholder` and `createSlashCommandExtension()` (S05) to the base list
- `editable` prop toggles via `editor.setEditable()` in useEffect
- `onUpdate` fires on every transaction
- Wrap `EditorContent` in `div.tiptap-editor` for CSS scoping
- Import `editor.css` from Section 01

Props interface:

```typescript
interface TiptapEditorProps {
  content: JSONContent;   // Tiptap JSON document (from TiptapMarkdownBridge.parse())
  editable: boolean;
  onUpdate?: (editor: Editor) => void;
  onMediaInsert?: (type: "image" | "video" | "audio") => void; // Used by SlashCommandMenu (S05)
  placeholder?: string;
  className?: string;
}
```

Extension config for `useEditor`:

```typescript
extensions: [
  ...getDefaultExtensions(),  // from TiptapMarkdownBridge.ts (S02) — single source of truth
  Placeholder.configure({ placeholder }),
  // SlashCommandExtension added in S05
]
```

### UnifiedDocumentSurface.tsx

Shell component orchestrating modes and auto-save.

**Mode state machine:**

- View -> Edit: `editor.setEditable(true)`, call `onEnterEditMode?.()`
- Edit -> Source: Serialize via `editor.storage.markdown.getMarkdown()`, pass to SourceModePanel
- Source -> Edit: Parse `sourceMarkdown` via `TiptapMarkdownBridge.parse()`, set content
- Edit -> View: If dirty, trigger save. Set `editable=false`
- Source -> View: If dirty, trigger save. Parse markdown, set editable false

**Auto-save:**

- `useRef` for debounce timer (2000ms)
- On every `onUpdate` from TiptapEditor: serialize, call `onContentChange(markdown)`, reset debounce
- When debounce fires: call `onSave()`
- Ctrl+S / Cmd+S: cancel debounce, immediate save
- Auto-save does NOT fire in View mode

**Save status derivation:**

- `isSaving === true` → "Saving..."
- `errorMessage` set → show error banner
- dirty → "Unsaved changes"
- clean → "Saved"

**Double-click to edit:**

In View mode, `onDoubleClick` on editor wrapper → `setMode("edit")`, call `onEnterEditMode?.()`

**Keyboard shortcuts:**

- `Ctrl+S`: Immediate save
- `Escape` (in Edit/Source): Switch to View

**Props mapping from MarkdownFileEditor:**

| MarkdownFileEditor | UnifiedDocumentSurface |
|---|---|
| `value` (string) | `initialContent` (string) |
| `onChange` | `onContentChange` |
| `onSave` | `onSave` |
| `onVersionRestore` | `onVersionRestore` |
| `onEnterEditMode` | `onEnterEditMode` |
| `isSaving` | `isSaving` |
| `errorMessage` | `errorMessage` |
| `documentId` | `documentId` |
| `editorOnly` | _(removed, no split panel)_ |
| `fullHeight` | _(always full-height)_ |

**Component structure:**

```
<div className="unified-document-surface flex flex-col h-full">
  {/* Toolbar placeholder -- Section 04 adds EditorToolbar here */}
  <div>Mode: [View] [Edit] [Source] | Save status</div>

  {errorMessage && <ErrorBanner message={errorMessage} />}

  {/* TiptapEditor -- always mounted, hidden in Source mode */}
  <div style={{ display: mode === "source" ? "none" : undefined }}
       onDoubleClick={handleDoubleClick}>
    <TiptapEditor
      content={tiptapContent}
      editable={mode === "edit"}
      placeholder={t("editor.placeholder")}
      onUpdate={handleTiptapUpdate}
    />
  </div>

  {/* SourceModePanel -- only in Source mode */}
  <SourceModePanel
    value={markdownSource}
    onChange={handleSourceChange}
    visible={mode === "source"}
  />
</div>
```

**Content initialization:**

On mount, parse `initialContent` via `TiptapMarkdownBridge.parse()`. Store both markdown and parsed JSON.

**IMPORTANT — `resetKey` pattern for version restore:**

Do NOT use `useEffect(() => { re-parse }, [initialContent])` — this will fire after every auto-save when the server returns slightly normalized markdown (trailing newlines, whitespace changes), resetting the editor mid-session.

Instead, use a separate `resetKey` prop (or derive from `updatedAt`):
```
// Parent passes: resetKey={versionRestoreCounter} or resetKey={updatedAt}
useEffect(() => {
  if (resetKey !== lastResetKeyRef.current) {
    const parsed = TiptapMarkdownBridge.parse(initialContent);
    editor.commands.setContent(parsed);
    lastResetKeyRef.current = resetKey;
  }
}, [resetKey]);
```

This ensures the editor content only resets on explicit version restore, not on every auto-save cycle.

**Cleanup:** Clear debounce timer on unmount.

### SourceModePanel.tsx

Thin wrapper around existing `CodeMirrorEditor`.

```typescript
interface SourceModePanelProps {
  value: string;
  onChange: (value: string) => void;
  visible: boolean;
}
```

- Import `CodeMirrorEditor` from `@/components/library/CodeMirrorEditor`
- When `visible` is false, render with `display: none` (keep mounted for state)
- Pass `language="md"` for markdown syntax highlighting
- Fill available height

---

## Files to Create

| File | Action |
|------|--------|
| `apps/web/client/src/components/editor/types.ts` | CREATE |
| `apps/web/client/src/components/editor/TiptapEditor.tsx` | CREATE |
| `apps/web/client/src/components/editor/UnifiedDocumentSurface.tsx` | CREATE |
| `apps/web/client/src/components/editor/SourceModePanel.tsx` | CREATE |
| `apps/web/client/src/components/editor/TiptapEditor.test.tsx` | CREATE |
| `apps/web/client/src/components/editor/UnifiedDocumentSurface.test.tsx` | CREATE |

## Existing Files Referenced (Read-Only)

- `apps/web/client/src/components/library/CodeMirrorEditor.tsx` -- reused by SourceModePanel
- `apps/web/client/src/components/editor/TiptapMarkdownBridge.ts` -- from Section 02
- `apps/web/client/src/components/editor/editor.css` -- from Section 01

## Verification

1. `cd apps/web && pnpm vitest run client/src/components/editor/TiptapEditor.test.tsx` passes
2. `cd apps/web && pnpm vitest run client/src/components/editor/UnifiedDocumentSurface.test.tsx` passes
3. `cd apps/web && pnpm check` has no new TypeScript errors
