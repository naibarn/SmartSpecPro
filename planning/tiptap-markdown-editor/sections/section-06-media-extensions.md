<!-- IMPLEMENTATION STATUS: COMPLETE -->
<!-- Commit: (pending) -->

# Section 06: Media Extensions

## Overview

This section creates three custom Tiptap extensions -- `imageExtension.ts`, `videoExtension.ts`, and `audioExtension.ts` -- plus a shared `mediaSerializationRules.ts` module. These extensions define how media nodes are represented in the ProseMirror document model, how they are parsed from HTML (including legacy documents), and how they are serialized back to HTML for markdown storage. They serve as the data layer for media handling; the visual rendering (node views) is handled separately in Section 07.

**Dependencies**: Section 01 (Tiptap packages installed), Section 02 (TiptapMarkdownBridge available for round-trip testing).

**Blocks**: Section 07 (media node views), Section 08 (media insert menu), Section 09 (paste/drag-drop), Section 11 (SafeMarkdown fixes).

## File Paths

All new files go in `apps/web/client/src/components/editor/extensions/`:

| File | Purpose |
|------|---------|
| `imageExtension.ts` | Custom Tiptap extension for images (extends built-in Image) |
| `videoExtension.ts` | Custom Tiptap Node extension for `<video>` elements |
| `audioExtension.ts` | Custom Tiptap Node extension for `<audio>` elements |
| `mediaSerializationRules.ts` | Shared serialization helpers and attribute schemas |
| `__tests__/imageExtension.test.ts` | Tests for ImageExtension |
| `__tests__/videoExtension.test.ts` | Tests for VideoExtension |
| `__tests__/audioExtension.test.ts` | Tests for AudioExtension |

## Background: Legacy Media Format

Existing documents store media as raw HTML inside markdown. Understanding this format is critical for backward compatibility.

**Images** use standard markdown syntax: `![alt text](url)`. The built-in `@tiptap/extension-image` handles this natively.

**Videos** use inline HTML:
```html
<video src="https://..." controls width="100%" style="border-radius:8px;max-width:720px;"></video>
```
Note: `style` attributes are stripped by DOMPurify in SafeMarkdown, so they are cosmetic only. Legacy documents will NOT have `data-*` attributes. New documents will include `data-poster`, `data-caption`, and `data-asset-id`.

**Audio** uses inline HTML preceded by a bold title:
```html
**Title**
<audio src="https://..." controls style="width:100%;"></audio>
```

## Tests (Write First)

All tests use Vitest with `node` environment. They test extension behavior by creating a minimal Tiptap editor instance in-memory (no DOM rendering needed for `parseHTML`/`renderHTML` tests).

### `__tests__/imageExtension.test.ts`

```
# Test: parseHTML('<img src="url" alt="text">') creates ImageNode with correct src and alt attributes
# Test: parseHTML('<figure><img src="url"><figcaption>cap</figcaption></figure>') creates ImageNode with caption attribute
# Test: renderHTML produces <img> tag with src, alt, and data-* attributes
# Test: ImageNode attributes src, alt, caption, width, alignment, assetId all round-trip through parseHTML/renderHTML
# Test: setImage command inserts an image node with provided attributes
# Test: missing src attribute defaults to empty string (no crash)
```

Each test should create a Tiptap `Editor` instance with `StarterKit`, the custom `ImageExtension`, and `tiptap-markdown` configured. Use `editor.commands.setContent(htmlString)` to trigger `parseHTML`, then read `editor.getJSON()` to verify the parsed node structure. For `renderHTML`, serialize back to HTML and verify the output tag.

### `__tests__/videoExtension.test.ts`

```
# Test: parseHTML('<video src="url" controls>') creates VideoNode with src attribute
# Test: parseHTML('<video src="url" data-poster="p" data-caption="c">') preserves data-poster and data-caption attrs
# Test: parseHTML('<video src="url" data-asset-id="abc-123">') preserves data-asset-id
# Test: parseHTML legacy '<video src="url" controls width="100%" style="border-radius:8px;max-width:720px;">') handles style attr gracefully (ignores style, extracts src)
# Test: renderHTML produces <video> tag with controls attribute and data-* attributes
# Test: setVideo({ src, poster, caption }) command inserts a video node with correct attributes
# Test: VideoNode with no data-* attrs (legacy) parses without error, attrs default to null/undefined
```

