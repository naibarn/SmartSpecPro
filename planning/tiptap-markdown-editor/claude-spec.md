# Synthesized Specification: Feature 046 — Tiptap Single-Panel Markdown Editor

## Overview

Replace SmartSpecPro's split-panel markdown editor (CodeMirror + SafeMarkdown preview) with a **Tiptap OSS single-panel rich markdown editor**. Users edit and view content in one unified surface, with images/videos rendered inline. Markdown remains the canonical storage format — no database migration required.

---

## Source Documents

- **spec.md**: 1002-line spec (7 review rounds, all HIGH/MEDIUM issues resolved)
- **claude-research.md**: Codebase audit (DocumentManagement.tsx, MarkdownFileEditor.tsx, SafeMarkdown.tsx, library router) + Tiptap API reference
- **claude-interview.md**: 5 stakeholder decisions

---

## Key Decisions from Interview

| Decision | User Choice | Impact |
|----------|-------------|--------|
| Rollout strategy | **Switch all tenants at once** | No feature flag per-tenant rollout; MarkdownFileEditor preserved as git-revert fallback |
| Concurrent edit conflict | **Alert + choose overwrite or reload** | Conflict resolution dialog needed for `expectedUpdatedAt` mismatch |
| Document size | **5,000-20,000 words** | Performance benchmark: <100ms input latency at 20K words (~100K chars) |
| Slash command menu | **Phase 1 (core)** | Moved from Phase 4 → Phase 1 |
| Drag & drop media | **Phase 2 (with media)** | Moved from Phase 4 → Phase 2 |

---

## Architecture

### Current State (3-panel)
```
┌──────────┬──────────────────────┬────────────────┐
│ Library  │  Editor (CodeMirror) │ Preview        │
│ Browser  │  OR View (Markdown)  │ (SafeMarkdown) │
└──────────┴──────────────────────┴────────────────┘
```

### Target State (2-panel)
```
┌──────────┬─────────────────────────────────────────┐
│ Library  │  Unified Tiptap Editor                  │
│ Browser  │  (View + Edit + Source in one surface)   │
└──────────┴─────────────────────────────────────────┘
```

### Data Flow
```
Load:  DB → tRPC getMarkdownContent → TiptapMarkdownBridge.parse(md) → Tiptap renders
Save:  Tiptap doc → TiptapMarkdownBridge.serialize(doc) → tRPC saveMarkdown → DB
```

### Component Hierarchy
```
DocumentPreviewPanel (existing — modified)
 ├─ [Outer Header — title/rename/share/download]
 └─ [previewType === "markdown"]
     └─ UnifiedDocumentSurface (NEW)
         ├─ EditorToolbar (mode switch, formatting, save status)
         ├─ TiptapEditor (main surface)
         │   ├─ ImageNodeView, VideoNodeView, AudioNodeView
         │   ├─ SlashCommandMenu
         │   └─ BubbleMenu
         ├─ SourceModePanel (CodeMirror fallback)
         └─ ConflictResolutionDialog (NEW — from interview)
```

---

## Content Model

### Block Types
| Block | Extension | Markdown |
|-------|-----------|----------|
| paragraph | built-in | plain text |
| heading (1-4) | built-in | `# ## ### ####` |
| bullet_list | built-in | `- item` |
| ordered_list | built-in | `1. item` |
| blockquote | built-in | `> text` |
| code_block | built-in | ` ```lang ``` ` |
| horizontal_rule | built-in | `---` |
| table | Table + Row/Cell/Header | GFM table |
| image | Custom ImageExtension | `![alt](src)` |
| video | Custom VideoExtension | `<video src controls>` |
| audio | Custom AudioExtension | `<audio src controls>` |

