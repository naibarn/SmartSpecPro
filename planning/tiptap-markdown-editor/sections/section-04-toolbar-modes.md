Now I have all the context needed. Let me produce the section content.

# Section 04: Toolbar and Mode Switching -- EditorToolbar

## Overview

This section covers the creation of `EditorToolbar.tsx`, the inline toolbar that lives inside `UnifiedDocumentSurface`. The toolbar provides three responsibilities:

1. **Mode switcher** -- toggle between View, Edit, and Source modes
2. **Formatting buttons** -- headings, inline marks, block types, media insertion, undo/redo
3. **Save status indicator** -- shows "Saving...", "Saved", or "Unsaved changes"

The toolbar is visible in all modes, but formatting buttons are only shown in Edit mode. The mode switcher and save status are always visible.

### Dependencies

- **Section 03 (editor-surface)**: `UnifiedDocumentSurface.tsx` and `TiptapEditor.tsx` must exist. The toolbar receives the Tiptap `Editor` instance and mode-switching callbacks from the surface component.
- **Section 01 (tiptap-setup)**: Tiptap packages must be installed (provides the `Editor` type from `@tiptap/react`).

### Files to Create

| File | Purpose |
|------|---------|
| `apps/web/client/src/components/editor/EditorToolbar.tsx` | Main toolbar component |
| `apps/web/client/src/components/editor/EditorToolbar.test.tsx` | Vitest tests |

### Files to Modify

| File | Change |
|------|--------|
| `apps/web/client/src/lib/i18n/locales/en.ts` | Add `editor.*` i18n keys |
| `apps/web/client/src/lib/i18n/locales/th.ts` | Add `editor.*` i18n keys (Thai) |

---

## Tests (Write First)

Create the test file at `apps/web/client/src/components/editor/EditorToolbar.test.tsx`. Tests use Vitest with jsdom environment.

The toolbar receives a Tiptap `Editor` instance. For testing, the editor should be mocked -- most tests verify that the correct Tiptap chain commands are called when toolbar buttons are clicked, and that visibility rules work based on the current mode.

```
# EditorToolbar.test.tsx

# Test: renders mode switcher with View, Edit, Source buttons
# Test: View mode hides formatting buttons (bold, italic, heading, etc.)
# Test: Edit mode shows all formatting buttons
# Test: Source mode hides formatting buttons (same as View)
# Test: clicking Edit button calls onModeChange("edit")
# Test: clicking View button calls onModeChange("view")
# Test: clicking Source button calls onModeChange("source")
# Test: active mode button has distinct visual style (variant="default" vs "outline")
# Test: Bold button calls editor.chain().focus().toggleBold().run()
# Test: Italic button calls editor.chain().focus().toggleItalic().run()
# Test: Underline button calls editor.chain().focus().toggleUnderline().run()
# Test: Heading 1 button calls editor.chain().focus().toggleHeading({ level: 1 }).run()
# Test: Heading 2 button calls editor.chain().focus().toggleHeading({ level: 2 }).run()
# Test: Heading 3 button calls editor.chain().focus().toggleHeading({ level: 3 }).run()
# Test: Heading 4 button calls editor.chain().focus().toggleHeading({ level: 4 }).run()
# Test: Bullet List button calls editor.chain().focus().toggleBulletList().run()
# Test: Ordered List button calls editor.chain().focus().toggleOrderedList().run()
# Test: Blockquote button calls editor.chain().focus().toggleBlockquote().run()
# Test: Code button calls editor.chain().focus().toggleCode().run()
# Test: Code Block button calls editor.chain().focus().toggleCodeBlock().run()
# Test: Horizontal Rule button calls editor.chain().focus().setHorizontalRule().run()
# Test: Undo button calls editor.chain().focus().undo().run()
# Test: Redo button calls editor.chain().focus().redo().run()
# Test: Save button calls onSave callback
# Test: Save button disabled when isSaving is true
# Test: save status shows "Saving..." when saveStatus is "saving"
# Test: save status shows "Saved" when saveStatus is "saved"
# Test: save status shows "Unsaved changes" when saveStatus is "dirty"
# Test: save status hidden when saveStatus is "clean"
# Test: active formatting state reflects on buttons (bold button is "active" when cursor is in bold text)
# Test: Insert Image button calls onInsertMedia("image")
# Test: Insert Video button calls onInsertMedia("video")
# Test: Insert Audio button calls onInsertMedia("audio")
# Test: Link button calls onInsertLink callback
# Test: toolbar labels use i18n (renders translated text)
# Test: toolbar is accessible -- buttons have aria-label attributes
```

