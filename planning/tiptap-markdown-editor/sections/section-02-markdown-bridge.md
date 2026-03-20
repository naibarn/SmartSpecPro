The packages haven't been installed yet -- that's section 01's job. Now I have all the context needed.

# Section 02: Markdown Bridge (`TiptapMarkdownBridge`)

## Overview

This section creates `TiptapMarkdownBridge.ts`, the core module responsible for converting between raw Markdown strings (the storage format) and Tiptap's ProseMirror JSON document model. Every other editor component depends on this bridge -- it is the single source of truth for parse and serialize operations. If this module does not round-trip markdown correctly, the editor will lose user data.

The bridge wraps the `tiptap-markdown` package (installed in section 01) and adds custom serialization rules for `<video>` and `<audio>` HTML tags with `data-*` attributes.

## Dependencies

- **Section 01 (tiptap-setup)** must be completed first. It installs all Tiptap packages including `tiptap-markdown`, `@tiptap/starter-kit`, `@tiptap/extension-image`, `@tiptap/extension-table`, `@tiptap/extension-link`, `@tiptap/extension-underline`, and creates `editor.css`.

## File Paths

| File | Action |
|------|--------|
| `apps/web/client/src/components/editor/TiptapMarkdownBridge.ts` | CREATE |
| `apps/web/client/src/components/editor/TiptapMarkdownBridge.test.ts` | CREATE |

## Tests (Write First)

Create `apps/web/client/src/components/editor/TiptapMarkdownBridge.test.ts` with the following test stubs. The test file uses Vitest with the `node` environment (no DOM needed for pure parse/serialize logic, though `tiptap-markdown` may require `jsdom` -- adjust the `@vitest-environment` pragma accordingly if needed).

```
File: apps/web/client/src/components/editor/TiptapMarkdownBridge.test.ts

Import { describe, it, expect } from "vitest"
Import { parse, serialize } from "./TiptapMarkdownBridge"

describe("TiptapMarkdownBridge.parse", () => {

  it("parses heading markdown into a Tiptap JSON document with a heading node")
    // Input: "# Heading"
    // Expect: result contains a node with type "heading" and attrs.level === 1

  it("parses bold text into marks")
    // Input: "**bold** text"
    // Expect: result contains a text node with a "bold" mark

  it("parses bullet list into bulletList node")
    // Input: "- item 1\n- item 2"
    // Expect: result contains a bulletList node with two listItem children

  it("parses blockquote into blockquote node")
    // Input: "> quote"
    // Expect: result contains a blockquote node

  it("parses fenced code block into codeBlock node")
    // Input: "```python\ncode\n```"
    // Expect: result contains a codeBlock node
    // Note: language attribute may or may not be preserved -- document the actual behavior

  it("parses table markdown into table structure")
    // Input: "| h1 | h2 |\n|---|---|\n| a | b |"
    // Expect: result contains a table node with tableRow children

  it("parses horizontal rule into horizontalRule node")
    // Input: "---"
    // Expect: result contains a horizontalRule node

  it("parses image markdown into image node with src and alt")
    // Input: "![alt text](https://example.com/img.png)"
    // Expect: result contains an image node with src and alt attributes

  it("parses <video> HTML tag into video node")
    // Input: '<video src="https://example.com/v.mp4" controls></video>'
    // Expect: result contains a video node with src attribute
    // NOTE: This test will initially fail until custom video extension is registered.
    //       For now, document that it falls through to raw HTML. Full support comes in section 06.

  it("parses <video> with data-* attributes and preserves them")
    // Input: '<video src="url" data-poster="p.jpg" data-caption="My caption" data-asset-id="abc-123" controls></video>'
    // Expect: video node preserves poster, caption, assetId attributes
    // NOTE: Same caveat as above -- depends on section 06 custom extension.

  it("parses <audio> HTML tag into audio node")
    // Input: '<audio src="https://example.com/a.mp3" controls></audio>'
    // Expect: result contains an audio node with src attribute
    // NOTE: Depends on section 06 custom extension.

  it("parses empty string into an empty document without crashing")
    // Input: ""
    // Expect: result is a valid document node (type "doc") with no content or a single empty paragraph

  it("parses unknown HTML gracefully without crashing")
    // Input: "<div>unknown html</div>"
    // Expect: does not throw; returns a valid document (content may be stripped or treated as paragraph text)
})

describe("TiptapMarkdownBridge.serialize", () => {

  it("serializes a heading document to '# Heading' markdown")
    // Input: Tiptap JSON doc with heading node level 1, text "Heading"
    // Expect: output contains "# Heading"

  it("serializes an image node to markdown image syntax")
    // Input: Tiptap JSON doc with image node { src: "url", alt: "text" }
    // Expect: output contains "![text](url)"

  it("serializes a video node to <video> HTML with data-* attributes")
    // Input: Tiptap JSON doc with video node { src, poster, caption, assetId }
    // Expect: output contains '<video src="..." data-poster="..." data-caption="..." data-asset-id="..." controls></video>'
    // NOTE: Depends on section 06 custom extension for full support.
})

describe("TiptapMarkdownBridge round-trip", () => {

  it("round-trips heading markdown: parse(serialize(parse(md))) equals parse(md)")
    // Input: "# My Heading"
    // parse → serialize → parse again → compare JSON structure to first parse

  it("round-trips paragraph with inline formatting")
    // Input: "This has **bold** and *italic* text"

  it("round-trips bullet list")
    // Input: "- one\n- two\n- three"

  it("round-trips blockquote")
    // Input: "> quoted text"

  it("round-trips image markdown")
    // Input: "![alt](https://example.com/img.png)"

  // Additional round-trip tests for each block type as needed.
  // The key invariant: parse(serialize(parse(md))).toJSON() deep-equals parse(md).toJSON()
})
```

