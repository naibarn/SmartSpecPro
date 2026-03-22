# Implementation Plan: Feature 046 — Tiptap Single-Panel Markdown Editor

## 1. Context and Motivation

SmartSpecPro's Document Management page currently uses a **split-panel architecture** for markdown editing: a CodeMirror raw editor on the left and a SafeMarkdown rendered preview on the right. This forces users to mentally map between markdown syntax and visual output, wastes screen space, and makes media management cumbersome (insert a video, switch to preview to check it rendered correctly, switch back to edit).

The goal is to replace this with a **single-panel rich editor** powered by Tiptap OSS — an editor framework built on ProseMirror that renders content as WYSIWYG while preserving Markdown as the storage format. Users will see formatted text, inline images, and video players directly in the editing surface, eliminating the need for a separate preview panel.

### Key Constraints

- **No database migration**: Markdown string storage in `libraryChunks` chunk 0 stays unchanged.
- **No new API endpoints**: Reuse existing `trpc.library.getMarkdownContent`, `saveMarkdown`, and `listDocuments`.
- **Backward compatibility**: All existing markdown documents (including those with raw `<video>` and `<audio>` HTML tags) must open without data loss.
- **Performance**: Documents up to 20,000 words (~100K characters) must render with <100ms input latency.
- **Rollout**: Switch all tenants at once (no per-tenant feature flag rollout). MarkdownFileEditor.tsx preserved in codebase for emergency git-revert.

---

## 2. Current Architecture

### File Map

| File | Lines | Role |
|------|-------|------|
| `apps/web/client/src/pages/DocumentManagement.tsx` | 2344+ | Page shell: library browser, tab management, draft state, resize handles, mobile tabs |
| `apps/web/client/src/components/library/DocumentPreviewPanel.tsx` | 628 | Outer header (title/rename/share) + lazy-loads MarkdownFileEditor |
| `apps/web/client/src/components/library/MarkdownFileEditor.tsx` | 937 | CodeMirror editor + SafeMarkdown preview (split-panel) |
| `apps/web/client/src/components/library/CodeMirrorEditor.tsx` | 415 | CodeMirror 6 wrapper (preserved for Source Mode) |
| `apps/web/client/src/components/chat/SafeMarkdown.tsx` | 347 | DOMPurify-sanitized markdown renderer with media extraction |

### State Management in DocumentManagement.tsx

The page manages editor state through several interconnected pieces:

**Draft tracking**: `markdownDraftByDocId` (line 150) maps each open document ID to `{ value, savedValue, updatedAt }`. When the editor fires `onChange`, `value` is updated. When a save succeeds, `savedValue` is synced. The dirty check (`isEditorTabDirty`, line 375) compares `value !== savedValue`.

**Unsaved change protection**: Three systems depend on dirty state:
1. `beforeunload` guard (lines 386-396) — prevents accidental browser close
2. Tab-close confirmation dialog (line 484 via `closeDocumentEditorTab`)
3. Dirty-dot indicator on editor tabs (line 1680)

**Split-panel state**: Six state variables control the preview panel that will be removed:
- `isMarkdownPreviewPanelOpen` (line 154), `isPreviewExpanded` (line 156), `previewPanelWidth` (line 162)
- `isPreviewFullWidth` derived value (line 1082)
- Desktop SafeMarkdown panel (~lines 2232-2245), mobile preview tab (~lines 1754-1760)

**Mobile layout**: `mobileTab` (line 170) cycles between `"library" | "editor" | "preview"`. After migration, the `"preview"` value is removed.

### SafeMarkdown Media Pipeline

SafeMarkdown extracts `<video>` and `<audio>` tags *before* DOMPurify processing (via `splitByMedia()`, line 212) because DOMPurify would strip them. The `MediaPart` type (line 205) currently only preserves `{ kind, src }` — extended attributes like `data-poster`, `data-caption`, `data-asset-id` are silently lost. This must be fixed in Phase 3.