### Mocking Strategy

The Tiptap `Editor` instance should be mocked as a partial object with the methods the toolbar calls. The key methods to mock:

- `editor.chain()` -- returns an object with `.focus()`, which returns an object with all command methods (`.toggleBold()`, `.toggleItalic()`, etc.), each returning an object with `.run()`.
- `editor.isActive(name, attrs?)` -- returns boolean indicating if the given mark/node is active at the current selection. Used to highlight active toolbar buttons.
- `editor.can().chain().focus().undo().run()` -- returns boolean for undo/redo availability.

A helper factory function `createMockEditor()` should return a mock that satisfies these patterns. The mock does not need to be a real Tiptap editor -- it only needs to expose the chain-command pattern and `isActive`.

---

## Implementation Details

### Component Interface

```typescript
import type { EditorMode, SaveStatus } from "./types"; // from S03's types.ts — do NOT redefine locally

interface EditorToolbarProps {
  editor: Editor | null;
  mode: EditorMode;
  onModeChange: (mode: EditorMode) => void;
  saveStatus: SaveStatus;
  onSave: () => void;
  onInsertMedia: (type: "image" | "video" | "audio") => void;
  onInsertLink: () => void;
  isSaving?: boolean;
  errorMessage?: string;
}
```

The `editor` prop may be `null` when Tiptap is initializing. All formatting buttons should be disabled when `editor` is null. The `mode` and `saveStatus` are controlled by the parent `UnifiedDocumentSurface`.

### Layout Structure

The toolbar renders as a single horizontal bar with visual separators between button groups. It uses the existing `Button` component from `@/components/ui/button` and Lucide icons -- matching the patterns already used in `MarkdownFileEditor.tsx`.

The layout groups from left to right:

1. **Mode switcher**: Three buttons (View / Edit / Source) styled as a button group. The active mode uses `variant="default"`, inactive modes use `variant="outline"`.

2. **Separator** (vertical border div)

3. **Formatting group** (only visible in Edit mode):
   - Undo, Redo
   - Separator
   - H1, H2, H3, H4
   - Bold, Italic, Underline, Code
   - Link
   - Separator
   - Bullet List, Ordered List, Blockquote, Code Block, Horizontal Rule
   - Separator
   - Insert Image, Insert Video, Insert Audio

4. **Right-aligned save section**:
   - Save status text (color-coded)
   - Save button (with `Save` icon from Lucide)

### Active State for Formatting Buttons

When the user's cursor is inside bold text, the Bold button should appear "pressed" (using a distinct background color or `variant="secondary"`). This is achieved by checking `editor.isActive("bold")` and applying a conditional class or variant.

The same pattern applies to:
- `editor.isActive("italic")` for Italic
- `editor.isActive("underline")` for Underline
- `editor.isActive("code")` for Code
- `editor.isActive("heading", { level: N })` for each heading level
- `editor.isActive("bulletList")` for Bullet List
- `editor.isActive("orderedList")` for Ordered List
- `editor.isActive("blockquote")` for Blockquote
- `editor.isActive("codeBlock")` for Code Block

The `isActive` check must be re-evaluated on each render. Tiptap triggers re-renders through the `onSelectionUpdate` and `onTransaction` callbacks on the editor, which propagate through `useEditor` in the parent `TiptapEditor` component.

### Save Status Display

The save status text appears to the left of the Save button:

