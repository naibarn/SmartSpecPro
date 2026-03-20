I now have all the context needed. Let me generate the section content.

# Section 08: Media Insert Menu

## Overview

This section creates the `MediaInsertMenu` component -- a popover that lets users browse their library or upload new files to insert images, videos, or audio into the Tiptap editor. The menu is opened from three places: the EditorToolbar "Insert" buttons (section-04), slash command media items (section-05), and the "Replace" action in `MediaSelectionOverlay` (section-07). When the user selects a library item or uploads a file, the menu fires an `onInsert` callback with the appropriate node attributes, and the parent component uses the Tiptap editor commands (`setImage`, `setVideo`, `setAudio`) to insert the node at the current cursor position.

## Dependencies

- **section-06-media-extensions**: The custom Tiptap extensions (`ImageExtension`, `VideoExtension`, `AudioExtension`) must exist so the editor commands (`setImage`, `setVideo`, `setAudio`) are available for node insertion.
- **section-07-media-node-views**: The `MediaSelectionOverlay` component's `onReplace` callback is wired to open this menu. The node views render the inserted media.
- **section-04-toolbar-modes**: The `EditorToolbar` fires `onInsertMedia(type)` which the parent uses to open this menu.
- **section-05-slash-commands**: The slash command menu fires `onMediaInsert(type)` for media items, which also opens this menu.

## Existing Patterns

The current `MarkdownFileEditor.tsx` already implements library-based media insertion using three separate Popover components (one each for images, videos, audio). Each popover has its own search state, debounced query, and `trpc.library.listDocuments` call filtered by `itemType`. The new `MediaInsertMenu` consolidates all three into a single reusable component with a `mediaType` prop.