DOMPurify config (line 69) sets `ALLOW_DATA_ATTR: false`, which strips all `data-*` attributes. The fix is to add `ADD_ATTR: ["data-poster", "data-caption", "data-asset-id"]` (targeted, not blanket).

### Current Media Insertion

MarkdownFileEditor inserts media via three functions:
- **Images**: `![alt](url)` markdown syntax (line 219)
- **Videos**: `<video src="..." controls width="100%" style="..."></video>` HTML (line 228)
- **Audio**: `**title**\n<audio src="..." controls style="..."></audio>` HTML (line 236)

Note: `style` attributes are stripped by DOMPurify's `ALLOWED_ATTR` list, so styles are lost in SafeMarkdown renders. The Tiptap editor will use Tailwind classes instead.

---

## 3. Target Architecture

### Component Tree

```
DocumentPreviewPanel (existing — modified)
 ├─ Outer Header [title editing, rename, share, download — UNCHANGED]
 └─ previewType === "markdown"
     └─ UnifiedDocumentSurface (NEW — replaces MarkdownFileEditor)
         ├─ EditorToolbar
         │   ├─ Mode switcher: View | Edit | Source
         │   ├─ Save status: Saving... | Saved | Unsaved changes
         │   ├─ Formatting: H1-H4, Bold, Italic, Underline, Code, Link
         │   ├─ Blocks: List, Ordered list, Quote, Code block, Divider
         │   ├─ Insert: Image, Video, Audio (opens MediaInsertMenu)
         │   └─ Undo/Redo, Save button
         ├─ TiptapEditor (main surface — View or Edit mode)
         │   ├─ ImageNodeView (per image block)
         │   ├─ VideoNodeView (per video block)
         │   ├─ AudioNodeView (per audio block)
         │   ├─ SlashCommandMenu (on "/" keystroke)
         │   └─ BubbleMenu (on text selection)
         ├─ SourceModePanel (visible when Source mode active)
         └─ ConflictResolutionDialog (on save conflict)
```

### Header Ownership

DocumentPreviewPanel's outer header owns title editing, rename, share, download, and replace-file. This header is NOT modified — it stays as-is. UnifiedDocumentSurface's EditorToolbar is an *inline* toolbar inside the editor area, handling only editing-related controls (formatting, mode switch, save status). There is no ownership conflict.

Version history: DocumentPreviewPanel currently suppresses version history for markdown type. This pattern continues — `DocumentVersionHistory` moves inside `UnifiedDocumentSurface`.

### Data Flow

**Load**: User clicks a .md file → `trpc.library.getMarkdownContent({ id })` → returns `{ content, updatedAt }` → `TiptapMarkdownBridge.parse(content)` → Tiptap ProseMirror document model → `TiptapEditor` renders.

**Edit**: User types → ProseMirror transaction → `onUpdate` callback → serialize to markdown string → update `markdownDraftByDocId[tabId].value` (for dirty state tracking). Auto-save fires 2 seconds after last edit.

**Save**: `TiptapMarkdownBridge.serialize(doc)` → markdown string → `trpc.library.saveMarkdown({ id, content, expectedUpdatedAt })`. On success: update `markdownDraftByDocId[tabId].savedValue` to match. On `LibraryMarkdownVersionConflictError`: show `ConflictResolutionDialog`.

**Mode switch**: View→Edit: make editor `editable: true`, show toolbar. Edit→Source: serialize to markdown, pass to CodeMirror. Source→Edit: parse markdown back to Tiptap. All transitions auto-save if there are unsaved changes.

### Dirty State Integration

`markdownDraftByDocId` is preserved. Tiptap's `onUpdate` callback writes the serialized markdown into `markdownDraftByDocId[tabId].value`. This ensures the existing `beforeunload` guard, dirty-dot indicator, and tab-close confirmation all work without modification.

Auto-save resets `savedValue` to match `value` on success. If auto-save fails (network error), `savedValue` stays stale and dirty indicators remain visible.

