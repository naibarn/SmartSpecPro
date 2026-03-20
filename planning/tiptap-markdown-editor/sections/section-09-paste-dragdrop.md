I now have sufficient context. Let me produce the section content.

# Section 09: Paste and Drag-Drop Handlers

## Overview

This section implements three clipboard/file-input handlers for the Tiptap editor:

1. **`handlePaste`** -- intercepts clipboard image pastes, uploads files, and inserts image nodes at the cursor.
2. **`transformPastedHTML`** -- sanitizes rich HTML pasted from Word/Google Docs, stripping vendor-specific markup while preserving basic formatting.
3. **`handleDrop`** -- intercepts file drag-and-drop events, uploads media files, and inserts appropriate nodes at the drop position.

All three are configured as `editorProps` on the Tiptap `useEditor()` call inside `TiptapEditor.tsx`. The upload logic reuses the existing upload endpoint at `/api/media-jobs/upload` (multer-based, defined in `apps/web/server/routers/mediaJobs.ts`).

## Dependencies

- **Section 06 (Media Extensions)**: `ImageExtension`, `VideoExtension`, and `AudioExtension` must exist so that inserted nodes are recognized by the Tiptap schema.
- **Section 08 (Media Insert Menu)**: The upload utility function created for the MediaInsertMenu upload tab should be extracted into a shared helper so paste/drop can reuse it.

## Files to Create

| File | Purpose |
|------|---------|
| `apps/web/client/src/components/editor/pasteHandlers.ts` | `handlePaste`, `transformPastedHTML` functions |
| `apps/web/client/src/components/editor/dropHandler.ts` | `handleDrop` function |
| `apps/web/client/src/components/editor/uploadMedia.ts` | Shared upload helper (may already exist from section 08; extend if needed) |
| `apps/web/client/src/components/editor/__tests__/paste-handlers.test.ts` | Tests for paste logic |
| `apps/web/client/src/components/editor/__tests__/drag-drop.test.ts` | Tests for drop logic |

## Files to Modify

| File | Change |
|------|--------|
| `apps/web/client/src/components/editor/TiptapEditor.tsx` | Wire `editorProps.handlePaste`, `editorProps.handleDrop`, and `editorProps.transformPastedHTML` into the `useEditor()` config |

---

## Tests (Write First)

All tests use Vitest with `jsdom` environment. The upload helper should be mocked to avoid real network calls.

### `paste-handlers.test.ts`

```
# File: apps/web/client/src/components/editor/__tests__/paste-handlers.test.ts

# Test: pasting image from clipboard triggers upload + insert
#   - Create a mock ClipboardEvent with clipboardData.items containing a blob of type "image/png"
#   - Mock the uploadMedia helper to resolve with a URL
#   - Call handlePaste with the event and a mock editor
#   - Assert uploadMedia was called with the File extracted from the clipboard item
#   - Assert editor.chain().setImage({ src: uploadedUrl }).run() was called
#   - Assert the handler returns true (event consumed)

# Test: pasting rich HTML from Word sanitizes Word-specific markup
#   - Input HTML containing <o:p>, mso-* styles, <w:sdt>, excessive <span style="...">
#   - Call transformPastedHTML with that HTML
#   - Assert output does not contain <o:p>, <w:sdt>, or mso-* styles
#   - Assert output still contains basic tags: <strong>, <em>, <a>, <ul>, <li>

# Test: pasting rich HTML preserves basic formatting (bold, italic, links)
#   - Input: "<p><strong>bold</strong> and <em>italic</em> with <a href='https://example.com'>link</a></p>"
#   - Call transformPastedHTML
#   - Assert <strong>, <em>, <a href="..."> are preserved in output

# Test: pasting plain markdown text converts to rich content
#   - When clipboardData contains only plain text (no HTML, no files), the handler
#     should return false (let Tiptap/tiptap-markdown handle the default paste)

# Test: pasted HTML with <script> tags are stripped
#   - Input: "<p>text</p><script>alert('xss')</script>"
#   - Call transformPastedHTML
#   - Assert output contains "<p>text</p>" but no <script>

# Test: handlePaste returns false when no image items in clipboard
#   - ClipboardEvent with only text/html items, no files
#   - Assert returns false (default Tiptap paste handling takes over)
```

### `drag-drop.test.ts`

```
# File: apps/web/client/src/components/editor/__tests__/drag-drop.test.ts

# Test: dropping an image file triggers upload + insert at drop position
#   - Create a mock DragEvent with dataTransfer.files containing a File of type "image/jpeg"
#   - Mock uploadMedia to resolve with a URL string
#   - Mock editor.view.posAtCoords to return a valid position
#   - Call handleDrop with the event and mock editor
#   - Assert uploadMedia called with the File
#   - Assert editor inserts an ImageNode at the resolved position
#   - Assert returns true (event consumed)

# Test: dropping a non-media file is ignored
#   - DragEvent with dataTransfer.files containing a File of type "application/pdf"
#   - Call handleDrop
#   - Assert uploadMedia was NOT called
#   - Assert returns false (event not consumed)

# Test: dropping multiple files inserts multiple nodes
#   - DragEvent with dataTransfer.files containing 2 image files and 1 video file
#   - Mock uploadMedia to resolve with different URLs for each
#   - Call handleDrop
#   - Assert uploadMedia called 3 times
#   - Assert editor inserts 2 ImageNodes and 1 VideoNode

# Test: dropping a video file inserts a VideoNode
#   - DragEvent with a file of type "video/mp4"
#   - Assert editor.chain().setVideo({ src: url }).run() is called

# Test: dropping an audio file inserts an AudioNode
#   - DragEvent with a file of type "audio/mpeg"
#   - Assert editor.chain().setAudio({ src: url }).run() is called
```