### `__tests__/audioExtension.test.ts`

```
# Test: parseHTML('<audio src="url" controls>') creates AudioNode with src attribute
# Test: parseHTML('<audio src="url" controls style="width:100%;">') handles style attr gracefully
# Test: renderHTML produces <audio> tag with controls attribute
# Test: setAudio({ src, caption }) command inserts an audio node
# Test: AudioNode attributes src, caption, assetId round-trip correctly
```

### Test Setup Pattern

Each test file should follow this pattern for creating a test editor:

```typescript
import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
// import the extension under test

function createTestEditor(extensions = []) {
  return new Editor({
    extensions: [StarterKit, ...extensions],
    content: "",
  });
}
```

Use `editor.commands.setContent(html)` to feed HTML, `editor.getJSON()` to inspect parsed structure, and `editor.getHTML()` to check rendered output. Dispose with `editor.destroy()` in `afterEach`.

## Implementation Details

### `mediaSerializationRules.ts`

This module contains shared constants and helpers used by all three media extensions.

**Exported items:**

- `MEDIA_DATA_ATTRS` -- array of whitelisted `data-*` attribute names: `["data-poster", "data-caption", "data-asset-id"]`. This is the single source of truth for which data attributes are allowed on media nodes (also used by Section 11 SafeMarkdown fixes).

- `parseDataAttr(element: HTMLElement, attr: string): string | null` -- reads a `data-*` attribute from a DOM element, returns null if missing. Handles the `data-` prefix mapping (e.g., `data-poster` maps to `element.dataset.poster`).

- `sanitizeMediaSrc(src: string): string` -- validates a media URL. **SECURITY-CRITICAL**. Returns empty string for rejected URLs. Rejection list (case-insensitive):
  - `javascript:` — XSS via script execution
  - `vbscript:` — legacy IE XSS vector
  - `data:text/html` — arbitrary HTML execution
  - `data:application` — arbitrary code execution
  - `data:image/svg+xml` — SVG can contain `<script>` and event handlers, executes in some browsers when used as `src` or `poster`
  - `blob:` — opaque URL that could reference crafted content
  - `file:` — local file access
  - Allows ONLY: `https://`, `http://`, and relative paths starting with `/`

- `buildDataAttrs(attrs: Record<string, string | null | undefined>): Record<string, string>` -- filters out null/undefined values from an attribute map and returns only entries that have string values. Used by `renderHTML` to produce clean attribute objects.

### `imageExtension.ts`

Extends the built-in `@tiptap/extension-image` to add custom attributes.

**Extension name**: `"image"` (overrides default).

**Custom attributes** added via `addAttributes()`:
- `src` -- string, required (inherited from base Image extension)
- `alt` -- string, default `""`
- `caption` -- string, default `null`, parsed from `<figcaption>` child or `data-caption` attribute
- `width` -- string, default `null` (e.g., `"50%"`, `"300px"`)
- `alignment` -- string, default `"center"`, one of `"left" | "center" | "right"`
- `assetId` -- string, default `null`, parsed from `data-asset-id`

**`parseHTML`** rules (array of parse rules):
1. Match `<img[src]>` -- standard image tag
2. Match `<figure>` containing `<img>` -- extracts `src` from the `<img>` child and `caption` from `<figcaption>` child text

**`renderHTML`** output: `["img", { src, alt, "data-caption": caption, "data-asset-id": assetId, width, "data-alignment": alignment }]`

**`addCommands`**: Override `setImage` to accept extended attributes `{ src, alt?, caption?, width?, alignment?, assetId? }`.

**`addNodeView`**: Returns `ReactNodeViewRenderer(ImageNodeView)` -- but the actual `ImageNodeView` component is created in Section 07. For now, set this up as a placeholder that will be connected later. The extension should work without a node view (falls back to `renderHTML` output).