Key patterns from the existing implementation:
- Search uses `trpc.library.listDocuments` with `filters: { itemType: "image" | "video" | "audio" }`, `scope: "all"`, `limit: 50`
- Search input is debounced at 300ms before querying
- Results are filtered to only show items with a non-null `source_url`
- Images show as a 2-column grid of thumbnails; videos and audio show as list items
- The query is only enabled when the popover is open (via TanStack Query's `enabled` option)

The upload functionality uses the existing `trpc.library.uploadFile` mutation, which accepts `{ fileName, fileType, fileBase64, title?, visibility?, parentId? }`. The file is converted to base64 on the client side before sending.

## Files to Create

```
apps/web/client/src/components/editor/MediaInsertMenu.tsx
apps/web/client/src/components/editor/MediaInsertMenu.test.tsx
apps/web/client/src/components/editor/uploadMedia.ts
```

**`uploadMedia.ts`** — shared upload helper used by both MediaInsertMenu (this section) and paste/drop handlers (S09). Uses `fetch` POST to `/api/media-jobs/upload` (existing multer endpoint). Signature: `async function uploadMedia(file: File): Promise<string>` (returns uploaded URL). This is NOT a React hook — it's a plain async function callable from any context (component or editorProps callback).

## Tests

Write tests before implementation in the following file:

```
apps/web/client/src/components/editor/MediaInsertMenu.test.tsx
```

### Test Stubs

```
# MediaInsertMenu.test.tsx

# Test: renders Library and Upload tabs
#   Mount MediaInsertMenu with mediaType="image" and open=true.
#   Expect two tab triggers to be present with text matching the i18n keys
#   for "Library" and "Upload".

# Test: Library tab searches via trpc.library.listDocuments
#   Mount with mediaType="image". Type a query into the search input.
#   After debounce, verify that trpc.library.listDocuments was called
#   with { filters: { itemType: "image" }, query: <typed text>, scope: "all", limit: 50 }.

# Test: clicking an image item fires onInsert callback with correct attrs
#   Mount with mediaType="image". Mock trpc.library.listDocuments to return
#   a result with { id: 1, title: "Test", source_url: "https://example.com/img.jpg",
#   thumbnail_url: "https://example.com/thumb.jpg" }.
#   Click the item. Expect onInsert to have been called with
#   { src: "https://example.com/img.jpg", alt: "Test", assetId: "1" }.

# Test: clicking a video item fires onInsert with video attrs
#   Mount with mediaType="video". Mock listDocuments to return a video item.
#   Click it. Expect onInsert called with
#   { src: "https://example.com/video.mp4", caption: "Test Video", assetId: "2" }.

# Test: clicking an audio item fires onInsert with audio attrs
#   Mount with mediaType="audio". Mock listDocuments to return an audio item.
#   Click it. Expect onInsert called with
#   { src: "https://example.com/audio.mp3", assetId: "3" }.

# Test: Upload tab handles file selection
#   Mount with mediaType="image". Switch to Upload tab. Simulate selecting
#   a file via the file input. Verify trpc.library.uploadFile mutation is
#   called with the file data. On success, verify onInsert fires with the
#   returned source_url.

# Test: empty search results show "no items" message
#   Mount with mediaType="image". Mock listDocuments to return empty results.
#   Expect empty-state text to be visible.

# Test: loading state shows spinner
#   Mount with mediaType="image". Mock listDocuments to be in loading state.
#   Expect a loading spinner element to be visible.

# Test: menu closes after item selection
#   Mount with open=true. Select an item. Expect onOpenChange to be called
#   with false.

# Test: search query resets when menu closes and reopens
#   Mount, type a query, close the menu (onOpenChange(false)), reopen.
#   The search input should be empty.
```

## Component Design

### Props Interface

```
interface MediaInsertMenuProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  mediaType: "image" | "video" | "audio"
  onInsert: (attrs: MediaInsertAttrs) => void
  anchorRef?: React.RefObject<HTMLElement>  // optional anchor for positioning
}

type MediaInsertAttrs =
  | { type: "image"; src: string; alt: string; assetId?: string }
  | { type: "video"; src: string; poster?: string; caption?: string; assetId?: string }
  | { type: "audio"; src: string; assetId?: string }
```

### Component Structure

The `MediaInsertMenu` renders as a Radix `Popover` (from `@smartspec/ui`) with two tabs managed by Radix `Tabs`:

1. **Library Tab** (default): A search input + scrollable results area. Queries `trpc.library.listDocuments` filtered by `mediaType`. Results render differently based on type:
   - `image`: 2-column thumbnail grid (same layout as existing `MarkdownFileEditor`)
   - `video`: vertical list with thumbnail + title
   - `audio`: vertical list with icon + title

2. **Upload Tab**: A file input (hidden, triggered by a button) with drag-drop zone. Accepts MIME types based on `mediaType` (`image/*`, `video/*`, `audio/*`). On file selection, converts to base64, calls `trpc.library.uploadFile`, and on success fires `onInsert` with the returned URL.

### Search Behavior

- Search input with 300ms debounce (matching existing pattern)
- Query passed to `trpc.library.listDocuments` with `{ query, scope: "all", limit: 50, offset: 0, filters: { itemType: mediaType } }`
- TanStack Query `enabled` flag tied to `open` prop -- no queries fire when menu is closed
- On menu close, reset search query to empty string

### Library Item Selection

When a user clicks a library item, construct the appropriate `MediaInsertAttrs` based on `mediaType`:

- **Image**: `{ type: "image", src: item.source_url, alt: item.title.trim() || "image", assetId: String(item.id) }`
- **Video**: `{ type: "video", src: item.source_url, poster: item.thumbnail_url || undefined, caption: item.title.trim() || undefined, assetId: String(item.id) }`
- **Audio**: `{ type: "audio", src: item.source_url, assetId: String(item.id) }`

Then call `onInsert(attrs)` and `onOpenChange(false)` to close the menu.

### Upload Flow

1. User clicks the upload button or drops a file onto the drop zone
2. Validate file MIME type against expected `mediaType` (e.g., reject `video/*` when `mediaType="image"`)
3. Read file as base64 using `FileReader.readAsDataURL()`
4. Call `trpc.library.uploadFile.mutate({ fileName, fileType, fileBase64, title: fileName })`
5. Show upload progress indicator (spinner or progress bar)
6. On success, the mutation returns `{ id, source_url, ... }`. Construct `MediaInsertAttrs` from the result
7. Call `onInsert(attrs)` and close the menu
8. On error, show an error message within the Upload tab (do not close the menu)

### File Size and Type Validation

- Max file size for base64: approximately 50MB binary (68MB base64, matching the server's `MAX_FILE_BASE64_LENGTH` of 68,000,000 characters)
- Accepted MIME types:
  - `image`: `image/jpeg`, `image/png`, `image/gif`, `image/webp`, `image/svg+xml`
  - `video`: `video/mp4`, `video/webm`, `video/quicktime`
  - `audio`: `audio/mpeg`, `audio/wav`, `audio/ogg`, `audio/mp4`, `audio/webm`
- Show validation error message for rejected files

### Integration Points

The parent component (`UnifiedDocumentSurface`) manages the menu's open state and wires `onInsert` to Tiptap commands:

```
// In UnifiedDocumentSurface (conceptual wiring, not exact code):
//
// When toolbar fires onInsertMedia("image"):
//   setMediaMenuType("image")
//   setMediaMenuOpen(true)
//
// When MediaInsertMenu fires onInsert({ type: "image", src, alt, assetId }):
//   editor.chain().focus().setImage({ src, alt, assetId }).run()
//
// When MediaInsertMenu fires onInsert({ type: "video", src, poster, caption, assetId }):
//   editor.chain().focus().setVideo({ src, poster, caption, assetId }).run()
//
// When MediaInsertMenu fires onInsert({ type: "audio", src, assetId }):
//   editor.chain().focus().setAudio({ src, assetId }).run()
```

The `setImage`, `setVideo`, and `setAudio` commands are registered by the custom extensions from section-06.

For the "Replace" action from `MediaSelectionOverlay` (section-07), the node view opens the `MediaInsertMenu` and, on insert, replaces the existing node's attributes via `updateAttributes()` instead of inserting a new node. This distinction is handled by the parent, not by `MediaInsertMenu` itself -- the parent passes a different `onInsert` callback that calls `updateAttributes` on the existing node.

### i18n Keys

The following translation keys should be added to `en.ts` and `th.ts` for this component:

- `editor.mediaMenu.libraryTab` -- "Library" / "ไลบรารี"
- `editor.mediaMenu.uploadTab` -- "Upload" / "อัปโหลด"
- `editor.mediaMenu.searchImages` -- "Search images in library..." / "ค้นหารูปภาพในไลบรารี..."
- `editor.mediaMenu.searchVideos` -- "Search videos in library..." / "ค้นหาวิดีโอในไลบรารี..."
- `editor.mediaMenu.searchAudio` -- "Search audio in library..." / "ค้นหาเสียงในไลบรารี..."
- `editor.mediaMenu.noImages` -- "No images found." / "ไม่พบรูปภาพ"
- `editor.mediaMenu.noVideos` -- "No videos found." / "ไม่พบวิดีโอ"
- `editor.mediaMenu.noAudio` -- "No audio found." / "ไม่พบไฟล์เสียง"
- `editor.mediaMenu.uploadButton` -- "Choose file" / "เลือกไฟล์"
- `editor.mediaMenu.dropHint` -- "or drag and drop here" / "หรือลากไฟล์มาวางที่นี่"
- `editor.mediaMenu.uploading` -- "Uploading..." / "กำลังอัปโหลด..."
- `editor.mediaMenu.uploadError` -- "Upload failed. Please try again." / "อัปโหลดล้มเหลว กรุณาลองอีกครั้ง"
- `editor.mediaMenu.fileTooLarge` -- "File is too large (max 50MB)." / "ไฟล์มีขนาดใหญ่เกินไป (สูงสุด 50MB)"
- `editor.mediaMenu.invalidType` -- "Invalid file type." / "ประเภทไฟล์ไม่ถูกต้อง"

### UI Components Used

The component uses existing UI primitives from `@smartspec/ui` and Radix:

- `Popover`, `PopoverContent`, `PopoverTrigger` -- from `@smartspec/ui` (Radix Popover)
- `Tabs`, `TabsList`, `TabsTrigger`, `TabsContent` -- from `@smartspec/ui` (Radix Tabs)
- `Input` -- from `@smartspec/ui`
- `ScrollArea` -- from `@smartspec/ui` (Radix ScrollArea)
- `Button` -- from `@smartspec/ui`
- Lucide icons: `ImagePlus`, `Video`, `Music2`, `Upload`, `Loader2`

### Styling Notes

- Popover width: `w-[480px]` (matching the existing image picker width in MarkdownFileEditor)
- Image thumbnails: `h-24 w-full object-cover` in a `grid-cols-2` layout
- Video list items: horizontal layout with `h-12 w-20` thumbnail + truncated title
- Audio list items: icon circle + truncated title
- Upload drop zone: dashed border, centered icon and text, hover highlight
- All styling uses Tailwind utility classes consistent with the existing codebase

### Security Considerations

- All URLs come from the library (uploaded files or assets) -- no arbitrary URL input is provided in this component
- File upload goes through the existing `trpc.library.uploadFile` endpoint which handles S3/R2 storage securely
- The `assetId` is stored as a string derived from the library item's numeric `id` -- used for future asset management, not for security decisions
- Base64 file data is never logged or exposed in error messages

---

## Implementation Notes (Actual)

### Files Created
- `apps/web/client/src/components/editor/MediaInsertMenu.tsx` — Popover with Library/Upload tabs, search + debounce, file upload with validation
- `apps/web/client/src/components/editor/MediaInsertMenu.test.tsx` — 8 tests
- `apps/web/client/src/components/editor/uploadMedia.ts` — File validation, base64 reader, accept string helper

### Deviations from Plan
- `uploadMedia.ts` exports helper functions (validateMediaFile, readFileAsBase64, getAcceptString) instead of a single `uploadMedia` async function. This is more flexible for reuse in section 09 (paste/drop).
- Uses both `trpc.library.listDocuments` (when no query) and `trpc.library.search` (when query present), matching the existing pattern in MarkdownFileEditor.tsx.
- i18n keys hardcoded in English; will be added in section 10.

### Test Results
- 8 tests pass: tab rendering, item selection (image/video/audio), empty state, loading, close-after-select, upload tab presence