### Inline Marks
bold (`**`), italic (`*`), strike (`~~`), underline (`<u>`), code (`` ` ``), link (`[](url)`)

### Media Serialization
- Images: `![alt](url)` or `<figure><img>` for extended attrs
- Videos: `<video src="..." controls width="100%" data-poster="..." data-caption="..." data-asset-id="..."></video>`
- Audio: `<audio src="..." controls style="width:100%;"></audio>`
- Backward compat: existing `<video>` tags with `style` attrs parse correctly

---

## Modes of Operation

| Mode | Behavior |
|------|----------|
| View (default) | Read-only rendered content, no editing chrome |
| Edit | WYSIWYG editing, toolbar visible, auto-save 2s debounce |
| Source | Raw markdown in CodeMirror, for power users |

**Mode switch rules**: Save-on-exit whenever leaving Edit or Source mode.

---

## Files to Create (~15)

```
apps/web/client/src/components/editor/
├── index.ts
├── TiptapEditor.tsx
├── TiptapMarkdownBridge.ts
├── UnifiedDocumentSurface.tsx
├── EditorToolbar.tsx
├── SourceModePanel.tsx
├── editor.css
├── toolbar/
│   ├── BubbleMenu.tsx
│   ├── SlashCommandMenu.tsx (moved to Phase 1)
│   └── MediaInsertMenu.tsx
├── nodes/
│   ├── ImageNodeView.tsx
│   ├── VideoNodeView.tsx
│   ├── AudioNodeView.tsx
│   └── MediaSelectionOverlay.tsx
└── extensions/
    ├── imageExtension.ts
    ├── videoExtension.ts
    ├── audioExtension.ts
    └── mediaSerializationRules.ts
```

## Files to Modify (~7)

```
DocumentPreviewPanel.tsx  — Swap MarkdownFileEditor → UnifiedDocumentSurface
DocumentManagement.tsx    — Remove page-level split-panel (3→2 columns)
SafeMarkdown.tsx          — ADD_ATTR + widen MediaPart + fix splitByMedia regex
en.ts                     — Editor i18n keys
th.ts                     — Editor Thai translations
featureFlags.ts           — Add tiptapEditorEnabled flag (for git-revert safety)
package.json              — Add tiptap deps
```

---

## Implementation Phases (Updated from Interview)

### Phase 1 — Foundation + Slash Commands
- Tiptap setup with React 19 (`immediatelyRender: false`)
- TiptapMarkdownBridge (parse/serialize via `tiptap-markdown`)
- UnifiedDocumentSurface shell
- EditorToolbar (mode switch, formatting, save status)
- SourceModePanel (reuse CodeMirrorEditor)
- View/Edit/Source modes + save-on-exit
- Loading skeleton + error fallback to Source Mode
- Basic blocks: heading, paragraph, list, quote, code, table, hr
- Inline marks: bold, italic, strike, underline, code, link
- Auto-save (2s debounce) + manual save (Ctrl+S)
- Keyboard shortcuts (Cmd+B/I/K)
- **Slash command menu** (`/` to insert blocks) — MOVED FROM PHASE 4
- editor.css (ProseMirror styles scoped under .tiptap-editor)

### Phase 2 — Media + Paste + Drag-Drop
- ImageNodeView, VideoNodeView, AudioNodeView
- MediaInsertMenu (library search picker)
- Image/video/audio extensions with custom attributes
- mediaSerializationRules.ts
- Media selection overlay + quick actions (replace, remove, align)
- Clipboard image paste (Ctrl+V → upload + insert)
- Rich paste handling (transformPastedHTML for Word/Google Docs)
- **Drag & drop media from desktop** — MOVED FROM PHASE 4

### Phase 3 — Page Integration & Split-Panel Removal
- Replace MarkdownFileEditor in DocumentPreviewPanel
- Remove ALL page-level split-panel code in DocumentManagement.tsx:
  - `isMarkdownPreviewPanelOpen`, `isPreviewExpanded`, `previewPanelWidth`, `isPreviewFullWidth`
  - Desktop SafeMarkdown preview panel, mobile preview tab, resize handle
  - 3-column → 2-column layout, 3-tab → 2-tab mobile
- Fix `onEnterEditMode` contract (desktop + mobile)
- Sync `markdownDraftByDocId` with Tiptap `onUpdate`
- Preserve `beforeunload` guard + dirty-dot + tab-close confirmation
- SafeMarkdown.tsx fixes: ADD_ATTR, widen MediaPart, fix splitByMedia regex
- i18n keys (en.ts + th.ts)
- **Conflict resolution dialog** (from interview: alert + overwrite/reload)
- Verify legacy `<video>` tag backward compatibility
- Test concurrent editing (2 tabs, expectedUpdatedAt lock)

### Phase 4 — Hardening & Polish
- Serialization round-trip tests
- Legacy content parsing improvements
- Fallback UX (auto-switch to Source Mode on parse fail)
- Error boundaries around editor
- Performance testing (20K words = ~100K chars)
- BubbleMenu (context menu on text selection)
- Image resize handles
- Table editing UX
- Custom code block serializer (preserve language tags)
- Accessibility (ARIA labels, keyboard navigation)
- Thai IME testing
- Undo/redo mode switch warning
- Max document size warning (>50K chars)
- Print / Export

---

## Risks

| Risk | Level | Mitigation |
|------|-------|-----------|
| Markdown fidelity (round-trip changes) | MEDIUM | Source Mode fallback + serialization tests |
| Video security (untrusted sources) | LOW | Only uploaded/library assets, no arbitrary iframes |
| Legacy content (exotic HTML) | MEDIUM | Compatibility mode (Source Mode fallback) |
| Bundle size (+50KB gzipped) | LOW | Lazy-load editor |
| React 19 + Tiptap | LOW-MEDIUM | Spike test with `immediatelyRender: false` |
| DocumentManagement.tsx complexity (2344+ lines) | MEDIUM | Separate Phase 3 from Phase 1-2 |

---

## Acceptance Criteria (20 items)

1. Single pane (no preview panel)
2. Click Edit → type in place
3. Insert image from library → inline render
4. Insert video → player inline
5. Save → reopen → no data loss
6. Legacy markdown opens without data loss
7. Parse fail → Source Mode fallback
8. No split-panel UI elements remaining
9. Source Mode shows raw editable markdown
10. Ctrl+S saves
11. Auto-save works (2s debounce)
12. Desktop: 2-column layout only
13. Mobile: 2-tab layout only
14. No PanelLeftClose/PanelRightClose buttons
15. Legacy `<video>` tags parse correctly
16. Ctrl+V paste image works
17. Paste from Word/Docs sanitized
18. 2-tab concurrent edit → conflict dialog
19. Thai input (IME) works
20. Toolbar has ARIA labels + keyboard nav