### `videoExtension.ts`

A fully custom Tiptap `Node.create()` extension (not extending a built-in).

**Extension name**: `"video"`

**Group**: `"block"` -- video is a block-level node.

**Atom**: `true` -- the node is a single unit (not editable inline text).

**Draggable**: `true` -- allows drag repositioning in edit mode.

**Attributes** defined via `addAttributes()`:
- `src` -- string, required. `parseHTML`: reads `src` attribute. Passes through `sanitizeMediaSrc`.
- `poster` -- string, default `null`. `parseHTML`: reads `data-poster` attribute.
- `caption` -- string, default `null`. `parseHTML`: reads `data-caption` attribute.
- `assetId` -- string, default `null`. `parseHTML`: reads `data-asset-id` attribute.
- `controls` -- boolean, default `true`. `parseHTML`: checks for `controls` attribute presence.
- `width` -- string, default `null`. `parseHTML`: reads `width` attribute.
- `height` -- string, default `null`. `parseHTML`: reads `height` attribute.

**`parseHTML`**: Returns `[{ tag: "video[src]" }]`. This matches both legacy `<video>` tags (no `data-*` attrs, has `style` attr) and new format. Attributes not present on the element simply default to `null`.

**`renderHTML({ HTMLAttributes })`**: Returns `["video", mergeAttributes(HTMLAttributes, { controls: "" })]`. The `controls` attribute is set as an empty string (HTML boolean attribute convention). Data attributes are included via `buildDataAttrs`.

**`addCommands`**: Adds `setVideo` command. **SECURITY**: Must sanitize `src` and `poster` at command time (not just `parseHTML` time) because `setContent()` and `insertContent()` bypass `parseHTML`:
```typescript
setVideo: (attrs) => ({ commands }) => {
  return commands.insertContent({
    type: "video",
    attrs: {
      ...attrs,
      src: sanitizeMediaSrc(attrs.src || ""),
      poster: attrs.poster ? sanitizeMediaSrc(attrs.poster) : null,
    },
  });
};
```

**`addNodeView`**: Placeholder for `ReactNodeViewRenderer(VideoNodeView)` -- connected in Section 07.

### `audioExtension.ts`

A custom Tiptap `Node.create()` extension, structurally similar to `videoExtension.ts`.

**Extension name**: `"audio"`

**Group**: `"block"`

**Atom**: `true`

**Draggable**: `true`

**Attributes**:
- `src` -- string, required. Passes through `sanitizeMediaSrc`.
- `caption` -- string, default `null`. `parseHTML`: reads `data-caption` attribute (consistent with video — uses same DOMPurify whitelist).
- `assetId` -- string, default `null`. `parseHTML`: reads `data-asset-id`.
- `controls` -- boolean, default `true`.

**`parseHTML`**: Returns `[{ tag: "audio[src]" }]`.

**`renderHTML`**: Returns `["audio", mergeAttributes(HTMLAttributes, { controls: "" })]`.

**`addCommands`**: Adds `setAudio` command accepting `{ src, caption?, assetId? }`.

**`addNodeView`**: Placeholder for `ReactNodeViewRenderer(AudioNodeView)` -- connected in Section 07.

### Markdown Serialization Integration

The `tiptap-markdown` library handles most serialization automatically. However, custom nodes (`video` and `audio`) are not recognized by default. The extensions must provide serialization rules so that `tiptap-markdown` can convert them to/from markdown.

Each extension should add markdown serialization rules via the `addStorage()` method, following the `tiptap-markdown` pattern:

```typescript
// SECURITY: escapeAttr prevents stored XSS via crafted captions/titles
// e.g., caption = '" onerror="alert(1)' would create malformed HTML without escaping
function escapeAttr(val: string): string {
  return val.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

addStorage() {
  return {
    markdown: {
      serialize(state, node) {
        // Write the HTML tag with escaped attribute values
        state.write(`<video src="${escapeAttr(node.attrs.src)}" controls`);
        if (node.attrs.poster) state.write(` data-poster="${escapeAttr(node.attrs.poster)}"`);
        if (node.attrs.caption) state.write(` data-caption="${escapeAttr(node.attrs.caption)}"`);
        if (node.attrs.assetId) state.write(` data-asset-id="${escapeAttr(node.attrs.assetId)}"`);
        state.write(`></video>`);
        state.closeBlock(node);
      },
      parse: {
        // parseHTML handles this via the extension's parseHTML rules
      },
    },
  };
},
```

