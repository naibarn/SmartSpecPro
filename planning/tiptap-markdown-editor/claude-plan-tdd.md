# TDD Plan: Feature 046 — Tiptap Single-Panel Markdown Editor

Testing framework: **Vitest** with `jsdom` environment for component tests, `node` for unit tests.
Conventions: Files alongside source as `*.test.ts` / `*.test.tsx`, path aliases `@/`, `@shared/`.

---

## Section: TiptapMarkdownBridge (Phase 1)

### Tests to write BEFORE implementation

```
# TiptapMarkdownBridge.test.ts

# Test: parse("# Heading") returns Tiptap JSON with heading node
# Test: parse("**bold** text") returns Tiptap JSON with bold mark
# Test: parse("- item 1\n- item 2") returns Tiptap JSON with bullet list
# Test: parse("> quote") returns Tiptap JSON with blockquote
# Test: parse("```python\ncode\n```") returns code block node (language may not preserve — document result)
# Test: parse("| h1 | h2 |\n|---|---|\n| a | b |") returns table structure
# Test: parse("---") returns horizontal rule
# Test: parse("![alt](url)") returns image node with src and alt
# Test: parse('<video src="url" controls></video>') returns video node
# Test: parse('<video src="url" data-poster="p" data-caption="c" data-asset-id="123"></video>') preserves data-* attrs
# Test: parse('<audio src="url" controls></audio>') returns audio node
# Test: serialize(headingDoc) produces "# Heading\n"
# Test: serialize(imageDoc) produces "![alt](url)"
# Test: serialize(videoDoc) produces '<video src="..." controls ...></video>'
# Test: round-trip: parse(serialize(parse(md))) === parse(md) for each block type
# Test: parse("") returns empty document (not crash)
# Test: parse("<div>unknown html</div>") doesn't crash — falls back gracefully
```

---

## Section: Editor Modes (Phase 1)

### Tests to write BEFORE implementation

```
# UnifiedDocumentSurface.test.tsx

# Test: renders in View mode by default (editable: false)
# Test: clicking Edit button switches to Edit mode (editable: true, toolbar visible)
# Test: clicking Source button shows CodeMirror, hides Tiptap
# Test: switching Edit→Source serializes current content to markdown
# Test: switching Source→Edit re-parses markdown into Tiptap
# Test: switching Edit→View triggers auto-save callback
# Test: switching Source→View triggers auto-save callback
# Test: View mode hides toolbar formatting buttons
# Test: Edit mode shows toolbar formatting buttons
# Test: double-click in View mode enters Edit mode
```

---

## Section: Auto-Save (Phase 1)

### Tests to write BEFORE implementation

```
# UnifiedDocumentSurface.test.tsx (continued)

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

---

## Section: SlashCommandMenu (Phase 1)

### Tests to write BEFORE implementation

```
# SlashCommandMenu.test.tsx

# Test: typing "/" at start of empty paragraph shows menu
# Test: typing "/hea" filters to heading options
# Test: selecting "Heading 1" inserts h1 block
# Test: selecting "Image" opens MediaInsertMenu
# Test: pressing Escape closes menu
# Test: pressing Enter selects first filtered option
# Test: menu shows correct i18n labels
```

---

## Section: Media Extensions (Phase 2)

### Tests to write BEFORE implementation

```
# imageExtension.test.ts

# Test: parseHTML('<img src="url" alt="text">') creates ImageNode
# Test: parseHTML('<figure><img src="url"><figcaption>cap</figcaption></figure>') creates ImageNode with caption
# Test: renderHTML produces <img> tag with src and alt
# Test: ImageNode attributes: src, alt, caption, width, alignment, assetId all round-trip

# videoExtension.test.ts

# Test: parseHTML('<video src="url" controls>') creates VideoNode
# Test: parseHTML('<video src="url" data-poster="p" data-caption="c">') preserves data-* attrs
# Test: parseHTML legacy '<video src="url" controls width="100%" style="...">') handles style attr gracefully
# Test: renderHTML produces <video> tag with controls and data-* attrs
# Test: VideoNode command `setVideo({ src, poster, caption })` inserts node

