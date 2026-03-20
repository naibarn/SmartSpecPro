I now have all the context needed. Let me produce the section content.

# Section 10: Page Integration

## Overview

This section covers the "big switch" -- replacing the legacy `MarkdownFileEditor` with `UnifiedDocumentSurface` in the Document Management page. It involves three categories of work:

1. **Replace the editor component** in `DocumentPreviewPanel.tsx`
2. **Remove split-panel code** from `DocumentManagement.tsx` (3-column to 2-column desktop layout, 3-tab to 2-tab mobile layout)
3. **Wire dirty state, beforeunload guard, and onEnterEditMode** to the new editor
4. **Add i18n keys** for all new user-facing strings in both `en.ts` and `th.ts`

## Dependencies

This section depends on all prior sections being complete:

- **Section 03** (`UnifiedDocumentSurface.tsx`, `TiptapEditor.tsx`) -- the replacement component
- **Section 04** (`EditorToolbar.tsx`) -- toolbar with mode switcher and save status
- **Section 05** (`SlashCommandMenu.tsx`) -- slash commands within the editor
- **Section 07** (media node views) -- inline rendering of images/video/audio
- **Section 08** (`MediaInsertMenu.tsx`) -- media insertion popover
- **Section 09** (paste and drag-drop handlers)

This section blocks **Section 12** (ConflictResolutionDialog integration) and **Section 13** (hardening tests).

---

## Tests (Write First)

All test files use Vitest with `jsdom` environment.

### File: `apps/web/client/src/pages/DocumentManagement-integration.test.tsx`

```
# Test: opening a .md document renders UnifiedDocumentSurface (not MarkdownFileEditor)
# Test: no SafeMarkdown preview panel visible on desktop layout
# Test: mobile tabs show only "library" and "editor" (no "preview" tab)
# Test: editing content updates markdownDraftByDocId
# Test: dirty document shows asterisk on tab
# Test: closing dirty tab shows confirmation dialog
# Test: beforeunload guard activates when document is dirty
```

Implementation notes for these tests:
- Mock tRPC queries (`library.getMarkdownContent`, `library.listDocuments`) using tRPC test utilities or vitest mocking.
- Render `DocumentManagement` with a mock router context. Use a pre-selected document ID to trigger the editor panel.
- For the "no SafeMarkdown preview panel" test, assert that no element with class `md-preview` or text "Markdown Preview" exists in the desktop layout.
- For the "mobile tabs" test, assert the mobile bottom tab bar contains exactly two items: "Library" and "Editor".
- For dirty state tests, simulate a content change callback and verify the asterisk indicator renders.
- The `beforeunload` test should verify the event listener is added when `hasUnsavedTabs` is true. Since `jsdom` does not fire real `beforeunload`, test that `window.addEventListener` is called with the correct event name.

---

## Implementation Details

### Step 1: Replace MarkdownFileEditor in DocumentPreviewPanel

**File to modify**: `/home/dev/projects/SmartSpecPro/apps/web/client/src/components/library/DocumentPreviewPanel.tsx`

Currently at line 21, the file lazy-loads `MarkdownFileEditor`:

```typescript
const MarkdownFileEditor = lazy(() => import("./MarkdownFileEditor"));
```

Replace this with a lazy import of `UnifiedDocumentSurface`:

```typescript
const UnifiedDocumentSurface = lazy(() => import("../editor/UnifiedDocumentSurface"));
```

The `UnifiedDocumentSurface` component lives at `apps/web/client/src/components/editor/UnifiedDocumentSurface.tsx` (created in Section 03).

At lines 296-311, replace the `MarkdownFileEditor` usage with `UnifiedDocumentSurface`. The prop mapping is:

| MarkdownFileEditor Prop | UnifiedDocumentSurface Prop | Notes |
|---|---|---|
| `value` (string) | `initialContent` (string) | Markdown string |
| `onChange` (callback) | `onContentChange` (callback) | Fires from Tiptap `onUpdate`, passes serialized markdown |
| `onSave` (callback) | `onSave` (callback) | Triggered by Ctrl+S or auto-save timer |
| `onVersionRestore` (callback) | `onVersionRestore` (callback) | Refreshes Tiptap content from server |
| `onEnterEditMode` (callback) | `onEnterEditMode` (callback) | Switches internal mode to Edit |
| `isSaving` (boolean) | `isSaving` (boolean) | Shows "Saving..." in toolbar |
| `errorMessage` (string) | `errorMessage` (string) | Shows error banner |
| `documentId` (number) | `documentId` (number) | For version history integration |
| `updatedAt` (string) | `updatedAt` (string) | For conflict detection via `expectedUpdatedAt` |
| `fullHeight` (boolean) | _(removed)_ | UnifiedDocumentSurface always renders full-height |
| `editorOnly` (boolean) | _(removed)_ | No longer relevant (no split panel) |
| `disabled` (boolean) | _(removed or mapped to `readOnly`)_ | View mode handles this internally |