| `saveStatus` | Text | Color | Notes |
|-------------|------|-------|-------|
| `"clean"` | (hidden) | -- | No unsaved changes, nothing to show |
| `"dirty"` | "Unsaved changes" | amber/yellow | Content differs from last save |
| `"saving"` | "Saving..." | blue | Auto-save or manual save in progress |
| `"saved"` | "Saved" | green | Flashes briefly after successful save, then fades to "clean" |
| `"error"` | Error message | red | Shows `errorMessage` prop content |
| `"conflict"` | "Conflict detected" | red | Another session modified the document |

The "Saved" status should auto-transition to "clean" after approximately 3 seconds. This timeout is managed by the parent `UnifiedDocumentSurface`, not the toolbar itself -- the toolbar is a pure presentational component that renders whatever `saveStatus` it receives.

### Undo/Redo Availability

Undo and Redo buttons should be disabled when there is nothing to undo/redo. Check via:
- Undo disabled: `!editor.can().chain().focus().undo().run()`
- Redo disabled: `!editor.can().chain().focus().redo().run()`

### Media Insert Buttons

The Insert Image, Insert Video, and Insert Audio buttons do not directly insert content. They call `onInsertMedia(type)` which the parent (`UnifiedDocumentSurface`) uses to open the `MediaInsertMenu` popover (built in Section 08). For this section, the toolbar simply fires the callback -- the actual media insertion UI is out of scope.

### Link Insertion

The Link button calls `onInsertLink()`. The parent handles the actual link insertion logic (prompting for URL, wrapping selected text). This follows the pattern from the existing `MarkdownFileEditor` where `insertLink()` uses `window.prompt`.

### Keyboard Shortcut Indicators

Toolbar buttons should show keyboard shortcuts in their `title` attributes:
- Bold: "Bold (Ctrl+B)"
- Italic: "Italic (Ctrl+I)"
- Underline: "Underline (Ctrl+U)"
- Undo: "Undo (Ctrl+Z)"
- Redo: "Redo (Ctrl+Shift+Z)"
- Save: "Save (Ctrl+S)"

These shortcuts are handled by Tiptap's built-in keymap (via StarterKit's history and mark extensions), not by the toolbar. The toolbar simply documents them in tooltips.

### Accessibility