# audioExtension.test.ts

# Test: parseHTML('<audio src="url" controls>') creates AudioNode
# Test: renderHTML produces <audio> tag with controls
```

---

## Section: Media Node Views (Phase 2)

### Tests to write BEFORE implementation

```
# ImageNodeView.test.tsx

# Test: renders <img> with correct src and alt
# Test: shows caption below image when caption attr set
# Test: click shows MediaSelectionOverlay with action buttons
# Test: "Remove" button calls deleteNode()
# Test: "Edit Alt" opens inline alt text editor

# VideoNodeView.test.tsx

# Test: renders <video> element with controls
# Test: shows caption below video when caption attr set
# Test: validates src URL (rejects javascript: protocol)
# Test: poster attribute applied to <video poster>
# Test: click in edit mode shows selection overlay

# MediaInsertMenu.test.tsx

# Test: renders Library and Upload tabs
# Test: Library tab searches via trpc.library.listDocuments
# Test: clicking an image item fires onInsert callback with correct attrs
# Test: Upload tab handles file selection
```

---

## Section: Paste & Drag-Drop (Phase 2)

### Tests to write BEFORE implementation

```
# paste-handlers.test.ts

# Test: pasting image from clipboard triggers upload + insert
# Test: pasting rich HTML from Word sanitizes Word-specific markup
# Test: pasting rich HTML preserves basic formatting (bold, italic, links)
# Test: pasting plain markdown text converts to rich content
# Test: pasted HTML with <script> tags are stripped

# drag-drop.test.ts

# Test: dropping an image file triggers upload + insert at drop position
# Test: dropping a non-media file is ignored
# Test: dropping multiple files inserts multiple nodes
```

---

## Section: Page Integration (Phase 3)

### Tests to write BEFORE implementation

```
# DocumentManagement-integration.test.tsx (if feasible in jsdom)

# Test: opening a .md document renders UnifiedDocumentSurface (not MarkdownFileEditor)
# Test: no SafeMarkdown preview panel visible on desktop
# Test: mobile tabs show only "library" and "editor" (no "preview")
# Test: editing content updates markdownDraftByDocId
# Test: dirty document shows asterisk on tab
# Test: closing dirty tab shows confirmation dialog
# Test: beforeunload guard activates when document is dirty

# ConflictResolutionDialog.test.tsx

# Test: renders with warning message
# Test: "Overwrite" button fires onOverwrite callback
# Test: "Reload" button fires onReload callback
# Test: dialog cannot be dismissed without choosing an option
```

---

## Section: SafeMarkdown Fixes (Phase 3)

### Tests to write BEFORE implementation

```
# SafeMarkdown.test.tsx

# Test: <video src="url" data-poster="p"> preserves data-poster through render pipeline
# Test: <video src="url" data-caption="c"> preserves data-caption
# Test: <video src="url" data-asset-id="123"> preserves data-asset-id
# Test: <video src="url" data-malicious="evil"> strips non-whitelisted data attrs
# Test: caption rendered as text below video player
# Test: data-poster="javascript:alert(1)" is sanitized (not used as poster URL)
# Test: existing documents without data-* attrs still render correctly
```

---

## Section: Serialization Guard (Phase 4)

### Tests to write BEFORE implementation

```
# serialization-guard.test.ts

# Test: simple paragraph round-trips without warning
# Test: heading + list + blockquote round-trips without warning
# Test: document with 10+ nodes round-trips within 90% node count threshold
# Test: complex nested structure that loses nodes triggers warning
# Test: empty document doesn't trigger false positive
# Test: document with legacy HTML preserves content through guard
```

---

## Section: Performance (Phase 4)

### Tests to write BEFORE implementation

```
# performance.test.ts (may need custom benchmark harness)

# Test: 5,000-word document loads in <500ms
# Test: 20,000-word document loads in <2000ms
# Test: typing latency <100ms on 20,000-word document
# Test: mode switch (View→Edit) completes in <500ms on 20K-word doc
# Test: serialization of 20K-word document completes in <1000ms
```