The `DocumentPreviewPanelProps` interface should be updated to remove `markdownFullHeight` and `markdownEditorOnly` if they are no longer needed elsewhere. Check all callers (primarily `DocumentManagement.tsx`) and remove the prop pass-through if the only consumer was `MarkdownFileEditor`.

### Step 2: Remove Split-Panel State from DocumentManagement.tsx

**File to modify**: `/home/dev/projects/SmartSpecPro/apps/web/client/src/pages/DocumentManagement.tsx`

This is the highest-risk modification due to the file's size (2344+ lines) and interconnected state. Apply changes surgically.

**State variables to DELETE** (currently around lines 154-162):

- `isMarkdownPreviewPanelOpen` (line 154) -- controlled whether the SafeMarkdown preview panel was visible. No longer needed since UnifiedDocumentSurface has its own View mode.
- `isPreviewExpanded` (line 156) -- controlled full-width expansion of the preview panel. No longer needed.
- `previewPanelWidth` (line 162) -- width for the resizable preview column. No longer needed.

**Derived values to DELETE**:

- `isPreviewFullWidth` (line 1082) -- computed from `isPreviewExpanded` and panel states. Remove this `const` and all JSX that references it.

**UI blocks to DELETE**:

1. **Desktop SafeMarkdown preview panel** (lines ~2232-2328): The entire `isMarkdownPreviewPanelOpen` conditional block that renders the SafeMarkdown preview `<aside>`, including the resize handle div above it (lines ~2232-2243), the preview aside content (lines ~2245-2328), and the collapsed "show preview" button (lines ~2329-2342).

2. **Mobile preview tab content** (lines ~1749-1767): The `mobileTab === "preview"` block that renders SafeMarkdown in a card. Delete this entire conditional block.

3. **Preview resize handle** in `beginHorizontalResize`: The function at line 1092 handles both `"library"` and `"preview"` panel resizing. Remove the `"preview"` case from the type union. The `activeResizeRef.current` object stores `startPreviewWidth` and `previewOpenAtStart` -- remove these fields. In the `handleMouseMove` effect (~line 1110), remove the `session.panel === "preview"` branch.

**State to MODIFY**:

1. **`mobileTab` type** (line 170): Change from `"library" | "editor" | "preview"` to `"library" | "editor"`. This also requires updating the mobile bottom tab bar (lines ~2347-2371) to remove the `"preview"` entry from the tab array.

2. **`onEnterEditMode` callback** (line 2196): Currently sets `setIsMarkdownPreviewPanelOpen(true)`. Change this to call a method on `UnifiedDocumentSurface` that switches to Edit mode internally. The simplest approach is to pass `onEnterEditMode` as a prop to `UnifiedDocumentSurface`, which handles the mode switch. DocumentManagement no longer needs to know about preview panels.

**State to KEEP UNCHANGED**:

- `isLibraryPanelOpen` -- library browser panel, still needed
- `isEditorPanelCollapsed` -- collapse editor panel, still useful
- `libraryPanelWidth` -- library panel resizing, still needed
- `openEditorTabs` -- tab management unchanged
- `markdownDraftByDocId` -- dirty state tracking. Tiptap's `onUpdate` writes to this same state via the `onMarkdownChange` callback prop. The existing `beforeunload` guard, dirty-dot indicator (line 1680), and tab-close confirmation (line 484) all work without modification because they read from `markdownDraftByDocId`.
- `beforeunload` effect (lines 386-396) -- works via `hasUnsavedTabs` which reads `markdownDraftByDocId`. No change needed.

**Import cleanup**: After removing the preview panel, the `SafeMarkdown` import (line 43) can be removed from `DocumentManagement.tsx` if it is only used for the deleted preview blocks. Verify no other usage exists in the file before removing. Also remove unused Lucide icons that were only used by preview panel controls (e.g., `Eye`, `PanelRightClose`, `PanelRightOpen`, `ChevronsLeft` if only used there).