- All icon-only buttons must have `aria-label` attributes with the action name.
- The mode switcher buttons should use `aria-pressed` to indicate the active mode.
- The toolbar container should have `role="toolbar"` and `aria-label="Editor toolbar"`.
- Button groups should be navigable with arrow keys (this is handled by Radix UI's button group patterns if used, or can be deferred to Section 13 hardening).

---

## i18n Keys

Add the following keys to both `en.ts` and `th.ts` locale files. The i18n system uses the `useI18n()` hook from `@/lib/i18n` which returns a `t()` function for looking up translations.

### English (`apps/web/client/src/lib/i18n/locales/en.ts`)

```
"editor.mode.view": "View"
"editor.mode.edit": "Edit"
"editor.mode.source": "Source"
"editor.toolbar.bold": "Bold"
"editor.toolbar.italic": "Italic"
"editor.toolbar.underline": "Underline"
"editor.toolbar.code": "Code"
"editor.toolbar.link": "Link"
"editor.toolbar.heading1": "Heading 1"
"editor.toolbar.heading2": "Heading 2"
"editor.toolbar.heading3": "Heading 3"
"editor.toolbar.heading4": "Heading 4"
"editor.toolbar.bulletList": "Bullet List"
"editor.toolbar.orderedList": "Ordered List"
"editor.toolbar.blockquote": "Blockquote"
"editor.toolbar.codeBlock": "Code Block"
"editor.toolbar.horizontalRule": "Divider"
"editor.toolbar.undo": "Undo"
"editor.toolbar.redo": "Redo"
"editor.toolbar.insertImage": "Insert Image"
"editor.toolbar.insertVideo": "Insert Video"
"editor.toolbar.insertAudio": "Insert Audio"
"editor.toolbar.save": "Save"
"editor.save.saving": "Saving..."
"editor.save.saved": "Saved"
"editor.save.unsaved": "Unsaved changes"
"editor.save.conflict": "Conflict detected"
```

### Thai (`apps/web/client/src/lib/i18n/locales/th.ts`)

```
"editor.mode.view": "ดู"
"editor.mode.edit": "แก้ไข"
"editor.mode.source": "ซอร์สโค้ด"
"editor.toolbar.bold": "ตัวหนา"
"editor.toolbar.italic": "ตัวเอียง"
"editor.toolbar.underline": "ขีดเส้นใต้"
"editor.toolbar.code": "โค้ด"
"editor.toolbar.link": "ลิงก์"
"editor.toolbar.heading1": "หัวข้อ 1"
"editor.toolbar.heading2": "หัวข้อ 2"
"editor.toolbar.heading3": "หัวข้อ 3"
"editor.toolbar.heading4": "หัวข้อ 4"
"editor.toolbar.bulletList": "รายการหัวข้อย่อย"
"editor.toolbar.orderedList": "รายการลำดับเลข"
"editor.toolbar.blockquote": "อ้างอิง"
"editor.toolbar.codeBlock": "บล็อกโค้ด"
"editor.toolbar.horizontalRule": "เส้นแบ่ง"
"editor.toolbar.undo": "เลิกทำ"
"editor.toolbar.redo": "ทำซ้ำ"
"editor.toolbar.insertImage": "แทรกรูปภาพ"
"editor.toolbar.insertVideo": "แทรกวิดีโอ"
"editor.toolbar.insertAudio": "แทรกเสียง"
"editor.toolbar.save": "บันทึก"
"editor.save.saving": "กำลังบันทึก..."
"editor.save.saved": "บันทึกแล้ว"
"editor.save.unsaved": "มีการเปลี่ยนแปลงที่ยังไม่ได้บันทึก"
"editor.save.conflict": "พบข้อขัดแย้ง"
```

---

## Integration with UnifiedDocumentSurface

The parent component (`UnifiedDocumentSurface`, from Section 03) manages mode state and passes it down:

```typescript
// In UnifiedDocumentSurface (Section 03 -- not this section's responsibility)
const [mode, setMode] = useState<EditorMode>("view");

// Mode change handler
function handleModeChange(newMode: EditorMode) {
  // If leaving Edit mode, serialize content and auto-save
  // If entering Source, serialize Tiptap -> markdown string for CodeMirror
  // If leaving Source, parse markdown string -> Tiptap document
  setMode(newMode);
}

// Render
<EditorToolbar
  editor={editor}
  mode={mode}
  onModeChange={handleModeChange}
  saveStatus={saveStatus}
  onSave={handleSave}
  onInsertMedia={handleInsertMedia}
  onInsertLink={handleInsertLink}
  isSaving={isSaving}
  errorMessage={errorMessage}
/>
```

The toolbar does not own any mode or save state. It is a controlled component that renders based on props and fires callbacks.

---

## Design Patterns from Existing Code

The toolbar mirrors the visual style of the existing formatting toolbar in `MarkdownFileEditor.tsx` (lines 377-494). Key patterns to reuse:

- Icon-only buttons use `size="icon"` variant with `className="h-10 w-10"` and Lucide icons at `className="h-5 w-5"`
- Separator dividers use `<div className="border-r" />`
- The container uses `className="flex flex-wrap gap-2 rounded-md border bg-muted/20 p-2.5"`
- Media insert buttons use Lucide icons: `ImagePlus` (image), `Video` (video), `Music2` (audio)
- Save button uses `Save` icon from Lucide with text label

The main difference from the old toolbar: instead of manipulating raw markdown text through `editorRef.current.wrapSelection()`, the new toolbar calls Tiptap chain commands on the `Editor` instance. This is both simpler and more reliable since Tiptap handles cursor positioning and formatting state internally.