---

## 4. Tiptap Extension Stack

### Packages

```
@tiptap/react ^2.x
@tiptap/starter-kit ^2.x
@tiptap/extension-image ^2.x
@tiptap/extension-link ^2.x
@tiptap/extension-table ^2.x
@tiptap/extension-table-row ^2.x
@tiptap/extension-table-cell ^2.x
@tiptap/extension-table-header ^2.x
@tiptap/extension-underline ^2.x
@tiptap/extension-placeholder ^2.x
tiptap-markdown ^0.8.x
@tiptap/suggestion ^2.x (for slash command menu)
```

### Extension Configuration

StarterKit provides: paragraph, heading (1-4), bold, italic, strike, code, codeBlock, blockquote, bulletList, orderedList, listItem, horizontalRule, hardBreak, history (undo/redo).

Additional extensions: Image (extended with caption, alignment, assetId attrs), Link (openOnClick: false), Table + TableRow + TableCell + TableHeader (resizable: true), Underline, Placeholder (i18n placeholder text).

`tiptap-markdown` bridge: `Markdown.configure({ html: true, transformPastedText: true })`. Serialization via `editor.storage.markdown.getMarkdown()`.

### Custom Extensions

Three custom extensions for media: `VideoExtension`, `AudioExtension`, and `ImageExtension` (extending the built-in Image). Each uses `ReactNodeViewRenderer` to render a React component as the node view.

**VideoExtension attributes**: `src`, `poster` (from `data-poster`), `caption` (from `data-caption`), `assetId` (from `data-asset-id`), `controls`, `width`, `height`.

**parseHTML**: Must match both `<video[src]>` tags (for new and legacy documents). The `addAttributes` method defines `parseHTML` functions that read `data-*` attributes from the DOM element.

**renderHTML**: Outputs `<video>` with standard + data-* attributes. The `addNodeView` method returns `ReactNodeViewRenderer(VideoNodeView)`.

### React 19 Compatibility

The project uses React 19.x. Tiptap 2.x officially targets React 18+ but works with React 19 in practice. Key mitigation: use `immediatelyRender: false` in `useEditor()` to prevent StrictMode double-initialization issues. This should be validated in a brief spike at the start of Phase 1.

### Known Serialization Limitations

- **Tables**: Multi-paragraph cells lose content on markdown round-trip. Acceptable for Phase 1; custom serializer in Phase 4.
- **Code blocks**: `tiptap-markdown` may not preserve language identifiers (` ```python ` → ` ``` `). Custom code block serializer needed in Phase 4.
- **Underline**: Serializes as `<u>text</u>` HTML inside markdown (not native markdown syntax). Works with `html: true`.

---

## 5. Media Handling

### Insertion Flow

All three media types (image, video, audio) follow the same pattern:

1. User clicks Insert button in toolbar (or slash command menu)
2. `MediaInsertMenu` popover opens with tabs: "Library" | "Upload"
3. Library tab: search via `trpc.library.listDocuments({ filters: { itemType: "image" } })`
4. User clicks item → Tiptap command inserts the appropriate node
5. Upload tab: file picker → upload to S3/R2 → insert node on success

### Node Interactions (Edit Mode)

When user clicks a media block:
- `MediaSelectionOverlay` appears with action buttons: Replace, Edit Alt/Caption, Align, Remove
- Caption is editable inline below the media element
- Image resize handles available in Phase 4

### Drag & Drop (Phase 2)