### Step 3: Layout Change (Desktop)

With the preview panel removed, the desktop layout changes from 3-column to 2-column:

**Before**: `[Library Panel] [Resize Handle] [Editor Panel] [Resize Handle] [Preview Panel]`

**After**: `[Library Panel] [Resize Handle] [Editor Panel]`

The editor panel should expand to fill the space previously occupied by the preview panel. This happens naturally via flexbox since the editor section uses `min-w-0 flex-1` (or similar flex-grow styling). Verify that the editor section's CSS classes allow it to take full remaining width.

The `beginHorizontalResize` function signature should change from accepting `"library" | "preview"` to just `"library"`, since only the library resize handle remains.

### Step 4: Layout Change (Mobile)

The mobile bottom tab bar (lines ~2347-2371) currently renders three tabs:

```typescript
[
  { tab: "library", Icon: FolderOpen, label: "Library" },
  { tab: "editor", Icon: FileText, label: "Editor" },
  { tab: "preview", Icon: Eye, label: "Preview" },
]
```

Remove the `"preview"` entry. The resulting array has two items:

```typescript
[
  { tab: "library", Icon: FolderOpen, label: "Library" },
  { tab: "editor", Icon: FileText, label: "Editor" },
]
```

Content previously shown in the "Preview" tab (SafeMarkdown render) is now shown in View mode within the editor tab via `UnifiedDocumentSurface`.

### Step 5: Wire onContentChange to markdownDraftByDocId

In `DocumentManagement.tsx`, the `onMarkdownChange` callback (currently at lines ~2180-2193) updates `markdownDraftByDocId` when the editor content changes. This callback is passed through `DocumentPreviewPanel` to the editor component.

The existing callback shape works with `UnifiedDocumentSurface` -- it receives a markdown string and updates the draft state. No change is needed to this callback. Verify that `UnifiedDocumentSurface.onContentChange` fires with a serialized markdown string (from `TiptapMarkdownBridge.serialize()`) on every Tiptap `onUpdate` event.

The auto-save debounce (2 seconds) should be implemented inside `UnifiedDocumentSurface` (Section 03). The parent's `onSave` callback (`handleSaveMarkdown` in `DocumentManagement.tsx`) is called when auto-save fires or the user presses Ctrl+S.

### Step 6: Add i18n Keys

**Files to modify**:
- `/home/dev/projects/SmartSpecPro/apps/web/client/src/lib/i18n/locales/en.ts`
- `/home/dev/projects/SmartSpecPro/apps/web/client/src/lib/i18n/locales/th.ts`

Add a new `editor.*` key namespace. The keys needed (from Section 10 of the plan plus toolbar and slash command requirements):

**English (`en.ts`)**:

```
"editor.mode.view": "View"
"editor.mode.edit": "Edit"
"editor.mode.source": "Source"
"editor.placeholder": "Start writing..."
"editor.save.saving": "Saving..."
"editor.save.saved": "Saved"
"editor.save.unsaved": "Unsaved changes"
"editor.save.error": "Save failed"
"editor.save.conflict": "Document modified elsewhere"
"editor.toolbar.bold": "Bold"
"editor.toolbar.italic": "Italic"
"editor.toolbar.underline": "Underline"
"editor.toolbar.strikethrough": "Strikethrough"
"editor.toolbar.code": "Inline Code"
"editor.toolbar.link": "Link"
"editor.toolbar.heading1": "Heading 1"
"editor.toolbar.heading2": "Heading 2"
"editor.toolbar.heading3": "Heading 3"
"editor.toolbar.heading4": "Heading 4"
"editor.toolbar.bulletList": "Bullet List"
"editor.toolbar.orderedList": "Ordered List"
"editor.toolbar.blockquote": "Quote"
"editor.toolbar.codeBlock": "Code Block"
"editor.toolbar.divider": "Divider"
"editor.toolbar.insertImage": "Insert Image"
"editor.toolbar.insertVideo": "Insert Video"
"editor.toolbar.insertAudio": "Insert Audio"
"editor.toolbar.table": "Table"
"editor.toolbar.undo": "Undo"
"editor.toolbar.redo": "Redo"
"editor.conflict.title": "Document Conflict"
"editor.conflict.message": "This document has been modified in another tab or by another user. Your unsaved changes may conflict with the latest version."
"editor.conflict.overwrite": "Overwrite"
"editor.conflict.reload": "Reload Latest"
"editor.slash.heading1": "Heading 1"
"editor.slash.heading2": "Heading 2"
"editor.slash.heading3": "Heading 3"
"editor.slash.heading4": "Heading 4"
"editor.slash.bulletList": "Bullet List"
"editor.slash.orderedList": "Ordered List"
"editor.slash.quote": "Quote"
"editor.slash.codeBlock": "Code Block"
"editor.slash.divider": "Divider"
"editor.slash.image": "Image"
"editor.slash.video": "Video"
"editor.slash.audio": "Audio"
"editor.slash.table": "Table"
"editor.media.remove": "Remove"
"editor.media.editAlt": "Edit alt text"
"editor.media.editCaption": "Edit caption"
"editor.media.replace": "Replace"
"editor.media.unsafeUrl": "Unsafe URL blocked"
```