### Test Strategy Notes

- **Media nodes (video, audio)**: The parse/serialize tests for `<video>` and `<audio>` tags will not fully pass until the custom extensions from section 06 are registered. The bridge module should be designed so that extension registration is configurable -- tests can register a minimal set of extensions. For Phase 1 tests, mark video/audio-specific tests with a comment noting they depend on section 06, and skip them (using `it.skip` or `it.todo`) until that section is complete.
- **Round-trip fidelity**: Markdown is a lossy format. Some formatting may change (e.g., extra blank lines, trailing newlines). Tests should compare the parsed JSON structure (node types and attributes), not raw string equality.
- **Headless editor**: `tiptap-markdown` requires a Tiptap `Editor` instance to function. The bridge must create a headless editor (no DOM rendering) for parse/serialize operations. Use `@tiptap/core` `Editor` with `element: undefined` or a detached DOM element in tests.

## Implementation Details

### Architecture

`TiptapMarkdownBridge.ts` exposes two primary functions and one utility:

```
File: apps/web/client/src/components/editor/TiptapMarkdownBridge.ts

Functions:
  parse(markdown: string, extensions?: Extension[]): JSONContent
    - Creates a headless Tiptap editor with the standard extension stack
    - Sets content from the markdown string using tiptap-markdown's parsing
    - Returns the editor's document as JSON (editor.getJSON())
    - Destroys the headless editor to prevent memory leaks

  serialize(doc: JSONContent, extensions?: Extension[]): string
    - Creates a headless Tiptap editor with the standard extension stack
    - Sets content from the JSON document
    - Uses editor.storage.markdown.getMarkdown() to produce markdown
    - Destroys the headless editor
    - Returns the markdown string

  getDefaultExtensions(): Extension[]
    - Returns the standard set of Tiptap extensions used throughout the editor
    - StarterKit, Image, Link, Table, Underline, Markdown extension
    - This is the single source of truth for extension configuration
    - Other components (TiptapEditor, tests) import this to stay in sync
```

### Key Design Decisions

**Headless editor pattern**: Both `parse` and `serialize` spin up a headless Tiptap `Editor` instance, perform their operation, then destroy it. This is necessary because `tiptap-markdown` operates through the editor's storage layer -- there is no standalone parse/serialize API. The headless editor has no DOM attachment and uses `immediatelyRender: false`.

**Extension configurability**: The `extensions` parameter allows callers to pass additional extensions (e.g., the custom VideoExtension from section 06). The `getDefaultExtensions()` function provides the baseline set. When section 06 is implemented, its extensions will be added to `getDefaultExtensions()`.

**Markdown extension configuration**: The `tiptap-markdown` `Markdown` extension must be configured with `html: true` (to support inline HTML like `<video>`, `<u>`, etc.) and `transformPastedText: true` (to convert pasted markdown to rich content).

### Extension Stack (from `getDefaultExtensions`)

The function assembles and returns an array of Tiptap extensions:

1. **StarterKit** -- provides paragraph, heading (levels 1-4), bold, italic, strike, code, codeBlock, blockquote, bulletList, orderedList, listItem, horizontalRule, hardBreak, history.
2. **Image** -- `@tiptap/extension-image` (will be extended in section 06 with custom attributes).
3. **Link** -- `@tiptap/extension-link` with `openOnClick: false` (editing mode should not navigate).
4. **Table + TableRow + TableCell + TableHeader** -- `@tiptap/extension-table` with `resizable: true`.
5. **Underline** -- `@tiptap/extension-underline`.
6. **Markdown** -- `tiptap-markdown` configured with `{ html: true, transformPastedText: true }`.