---

## Implementation Details

### Shared Upload Helper (`uploadMedia.ts`)

This module may already exist from Section 08 (MediaInsertMenu upload tab). If not, create it. The function should:

- Accept a `File` object and return a `Promise<string>` (the uploaded URL).
- POST to `/api/media-jobs/upload` using `FormData` with the file under the `"file"` key. This is the existing multer endpoint in `apps/web/server/routers/mediaJobs.ts`.
- Include the auth cookie/header (use `fetch` with `credentials: "include"`).
- Return the URL from the server response (the server responds with `{ url: string }`).
- Throw on non-2xx responses.

Signature stub:

```typescript
/**
 * Upload a media file to the server and return its public URL.
 * Reuses the existing /api/media-jobs/upload endpoint.
 */
export async function uploadMedia(file: File): Promise<string>;
```

### MIME Type Detection Helper

Create a small helper used by both paste and drop handlers to classify files:

```typescript
/**
 * Determine the media node type for a given MIME type.
 * Returns null if the MIME type is not a supported media format.
 */
export function classifyMediaType(
  mimeType: string
): "image" | "video" | "audio" | null;
```

Logic:
- `mimeType.startsWith("image/")` returns `"image"`
- `mimeType.startsWith("video/")` returns `"video"`
- `mimeType.startsWith("audio/")` returns `"audio"`
- Everything else returns `null`

### Paste Handler (`pasteHandlers.ts`)

#### `handlePaste`

This is passed to `editorProps.handlePaste` in the `useEditor()` configuration. ProseMirror's `handlePaste` signature is:

```typescript
handlePaste(
  view: EditorView,
  event: ClipboardEvent,
  slice: Slice
): boolean | void
```

Returning `true` means "I handled this event; do not proceed with default paste." Returning `false` or `undefined` falls through to default behavior.

Implementation logic:

1. Check `event.clipboardData?.items` for entries where `item.type.startsWith("image/")`.
2. If no image items found, return `false` (let tiptap-markdown handle text/HTML paste).
3. For each image item:
   - Call `item.getAsFile()` to get the `File` object.
   - Call `uploadMedia(file)` to upload.
   - **Unmount guard**: Before inserting, check `if (!editorRef.current || editorRef.current.isDestroyed) return;` — the component may have unmounted (tab closed, navigation) during the async upload.
   - On success, get the current cursor position from `view.state.selection.from`.
   - Use the editor chain API: `editor.chain().focus().setImage({ src: url, alt: file.name }).run()`.
4. Return `true` to prevent default paste.

Error handling: If upload fails, show a toast notification (using sonner `toast.error()`) and do not insert any node. Do not crash the editor.

Note: The upload is async but `handlePaste` must return synchronously. The pattern is to call `event.preventDefault()`, start the async upload, and return `true`. While uploading, optionally show a placeholder node or a loading indicator at the cursor position (a simple approach is to insert a paragraph with "Uploading..." text, then replace it with the image node on success).

#### `transformPastedHTML`

This is passed to `editorProps.transformPastedHTML` in the `useEditor()` configuration. Its signature:

```typescript
transformPastedHTML(html: string, view: EditorView): string
```

It receives the raw HTML from the clipboard and must return sanitized HTML.

Implementation logic:

1. **Strip Word/Office XML namespaced tags**: Remove `<o:p>`, `</o:p>`, `<w:sdt>`, `</w:sdt>`, and any tags matching `<\/?[a-zA-Z]+:[a-zA-Z]+[^>]*>` (XML namespace pattern).
2. **Strip mso-* styles**: Remove `style` attributes containing `mso-` prefixed CSS properties. The simplest approach is to remove all inline `style` attributes entirely, since Word-generated styles are almost never useful. Alternatively, strip only `mso-*` properties from the style string.
3. **Strip empty spans**: Word wraps text in deeply nested `<span>` elements with only style attributes. After removing styles, collapse empty spans.
4. **DOMPurify sanitize**: Pass through DOMPurify with an allowlist appropriate for the editor context. Use a configuration similar to SafeMarkdown's but tuned for editor paste:
   - `ALLOWED_TAGS`: p, br, h1-h6, strong, b, em, i, u, a, ul, ol, li, blockquote, pre, code, table, thead, tbody, tr, th, td, img, hr
   - `ALLOWED_ATTR`: href, src, alt, title, colspan, rowspan
   - `ALLOW_DATA_ATTR: false`