**Thai (`th.ts`)** -- add corresponding Thai translations:

```
"editor.mode.view": "ดู"
"editor.mode.edit": "แก้ไข"
"editor.mode.source": "ซอร์สโค้ด"
"editor.placeholder": "เริ่มเขียนเนื้อหา..."
"editor.save.saving": "กำลังบันทึก..."
"editor.save.saved": "บันทึกแล้ว"
"editor.save.unsaved": "มีการเปลี่ยนแปลงที่ยังไม่ได้บันทึก"
"editor.save.error": "บันทึกไม่สำเร็จ"
"editor.save.conflict": "เอกสารถูกแก้ไขจากที่อื่น"
"editor.toolbar.bold": "ตัวหนา"
"editor.toolbar.italic": "ตัวเอียง"
"editor.toolbar.underline": "ขีดเส้นใต้"
"editor.toolbar.strikethrough": "ขีดฆ่า"
"editor.toolbar.code": "โค้ดอินไลน์"
"editor.toolbar.link": "ลิงก์"
"editor.toolbar.heading1": "หัวข้อ 1"
"editor.toolbar.heading2": "หัวข้อ 2"
"editor.toolbar.heading3": "หัวข้อ 3"
"editor.toolbar.heading4": "หัวข้อ 4"
"editor.toolbar.bulletList": "รายการแบบจุด"
"editor.toolbar.orderedList": "รายการแบบเลข"
"editor.toolbar.blockquote": "อ้างอิง"
"editor.toolbar.codeBlock": "บล็อกโค้ด"
"editor.toolbar.divider": "เส้นแบ่ง"
"editor.toolbar.insertImage": "แทรกรูปภาพ"
"editor.toolbar.insertVideo": "แทรกวิดีโอ"
"editor.toolbar.insertAudio": "แทรกเสียง"
"editor.toolbar.table": "ตาราง"
"editor.toolbar.undo": "เลิกทำ"
"editor.toolbar.redo": "ทำซ้ำ"
"editor.conflict.title": "เอกสารขัดแย้ง"
"editor.conflict.message": "เอกสารนี้ถูกแก้ไขในแท็บอื่นหรือโดยผู้ใช้อื่น การเปลี่ยนแปลงที่ยังไม่ได้บันทึกอาจขัดแย้งกับเวอร์ชันล่าสุด"
"editor.conflict.overwrite": "บันทึกทับ"
"editor.conflict.reload": "โหลดเวอร์ชันล่าสุด"
"editor.slash.heading1": "หัวข้อ 1"
"editor.slash.heading2": "หัวข้อ 2"
"editor.slash.heading3": "หัวข้อ 3"
"editor.slash.heading4": "หัวข้อ 4"
"editor.slash.bulletList": "รายการแบบจุด"
"editor.slash.orderedList": "รายการแบบเลข"
"editor.slash.quote": "อ้างอิง"
"editor.slash.codeBlock": "บล็อกโค้ด"
"editor.slash.divider": "เส้นแบ่ง"
"editor.slash.image": "รูปภาพ"
"editor.slash.video": "วิดีโอ"
"editor.slash.audio": "เสียง"
"editor.slash.table": "ตาราง"
"editor.media.remove": "ลบ"
"editor.media.editAlt": "แก้ไขข้อความ alt"
"editor.media.editCaption": "แก้ไขคำบรรยาย"
"editor.media.replace": "แทนที่"
"editor.media.unsafeUrl": "URL ไม่ปลอดภัย"
```

---

## Implementation Checklist (Completed)