Custom media extensions (VideoExtension, AudioExtension, extended ImageExtension) are NOT included here in section 02. They are added in section 06 by modifying `getDefaultExtensions()`.

### Handling Edge Cases

- **Empty string input**: `parse("")` should return a valid empty document (a `doc` node with a single empty paragraph, which is ProseMirror's standard empty state).
- **Unknown HTML**: Tags not recognized by any registered extension are either stripped or converted to plain text by ProseMirror's parser. The bridge should not throw.
- **Large documents**: No special handling needed in the bridge itself. ProseMirror handles large documents efficiently. Performance testing is in section 13.
- **Null/undefined input**: Guard against `null` or `undefined` being passed to `parse()` -- treat as empty string.

### Memory Management

Each call to `parse` or `serialize` creates and destroys a headless editor. This is acceptable for the expected call frequency (on load, on save, on mode switch). If profiling in section 13 reveals this is a bottleneck, a singleton editor instance can be cached, but that optimization is deferred.

### Type Exports

The module should export the `JSONContent` type from `@tiptap/core` for consumers that need to work with the parsed document structure. This avoids forcing every consumer to import directly from `@tiptap/core`.

```typescript
export type { JSONContent } from "@tiptap/core";
```

## Integration Points

- **Section 03 (editor-surface)**: `TiptapEditor.tsx` and `UnifiedDocumentSurface.tsx` will call `parse()` on initial load and `serialize()` on save and mode switch. They import `getDefaultExtensions()` to configure their live editor instance.
- **Section 06 (media-extensions)**: Custom VideoExtension, AudioExtension, and extended ImageExtension will be added to `getDefaultExtensions()`. The video/audio parse/serialize tests that are skipped in this section will be un-skipped once section 06 is complete.
- **Section 10 (page-integration)**: The save flow calls `serialize()` to produce the markdown string sent to `trpc.library.saveMarkdown`.
- **Section 13 (hardening-tests)**: Additional round-trip tests for legacy content, performance benchmarks for serialization of large documents.

## Implementation Checklist

1. Create `apps/web/client/src/components/editor/TiptapMarkdownBridge.test.ts` with all test stubs listed above. Mark video/audio tests as `it.todo` or `it.skip` with a note referencing section 06.
2. Create `apps/web/client/src/components/editor/TiptapMarkdownBridge.ts` with the `parse`, `serialize`, and `getDefaultExtensions` functions.
3. Implement `getDefaultExtensions()` with the StarterKit, Image, Link, Table, Underline, and Markdown extensions.
4. Implement `parse()` using a headless editor pattern: create editor with extensions and content from markdown, extract JSON, destroy editor.
5. Implement `serialize()` using a headless editor pattern: create editor with extensions and content from JSON, extract markdown via `editor.storage.markdown.getMarkdown()`, destroy editor.
6. Run tests: `cd /home/dev/projects/SmartSpecPro/apps/web && pnpm vitest run components/editor/TiptapMarkdownBridge.test.ts`
7. Verify all non-skipped tests pass. Document any `tiptap-markdown` quirks discovered during testing (e.g., code block language handling, trailing newlines) as comments in the test file.

## Implementation Notes (Post-Build)

**Tiptap v3 API differences** (vs plan which assumed v2):
- `commands.setContent()` takes 2 args in v3: `(content, options?)` where options is `{ parseOptions?, errorOnInvalidContent? }`. The old v2 3-arg form `(content, emitUpdate, parseOptions)` is removed.
- StarterKit v3 **bundles Link and Underline** — must use `link: false, underline: false` in `StarterKit.configure()` to avoid duplicate extension warnings when configuring them separately.
- `immediatelyRender` is a `useEditor()` React hook option only — not available on the core `Editor` class. Headless editors don't need it.
- `editor.storage.markdown` requires a type cast since `tiptap-markdown` extends storage dynamically.
- Image nodes are block-level in ProseMirror — cannot be nested inside `paragraph` nodes.

**Files created:**
- `apps/web/client/src/components/editor/TiptapMarkdownBridge.ts` (86 lines)
- `apps/web/client/src/components/editor/TiptapMarkdownBridge.test.ts` (241 lines)

**Test results:** 18 passed, 4 skipped (video/audio deferred to section 06)