5. **Strip `<script>`, `<style>`, event handler attributes**: DOMPurify handles this by default, but ensure `FORBID_TAGS: ["script", "style", "iframe", "object", "embed"]` and `FORBID_ATTR: ["onerror", "onload", "onclick", "onmouseover", "onfocus"]` are set.
6. **Post-process `<img src>` URLs**: After DOMPurify, scan remaining `<img>` tags and strip any with `src` matching dangerous protocols (`data:image/svg+xml`, `data:text/html`, `javascript:`, `vbscript:`). Use `sanitizeMediaSrc()` from `mediaSerializationRules.ts` (S06) — same blocklist used for video/audio sources.
7. Return the cleaned HTML string.

### Drop Handler (`dropHandler.ts`)

This is passed to `editorProps.handleDrop` in the `useEditor()` configuration. ProseMirror's `handleDrop` signature:

```typescript
handleDrop(
  view: EditorView,
  event: DragEvent,
  slice: Slice,
  moved: boolean
): boolean | void
```

The `moved` parameter is `true` when the content being dropped was dragged from within the editor (internal move). We only handle external file drops, so if `moved` is `true`, return `false`.

Implementation logic:

1. If `moved` is `true`, return `false` (internal drag-and-drop is handled by ProseMirror).
2. Get files from `event.dataTransfer?.files`.
3. If no files, return `false`.
4. Filter files to supported media types using `classifyMediaType(file.type)`. If no supported files, return `false`.
5. Call `event.preventDefault()`.
6. Determine the drop position: use `view.posAtCoords({ left: event.clientX, top: event.clientY })` to get the document position where the user dropped.
7. For each supported file (in sequence to preserve order):
   - Upload via `uploadMedia(file)`.
   - **Unmount guard**: `if (!editorRef.current || editorRef.current.isDestroyed) return;`
   - Based on `classifyMediaType(file.type)`:
     - `"image"`: `editor.chain().focus().insertContentAt(pos, { type: 'image', attrs: { src: url, alt: file.name } }).run()`
     - `"video"`: `editor.chain().focus().insertContentAt(pos, { type: 'video', attrs: { src: url } }).run()`
     - `"audio"`: `editor.chain().focus().insertContentAt(pos, { type: 'audio', attrs: { src: url } }).run()`
8. Return `true`.

Error handling: If any upload fails, show a toast for that file but continue uploading remaining files. Failed files do not insert nodes.

### Wiring into TiptapEditor.tsx

In `TiptapEditor.tsx`, the `useEditor()` call should include the handlers in `editorProps`:

```typescript
const editor = useEditor({
  // ...extensions, content, etc.
  editorProps: {
    handlePaste: (view, event, slice) =>
      handlePaste(view, event, slice, editor),
    handleDrop: (view, event, slice, moved) =>
      handleDrop(view, event, slice, moved, editor),
    transformPastedHTML: (html, view) =>
      transformPastedHTML(html, view),
  },
});
```

Note the circular reference issue: `editor` is not yet defined when configuring `useEditor`. The standard pattern is to pass a ref or use a closure. Tiptap's `editorProps` callbacks receive `view` which provides `view.state`, but the editor chain API requires the editor instance. Two approaches:

1. Store the editor in a ref (`editorRef.current = editor`) and access it inside the callbacks.
2. Use the `view.dispatch` and ProseMirror transaction API directly instead of the Tiptap chain API.

Approach 1 is simpler and recommended. The ref pattern is already used elsewhere in the codebase (e.g., `MarkdownFileEditor.tsx` uses `editorRef`).

### Security Considerations

- **Pasted HTML sanitization**: All pasted HTML passes through DOMPurify before Tiptap processes it. This prevents XSS from crafted clipboard content.
- **Upload validation**: The server-side upload endpoint (`/api/media-jobs/upload`) already validates file types and sizes. The client-side MIME check is a UX convenience, not a security boundary.
- **No arbitrary URLs**: Paste and drop only insert URLs returned by the upload endpoint (server-controlled). Users cannot paste arbitrary `<img src="...">` from HTML and have it render -- `transformPastedHTML` only preserves `src` attributes on `<img>` tags that pass DOMPurify, and the editor's image extension validates URLs in the node view (Section 07).
- **`javascript:` protocol**: DOMPurify strips `javascript:` URLs by default. No additional handling needed in paste/drop handlers.

### Upload Placeholder UX (Optional Enhancement)

While a file is uploading (paste or drop), the user sees no feedback unless we add a placeholder. A simple approach:

1. Insert a paragraph node with text like "[Uploading image...]" at the target position.
2. Store the position of that placeholder node.
3. On upload success, replace the placeholder with the actual media node.
4. On upload failure, remove the placeholder and show a toast.

This is a UX improvement and can be deferred to hardening (Section 13) if needed. The minimum viable implementation simply inserts the node after upload completes with no placeholder.

### DOMPurify Import

The project already uses DOMPurify in `SafeMarkdown.tsx` (`import DOMPurify from "dompurify"`). The same import can be used in `pasteHandlers.ts`. DOMPurify is already in the project's dependencies.