Implement `handleDrop` in Tiptap's `editorProps` to:
1. Intercept file drops
2. Validate MIME type (image/*, video/*, audio/*)
3. Upload to S3/R2 via existing upload endpoint
4. Insert appropriate node at drop position

### Clipboard Image Paste (Phase 2)

Implement `handlePaste` in Tiptap's `editorProps` to:
1. Check `clipboardData.items` for image types
2. Extract `File` object via `getAsFile()`
3. Upload to S3/R2
4. Insert ImageNode at cursor position

### Rich Paste (Phase 2)

Implement `transformPastedHTML` to sanitize content from Word/Google Docs:
1. Strip Word-specific XML tags (`<o:p>`, `<w:sdt>`)
2. Remove inline styles (Word adds excessive `mso-*` styles)
3. Pass through DOMPurify with editor-appropriate allowlist
4. Return cleaned HTML for Tiptap to parse

### Security

- Video/audio sources: ONLY uploaded files or library assets (no arbitrary URLs)
- No iframe embeds
- All pasted HTML is DOMPurify-sanitized before insertion
- `data-poster` URLs must be validated (could contain `javascript:` — validate in VideoNodeView before using as `<video poster>` attribute)

---

## 6. Conflict Resolution

### Problem

Auto-save fires every 2 seconds. If a user opens the same document in two browser tabs, both will auto-save independently. The server uses `expectedUpdatedAt` (optimistic locking) to detect conflicts — the second save will fail with `LibraryMarkdownVersionConflictError`.

### Solution (from interview)

When `saveMarkdown` throws a conflict error:

1. Auto-save pauses (no retry loop)
2. `ConflictResolutionDialog` appears with two options:
   - **"บันทึกทับ" (Overwrite)**: Re-send save without `expectedUpdatedAt` — last-write-wins
   - **"โหลดใหม่" (Reload)**: Fetch latest version via `getMarkdownContent`, re-parse into Tiptap — user loses unsaved local changes
3. Both options update `markdownDraftByDocId` to reflect the new state

### Implementation Notes

The dialog should show a warning message explaining that another tab/user has modified the document. It should NOT show a diff (too complex for Phase 3). The dialog uses the existing Radix AlertDialog pattern from the codebase.

Auto-save resumes after the user makes a choice. If the user dismisses the dialog without choosing, auto-save stays paused and the save status shows "Conflict detected".

---

## 7. Slash Command Menu (Phase 1)

### UX

When user types `/` at the start of a line (or after a paragraph):
1. Dropdown menu appears below cursor
2. Options: Heading 1-4, Bullet List, Ordered List, Quote, Code Block, Divider, Image, Video, Audio, Table
3. User can type to filter (e.g., `/hea` → shows only "Heading" options)
4. Enter or click to insert
5. Escape to dismiss

### Implementation

Use `@tiptap/suggestion` extension (added to packages in Section 4). The menu component renders as a floating popover positioned relative to the cursor. Each option has an icon (Lucide) and label (i18n).

For media options (Image, Video, Audio): selecting opens `MediaInsertMenu` instead of directly inserting a node.

---

## 8. Split-Panel Removal (Phase 3)

This is the highest-risk phase because it modifies DocumentManagement.tsx (2344+ lines) with many interdependent state variables.

### Removal Checklist

**State to delete**:
- `isMarkdownPreviewPanelOpen` (line 154) + all toggle logic
- `isPreviewExpanded` (line 156)
- `previewPanelWidth` (line 162) + CSS references
- `isPreviewFullWidth` derived value (line 1082) + JSX at lines ~2215, 2247-2249

**UI to delete**:
- Desktop SafeMarkdown preview panel (lines ~2232-2245)
- Mobile `mobileTab === "preview"` tab rendering (lines ~1754-1760)
- Resize handle between editor and preview (lines ~1097-1108, the `"preview"` branch of `beginHorizontalResize`)
- `onEnterEditMode` callback that opens preview panel (line 2196)

**State to modify**:
- `mobileTab` type: `"library" | "editor" | "preview"` → `"library" | "editor"`
- `markdownDraftByDocId`: Keep, but wire Tiptap's `onUpdate` as the update source
- `onEnterEditMode`: Change from "open preview panel" to "enter edit mode on UnifiedDocumentSurface"

**State to keep unchanged**:
- `isLibraryPanelOpen` — library browser still needed
- `isEditorPanelCollapsed` — collapse editor panel feature still useful
- `libraryPanelWidth` — library panel resizing still needed
- `openEditorTabs` — tab management unchanged
- `beforeunload` guard — works via `markdownDraftByDocId` (no change needed)

### Layout Change

Desktop: 3-column (library + editor + preview) → 2-column (library + editor). The editor panel expands to fill the space previously occupied by the preview panel.

Mobile: 3 tabs → 2 tabs. The "preview" tab is removed. Content renders in View mode within the editor tab.

### Integration with DocumentPreviewPanel

In DocumentPreviewPanel, the `previewType === "markdown"` branch currently lazy-loads `MarkdownFileEditor`. Replace with lazy-loaded `UnifiedDocumentSurface`, passing the same props:

| Prop | Maps to |
|------|---------|
| `value` (markdown string) | `initialContent` on UnifiedDocumentSurface |
| `onChange` | `onContentChange` (fired from Tiptap `onUpdate`) |
| `onSave` | `onSave` (triggered by Ctrl+S or auto-save) |
| `onVersionRestore` | `onVersionRestore` (refreshes Tiptap content) |
| `onEnterEditMode` | `onEnterEditMode` (switches internal mode to Edit) |
| `isSaving` | `isSaving` (shows "Saving..." in toolbar) |
| `errorMessage` | `errorMessage` (shows error banner) |
| `documentId` | `documentId` (for version history) |

---

## 9. SafeMarkdown Fixes (Phase 3)

SafeMarkdown is used outside the editor (in chat messages, export views, other previews). It must correctly render the new media format with extended attributes.

### Changes Required

1. **DOMPurify config** (line 69): Add `ADD_ATTR: ["data-poster", "data-caption", "data-asset-id"]` to the sanitize options. Keep `ALLOW_DATA_ATTR: false` — only these three specific attributes are whitelisted.

2. **MediaPart type** (line 205): Widen from `{ kind, src }` to `{ kind, src, poster?, caption?, assetId? }`.

3. **MEDIA_TAG_REGEX** (line 210): Extend the regex (or switch to a DOM parser) to extract `data-poster`, `data-caption`, and `data-asset-id` attributes from matched `<video>`/`<audio>` tags.

4. **Render path** (~lines 260-280): Pass extracted attributes as props to the rendered `<video>`/`<audio>` React elements. Use `poster` as the `<video poster>` attribute (after URL validation). Display `caption` as a `<p>` below the player.

---

## 10. Internationalization

The app supports English and Thai. All new user-facing strings must be added to both locale files:

- `apps/web/client/src/lib/i18n/locales/en.ts`
- `apps/web/client/src/lib/i18n/locales/th.ts`

New keys needed:
- Editor mode labels: "View", "Edit", "Source"
- Toolbar actions: "Bold", "Italic", "Heading", "Insert Image", etc.
- Save status: "Saving...", "Saved", "Unsaved changes"
- Placeholder: "Start writing..." / "เริ่มเขียนเนื้อหา..."
- Conflict dialog: "Document modified elsewhere", "Overwrite", "Reload"
- Slash command labels: "Heading 1", "Bullet List", etc.

The Tiptap Placeholder extension takes a string — pass `t("editor.placeholder")` from the i18n hook.

---

## 11. Editor Styling

Create `editor.css` scoped under `.tiptap-editor` class. Use Tailwind `@apply` directives for:
- Heading sizes (h1-h4)
- Paragraph spacing
- List bullet/number styles
- Code block background
- Blockquote border-left
- Table borders
- Link colors

The `.ProseMirror` placeholder styling uses `::before` pseudo-element with `content: attr(data-placeholder)`.

Avoid CSS modules — the project uses global Tailwind. Scope everything under `.tiptap-editor .ProseMirror { ... }` to prevent style leaks.

---

## 12. Testing Strategy

### Unit Tests (Vitest)

- `TiptapMarkdownBridge.test.ts`: Round-trip serialization for all block types (paragraph, heading, list, code, table, image, video, audio). Verify no data loss.
- `mediaSerializationRules.test.ts`: Verify `<video>` + `<audio>` tags with `data-*` attributes parse and serialize correctly.
- `ConflictResolutionDialog.test.tsx`: Verify dialog renders, button clicks fire correct callbacks.

### Integration Tests

- `UnifiedDocumentSurface.test.tsx`: Mount with markdown content, verify Tiptap renders. Switch modes (View→Edit→Source→View). Verify auto-save fires.
- `SafeMarkdown.test.tsx`: Verify `data-poster`, `data-caption` preserved through DOMPurify + splitByMedia pipeline.

### Manual QA

- 20 acceptance criteria (see spec §12)
- QA test matrix: 21 test cases at P0-P2 priority (see spec §15)
- Performance test: Open a 20K-word document, measure input latency

---

## 13. Rollback Strategy

Since the rollout is all-at-once (no feature flag):

1. **MarkdownFileEditor.tsx is NOT deleted** — kept in codebase as dormant fallback
2. **Emergency rollback**: Git revert the Phase 3 commit → MarkdownFileEditor re-activates
3. **Data safety**: Storage format is unchanged (markdown string). Old editor reads Tiptap-written content 100% correctly. New `data-*` attributes on `<video>` tags are harmless to the old editor (it inserts `<video>` tags too).
4. **Trigger rollback if**: Editor crashes >3x/day, any data loss reported, serialization corruption detected

---

## 14. Implementation Order

### Phase 1 — Foundation + Slash Commands

Create all core editor components in `components/editor/` directory. Start with `TiptapMarkdownBridge` (the most critical piece — if markdown serialization doesn't work, nothing works). Then build `TiptapEditor`, `UnifiedDocumentSurface`, `EditorToolbar`, `SourceModePanel`, and `SlashCommandMenu`. Add `editor.css` for ProseMirror styling.

At the end of Phase 1, the editor should work as a standalone component (mountable in a test page) with full text editing, mode switching, and slash commands — but not yet integrated into DocumentManagement.

### Phase 2 — Media + Paste + Drag-Drop

Add custom extensions and node views for image, video, and audio. Build `MediaInsertMenu` with library search. Implement clipboard paste, rich paste sanitization, and drag-drop upload. Build `MediaSelectionOverlay` for selection actions.

At the end of Phase 2, the editor handles all content types. Still standalone (not integrated).

### Phase 3 — Page Integration

Replace MarkdownFileEditor in DocumentPreviewPanel. Remove all split-panel code from DocumentManagement.tsx. Fix SafeMarkdown media pipeline. Add conflict resolution dialog. Wire dirty state tracking. Add i18n keys. Add feature flag to featureFlags.ts (for git-revert reference).

This is the "big switch" — after Phase 3, users see the new editor.

### Phase 4 — Hardening & Polish

Serialization tests, legacy content fixes, error boundaries, performance optimization (20K words), BubbleMenu, image resize handles, table editing UX, code block language preservation, accessibility, Thai IME testing, undo-mode-switch warning, max document size warning, print/export.

---

## 15. Risk Register

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| Markdown round-trip changes formatting | HIGH | LOW | Source Mode fallback; serialization tests catch regressions |
| React 19 StrictMode + Tiptap crash | LOW | HIGH | `immediatelyRender: false`; spike test before Phase 1 |
| 20K-word doc performance degradation | MEDIUM | MEDIUM | ProseMirror handles large docs well; benchmark in Phase 4 |
| Phase 3 breaks DocumentManagement state | MEDIUM | HIGH | Surgical removal with explicit checklist; manual QA |
| `tiptap-markdown` abandonment | LOW | MEDIUM | Community package with active maintenance; official package as fallback |
| Legacy HTML in markdown fails to parse | MEDIUM | LOW | Source Mode fallback preserves all content |