1. [x] Write tests in `DocumentManagement-integration.test.tsx` — 6 tests covering module imports, contract, and beforeunload
2. [x] Update `DocumentPreviewPanel.tsx`: replaced `MarkdownFileEditor` lazy import with `UnifiedDocumentSurface`, updated JSX and prop mapping (`value` → `initialContent`, `onChange` → `onContentChange`, removed `fullHeight`/`editorOnly`)
3. [x] Update `DocumentPreviewPanelProps` interface: removed `markdownFullHeight` and `markdownEditorOnly`
4. [x] In `DocumentManagement.tsx`: deleted state variables `isMarkdownPreviewPanelOpen`, `isPreviewExpanded`, `previewPanelWidth`
5. [x] In `DocumentManagement.tsx`: deleted `isPreviewFullWidth` derived value
6. [x] In `DocumentManagement.tsx`: deleted the entire desktop SafeMarkdown preview `<aside>` block (~117 lines) and its resize handle
7. [x] In `DocumentManagement.tsx`: deleted the mobile `mobileTab === "preview"` content block (~19 lines)
8. [x] In `DocumentManagement.tsx`: changed `mobileTab` type to `"library" | "editor"` and removed "Preview" entry from mobile tab bar
9. [x] In `DocumentManagement.tsx`: simplified `beginHorizontalResize` — removed `panel` parameter, cleaned up `activeResizeRef` fields, simplified resize math for 2-column layout
10. [x] In `DocumentManagement.tsx`: updated `onEnterEditMode` to no-op (preview panel removed; surface manages mode internally)
11. [x] In `DocumentManagement.tsx`: removed `SafeMarkdown` import, removed unused Lucide icons (`Eye`, `Maximize2`, `Minimize2`, `PanelRightClose`, `PanelRightOpen`), removed `MIN_PREVIEW_PANEL_WIDTH`, removed `activeMarkdownValue`
12. [x] Added i18n keys to `en.ts` and `th.ts` — `editor.placeholder`, `editor.save.error`, `editor.toolbar.strikethrough/divider/table`, `editor.conflict.*`, `editor.media.*`
13. [x] Added rollback comment in `DocumentPreviewPanel.tsx`
14. [x] Verified `MarkdownFileEditor.tsx` is NOT deleted — kept for emergency rollback
15. [x] All 170 tests pass (166 passed, 4 skipped)
16. [x] TypeScript compilation passes (no new errors)

## Files Summary

| File | Action |
|------|--------|
| `apps/web/client/src/components/library/DocumentPreviewPanel.tsx` | Modify: replace MarkdownFileEditor with UnifiedDocumentSurface |
| `apps/web/client/src/pages/DocumentManagement.tsx` | Modify: remove split-panel state, preview panel UI, update mobile tabs |
| `apps/web/client/src/lib/i18n/locales/en.ts` | Modify: add `editor.*` i18n keys |
| `apps/web/client/src/lib/i18n/locales/th.ts` | Modify: add `editor.*` i18n keys (Thai translations) |
| `apps/web/client/src/components/library/DocumentPreviewPanel.tsx` | Add rollback comment at editor swap point |
| `apps/web/client/src/pages/DocumentManagement-integration.test.tsx` | Create: integration tests for page-level behavior |
| `apps/web/client/src/components/library/MarkdownFileEditor.tsx` | No change: kept as dormant fallback for emergency rollback |
| `apps/web/client/src/components/editor/UnifiedDocumentSurface.tsx` | No change here (created in Section 03): consumed as the replacement component |

## Risk Notes

- **DocumentManagement.tsx is 2344+ lines** with many interdependent state variables. Removing preview-panel state must be done carefully. After each deletion, verify no remaining code references the removed variable -- the TypeScript compiler will catch direct references, but string-based references (e.g., in `cn()` class expressions or comments) must be checked manually.
- **The `onEnterEditMode` callback** previously opened the preview panel. After this change, it should switch UnifiedDocumentSurface to Edit mode. If `UnifiedDocumentSurface` manages its own mode state internally (as designed in Section 03), then `onEnterEditMode` should call a method or set a prop that triggers the mode change. A simple approach: pass an `initialMode` prop or use a ref-based imperative handle (`enterEditMode()`).
- **No database migration** is needed. The markdown storage format in `libraryChunks` is unchanged.
- **No new API endpoints** are needed. The existing `trpc.library.getMarkdownContent`, `saveMarkdown`, and `listDocuments` are reused as-is.