**CRITICAL SPIKE**: Before implementing, verify `tiptap-markdown` v0.8's `addStorage().markdown.serialize` hook works. If it does NOT, use this fallback: extend `TiptapMarkdownBridge.serialize()` (S02) to post-process the markdown output — find video/audio nodes in the Tiptap JSON, generate `<video>`/`<audio>` HTML tags with `data-*` attrs, and inject them into the serialized markdown at the correct positions.

For images, `tiptap-markdown` already handles standard `![alt](url)` syntax. Custom attributes (`caption`, `alignment`, `assetId`) need a custom serializer that falls back to HTML `<figure>` when those attributes are present.

**Files to Modify (backward dependency)**:
- `apps/web/client/src/components/editor/TiptapMarkdownBridge.ts` (S02): Add `VideoExtension`, `AudioExtension`, and extended `ImageExtension` to `getDefaultExtensions()`. This ensures the bridge's `parse()` and `serialize()` functions recognize media nodes.

## Security Considerations

- `sanitizeMediaSrc` in `mediaSerializationRules.ts` MUST reject `javascript:` protocol URLs. This prevents XSS via media `src` or `poster` attributes.
- The `data-poster` attribute value is used as a `<video poster>` URL in Section 07's `VideoNodeView`. The sanitization must happen at parse time (in this section) AND at render time (in Section 07).
- Only the three whitelisted `data-*` attributes are accepted. Any other `data-*` attributes are silently dropped.

## Integration Notes

- After completing this section, the TiptapMarkdownBridge from Section 02 should be updated to include these extensions in its editor configuration. The bridge's `parse()` and `serialize()` methods need these extensions registered to correctly handle media nodes.
- The extensions must be included in the `useEditor()` call in `TiptapEditor.tsx` (Section 03). They should be added to the extensions array alongside `StarterKit`, `Link`, `Table`, etc.
- Section 11 (SafeMarkdown fixes) should import `MEDIA_DATA_ATTRS` from `mediaSerializationRules.ts` to ensure the same attribute whitelist is used in both the editor and the read-only renderer.

## Implementation Notes (Actual)

### Files Created
- `apps/web/client/src/components/editor/extensions/mediaSerializationRules.ts`
- `apps/web/client/src/components/editor/extensions/imageExtension.ts`
- `apps/web/client/src/components/editor/extensions/videoExtension.ts`
- `apps/web/client/src/components/editor/extensions/audioExtension.ts`
- `apps/web/client/src/components/editor/extensions/__tests__/imageExtension.test.ts`
- `apps/web/client/src/components/editor/extensions/__tests__/videoExtension.test.ts`
- `apps/web/client/src/components/editor/extensions/__tests__/audioExtension.test.ts`

### Files Modified
- `apps/web/client/src/components/editor/TiptapMarkdownBridge.ts` — replaced `Image` import with `ImageExtension`, added `VideoExtension` and `AudioExtension` to `getDefaultExtensions()`

### Deviations from Plan
- `MEDIA_DATA_ATTRS` includes `"data-alignment"` (4 entries, not 3) — needed for Section 11 DOMPurify allowlist
- Video markdown serializer includes `width` and `height` attributes — prevents dimension loss on save/reload round-trip
- `addNodeView()` placeholder omitted — Section 07 will add node views directly
- Commands augmentation uses `image:` key (not `imageExtension:`) to cleanly override base `@tiptap/extension-image` types

### Test Summary
- 21 tests across 3 test files (7 image + 8 video + 6 audio)
- All 120 editor tests pass (no regressions)
- Tests require `// @vitest-environment jsdom` directive (tiptap-markdown needs DOM)