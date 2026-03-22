<!-- PROJECT_CONFIG
runtime: typescript-pnpm
test_command: cd apps/web && pnpm vitest run
END_PROJECT_CONFIG -->

<!-- SECTION_MANIFEST
section-01-tiptap-setup
section-02-markdown-bridge
section-03-editor-surface
section-04-toolbar-modes
section-05-slash-commands
section-06-media-extensions
section-07-media-node-views
section-08-media-insert-menu
section-09-paste-dragdrop
section-10-page-integration
section-11-safemarkdown-fixes
section-12-conflict-dialog
section-13-hardening-tests
END_MANIFEST -->

# Implementation Sections Index

## Dependency Graph

| Section | Depends On | Blocks | Parallelizable |
|---------|------------|--------|----------------|
| section-01-tiptap-setup | - | 02, 03, 04, 05, 06 | Yes (standalone) |
| section-02-markdown-bridge | 01 | 03, 06 | No |
| section-03-editor-surface | 01, 02 | 04, 05, 10 | No |
| section-04-toolbar-modes | 03 | 10 | Yes |
| section-05-slash-commands | 03 | 10 | Yes |
| section-06-media-extensions | 01, 02 | 07, 08, 09 | No |
| section-07-media-node-views | 06 | 08, 10 | Yes |
| section-08-media-insert-menu | 06, 07 | 09, 10 | No |
| section-09-paste-dragdrop | 06, 08 | 10 | No |
| section-10-page-integration | 03, 04, 05, 07, 08, 09 | 11, 12 | No |
| section-11-safemarkdown-fixes | 06 | 13 | Yes |
| section-12-conflict-dialog | 10 | 13 | Yes |
| section-13-hardening-tests | 10, 11, 12 | - | No |

## Execution Order (Batches)

1. **Batch 1**: section-01-tiptap-setup (no dependencies)
2. **Batch 2**: section-02-markdown-bridge (after 01)
3. **Batch 3**: section-03-editor-surface (after 01, 02)
4. **Batch 4**: section-04-toolbar-modes, section-05-slash-commands (parallel after 03)
5. **Batch 5**: section-06-media-extensions (after 01, 02)
6. **Batch 6**: section-07-media-node-views, section-11-safemarkdown-fixes (parallel after 06)
7. **Batch 7**: section-08-media-insert-menu (after 06, 07)
8. **Batch 8**: section-09-paste-dragdrop (after 06, 08)
9. **Batch 9**: section-10-page-integration (after 03-09)
10. **Batch 10**: section-12-conflict-dialog (after 10)
11. **Batch 11**: section-13-hardening-tests (after 10, 11, 12)

## Section Summaries

### section-01-tiptap-setup
Install Tiptap packages, create `editor.css` with ProseMirror base styles, verify React 19 compatibility with `immediatelyRender: false`.

### section-02-markdown-bridge
Create `TiptapMarkdownBridge.ts` — the core parse/serialize module using `tiptap-markdown`. Round-trip tests for all block types.

### section-03-editor-surface
Create `TiptapEditor.tsx` (main ProseMirror surface) and `UnifiedDocumentSurface.tsx` (shell managing View/Edit/Source modes). Create `SourceModePanel.tsx` reusing CodeMirrorEditor. Auto-save with 2s debounce.

### section-04-toolbar-modes
Create `EditorToolbar.tsx` — mode switcher (View/Edit/Source), formatting buttons, save status indicator, undo/redo. i18n integration.

### section-05-slash-commands
Create `SlashCommandMenu.tsx` using `@tiptap/suggestion`. Menu items: headings, lists, quote, code, divider, image/video/audio, table.

### section-06-media-extensions
Create `imageExtension.ts`, `videoExtension.ts`, `audioExtension.ts` — Tiptap custom extensions with `parseHTML`, `renderHTML`, `addAttributes` for media nodes. Create `mediaSerializationRules.ts`.

### section-07-media-node-views
Create `ImageNodeView.tsx`, `VideoNodeView.tsx`, `AudioNodeView.tsx` — React node views with inline rendering, caption editing, `MediaSelectionOverlay.tsx` for selection actions.

### section-08-media-insert-menu
Create `MediaInsertMenu.tsx` — popover with Library/Upload tabs, search via `trpc.library.listDocuments`, insert node on selection.

### section-09-paste-dragdrop
Implement `handlePaste` for clipboard images, `transformPastedHTML` for Word/Docs sanitization, `handleDrop` for file drag-and-drop with upload.

### section-10-page-integration
Replace MarkdownFileEditor in DocumentPreviewPanel. Remove split-panel code from DocumentManagement.tsx (3→2 columns, 3→2 mobile tabs). Wire dirty state, beforeunload guard, onEnterEditMode. Add i18n keys to en.ts + th.ts.

### section-11-safemarkdown-fixes
Fix SafeMarkdown.tsx: DOMPurify ADD_ATTR, widen MediaPart type, extend splitByMedia regex to capture data-* attributes, pass to rendered elements.

### section-12-conflict-dialog
Create `ConflictResolutionDialog.tsx` — shown on `expectedUpdatedAt` mismatch, options: overwrite (force save) or reload (fetch latest). Integration with auto-save pause/resume.

### section-13-hardening-tests
Serialization round-trip tests, legacy content parsing, error boundaries, performance benchmarks (20K words), accessibility audit, Thai IME verification.
