Now I have all the context needed. Let me produce the section content.

# Section 07: Media Node Views

## Overview

This section creates the React node view components that render media (images, videos, audio) inline within the Tiptap editor surface. Each media node gets a dedicated React component that provides interactive controls in edit mode (caption editing, selection overlay with actions) and passive rendering in view mode.

**Files to create:**
- `/home/dev/projects/SmartSpecPro/apps/web/client/src/components/editor/nodeviews/ImageNodeView.tsx`
- `/home/dev/projects/SmartSpecPro/apps/web/client/src/components/editor/nodeviews/VideoNodeView.tsx`
- `/home/dev/projects/SmartSpecPro/apps/web/client/src/components/editor/nodeviews/AudioNodeView.tsx`
- `/home/dev/projects/SmartSpecPro/apps/web/client/src/components/editor/nodeviews/MediaSelectionOverlay.tsx`
- `/home/dev/projects/SmartSpecPro/apps/web/client/src/components/editor/nodeviews/ImageNodeView.test.tsx`
- `/home/dev/projects/SmartSpecPro/apps/web/client/src/components/editor/nodeviews/VideoNodeView.test.tsx`

**Dependencies from other sections:**
- Section 06 (Media Extensions) must be complete. The extensions define the node schemas (attributes like `src`, `alt`, `caption`, `poster`, `assetId`, `width`, `alignment`) and wire `ReactNodeViewRenderer` to point at these components.
- Section 01 (Tiptap Setup) provides the `@tiptap/react` package with `NodeViewWrapper`, `NodeViewContent`, and the `NodeViewProps` type.

---

## Tests (Write First)

All test files use Vitest with `jsdom` environment. Tests should validate rendering, user interactions, and security constraints.

### ImageNodeView.test.tsx

```
File: apps/web/client/src/components/editor/nodeviews/ImageNodeView.test.tsx

Test: renders <img> with correct src and alt
  - Mount ImageNodeView with node attrs { src: "https://example.com/photo.jpg", alt: "A photo" }
  - Assert an <img> element exists with matching src and alt attributes

Test: shows caption below image when caption attr set
  - Mount with attrs { src: "...", caption: "Figure 1" }
  - Assert a text element containing "Figure 1" is rendered below the image

Test: click shows MediaSelectionOverlay with action buttons
  - Mount in editable mode (editor.isEditable = true)
  - Simulate click on the image wrapper
  - Assert MediaSelectionOverlay becomes visible
  - Assert buttons for "Remove" and "Edit Alt" are present

Test: "Remove" button calls deleteNode()
  - Mount in editable mode with a mock deleteNode function
  - Click image, then click "Remove" button
  - Assert deleteNode was called

Test: "Edit Alt" opens inline alt text editor
  - Mount in editable mode
  - Click image, then click "Edit Alt" button
  - Assert an input/textarea appears pre-filled with current alt text
  - Type new alt text and confirm
  - Assert updateAttributes was called with { alt: "new alt text" }
```

### VideoNodeView.test.tsx

```
File: apps/web/client/src/components/editor/nodeviews/VideoNodeView.test.tsx

Test: renders <video> element with controls
  - Mount with attrs { src: "https://example.com/video.mp4" }
  - Assert a <video> element exists with controls attribute and matching src

Test: shows caption below video when caption attr set
  - Mount with attrs { src: "...", caption: "Demo video" }
  - Assert text "Demo video" is rendered below the video player

Test: validates src URL (rejects javascript: protocol)
  - Mount with attrs { src: "javascript:alert(1)" }
  - Assert <video> does NOT render or src is sanitized to empty string
  - Assert a warning/fallback message is shown instead

Test: poster attribute applied to <video poster>
  - Mount with attrs { src: "...", poster: "https://example.com/thumb.jpg" }
  - Assert the <video> element has poster="https://example.com/thumb.jpg"

Test: poster with javascript: protocol is rejected
  - Mount with attrs { src: "...", poster: "javascript:alert(1)" }
  - Assert the <video> element does NOT have the malicious poster value

Test: click in edit mode shows selection overlay
  - Mount in editable mode
  - Click on the video wrapper
  - Assert MediaSelectionOverlay is visible with action buttons
```

---

## Implementation Details

### NodeViewProps Interface

Each node view component receives `NodeViewProps` from `@tiptap/react`. The key properties used are:

- `node` -- the ProseMirror node containing `attrs` (src, alt, caption, poster, assetId, width, alignment, etc.)
- `updateAttributes(attrs)` -- function to update node attributes (e.g., changing caption text)
- `deleteNode()` -- function to remove the node from the document
- `editor` -- the Tiptap editor instance (check `editor.isEditable` for mode)
- `selected` -- boolean indicating if this node is currently selected in ProseMirror
- `getPos` -- function returning the node's position in the document

### MediaSelectionOverlay Component

A shared overlay component that appears when a media node is clicked in edit mode. It renders as an absolute-positioned container over the media element.

```
File: apps/web/client/src/components/editor/nodeviews/MediaSelectionOverlay.tsx

Props:
  - visible: boolean
  - onRemove: () => void
  - onEditCaption?: () => void
  - onEditAlt?: () => void         (image only)
  - onReplace?: () => void         (opens MediaInsertMenu -- wired in section 08)
  - onAlignChange?: (align: string) => void

Behavior:
  - Renders a row of icon buttons (Lucide icons) in a semi-transparent bar
  - Buttons: Replace (optional), Edit Alt/Caption, Align Left/Center/Right, Remove (Trash2)
  - Uses Tailwind classes for styling (absolute positioning, backdrop blur, rounded corners)
  - Clicking outside the overlay dismisses it
```

### ImageNodeView Component

```
File: apps/web/client/src/components/editor/nodeviews/ImageNodeView.tsx

Structure:
  - Wraps everything in <NodeViewWrapper> (required by Tiptap for React node views)
  - Renders <img> with src, alt from node.attrs
  - Applies alignment class based on node.attrs.alignment (left/center/right)
  - If node.attrs.caption exists, renders editable caption text below image
  - In edit mode (editor.isEditable): click toggles MediaSelectionOverlay
  - In view mode: renders as plain image with caption, no overlay

Caption editing:
  - When "Edit Caption" is clicked, show an inline <input> below the image
  - On blur or Enter, call updateAttributes({ caption: newValue })
  - Empty caption hides the caption element

Alt text editing:
  - When "Edit Alt" is clicked, show a small floating input
  - On blur or Enter, call updateAttributes({ alt: newValue })

Selection state:
  - When `selected` prop is true, add a visual ring/border to indicate selection
  - Use Tailwind ring utilities (e.g., ring-2 ring-blue-500)
```

### VideoNodeView Component

```
File: apps/web/client/src/components/editor/nodeviews/VideoNodeView.tsx

Structure:
  - Wraps in <NodeViewWrapper>
  - Renders <video> with controls attribute
  - src from node.attrs.src (after URL validation)
  - poster from node.attrs.poster (after URL validation)
  - Caption rendered as editable text below video (same pattern as ImageNodeView)
  - In edit mode: click on wrapper (not on video controls) shows MediaSelectionOverlay

URL Validation (SECURITY CRITICAL):
  - Before setting src or poster on the <video> element, validate the URL
  - REJECT any URL starting with "javascript:", "data:text/html", "vbscript:"
  - ALLOW: https://, http://, /uploads/, /api/ (relative paths for uploaded assets)
  - Implementation: create a small helper function `isSafeMediaUrl(url: string): boolean`
  - If validation fails, render a placeholder with warning text instead of the video

Interaction notes:
  - The <video> element itself has pointer-events for its native controls (play, volume, etc.)
  - The selection overlay triggers on clicking the wrapper div around the video, not the video itself
  - Use a click handler on the outer wrapper, with stopPropagation consideration for the video controls
```

### AudioNodeView Component

```
File: apps/web/client/src/components/editor/nodeviews/AudioNodeView.tsx

Structure:
  - Wraps in <NodeViewWrapper>
  - Renders <audio> with controls attribute
  - src from node.attrs.src (after URL validation, same helper as VideoNodeView)
  - Caption rendered below audio player if present
  - Simpler than video: no poster, no complex sizing
  - In edit mode: click shows MediaSelectionOverlay (Remove, Replace, Edit Caption)
  - In view mode: renders as plain audio player with optional caption
```

### URL Validation Helper

Create a shared utility used by both VideoNodeView and AudioNodeView (and optionally ImageNodeView):

```
File: apps/web/client/src/components/editor/nodeviews/mediaUrlValidator.ts

Export: isSafeMediaUrl(url: string): boolean
  - Returns false for: javascript:, vbscript:, data:text/html
  - Returns true for: https://, http://, relative paths starting with /
  - Returns false for empty string or undefined
  - Case-insensitive check (handles "JavaScript:" etc.)

Export: sanitizeMediaUrl(url: string): string
  - Returns the URL if safe, empty string otherwise
```

### Wiring Node Views to Extensions

This wiring happens in section 06 (Media Extensions), but for clarity: each extension's `addNodeView()` method returns `ReactNodeViewRenderer(ImageNodeView)` (or VideoNodeView/AudioNodeView). The node view components are imported from the `nodeviews/` directory.

The extensions define attributes via `addAttributes()`. The node view components read these attributes from `node.attrs`. The mapping is:

| Extension Attribute | HTML Source | Node View Usage |
|---|---|---|
| `src` | `<img src>` / `<video src>` / `<audio src>` | Main media element `src` prop |
| `alt` | `<img alt>` | `<img alt>` attribute |
| `caption` | `data-caption` | Rendered as text below media |
| `poster` | `data-poster` | `<video poster>` attribute |
| `assetId` | `data-asset-id` | Stored for library reference (not rendered) |
| `width` | `width` attribute | CSS width on wrapper |
| `alignment` | `data-alignment` | CSS class (text-left/center/right on wrapper) |
| `controls` | `controls` attribute | `<video controls>` / `<audio controls>` |

### Styling

Node views use Tailwind utility classes directly (the project does not use CSS modules). Key patterns:

- Wrapper: `relative group` (for hover-based overlay visibility)
- Selected state: `ring-2 ring-blue-500 rounded`
- Caption: `text-sm text-muted-foreground text-center mt-1`
- Overlay: `absolute inset-0 bg-black/20 flex items-start justify-end p-2 gap-1`
- Overlay buttons: `p-1.5 rounded bg-white/90 hover:bg-white shadow-sm`
- Image: `max-w-full h-auto rounded` with alignment wrapper
- Video/Audio: `w-full rounded` with max-width constraint

### i18n Integration

Node view components need these translation keys (added in section 10, but defined here for reference):

- `editor.media.remove` -- "Remove" / "ลบ"
- `editor.media.editAlt` -- "Edit alt text" / "แก้ไขข้อความ alt"
- `editor.media.editCaption` -- "Edit caption" / "แก้ไขคำบรรยาย"
- `editor.media.replace` -- "Replace" / "แทนที่"
- `editor.media.unsafeUrl` -- "Unsafe URL blocked" / "URL ไม่ปลอดภัย"

Use the `useTranslation()` hook from the existing i18n setup. Until section 10 adds the keys, hardcode English strings as defaults.

### Accessibility Considerations

- Images must have `alt` attributes (empty string is acceptable for decorative images)
- Caption text should use `<figcaption>` inside a `<figure>` wrapper for semantic HTML
- Media overlay buttons need `aria-label` attributes
- Keyboard: overlay should be dismissable with Escape
- Video/audio players inherit browser-native accessibility from the `controls` attribute

---

## Implementation Checklist

1. Create `mediaUrlValidator.ts` with `isSafeMediaUrl` and `sanitizeMediaUrl`
2. Create `MediaSelectionOverlay.tsx` with action buttons
3. Create `ImageNodeView.tsx` with img rendering, caption, alt editing, overlay
4. Create `VideoNodeView.tsx` with video rendering, poster, caption, URL validation, overlay
5. Create `AudioNodeView.tsx` with audio rendering, caption, overlay
6. Write tests for ImageNodeView and VideoNodeView
7. Verify that node views integrate with the extensions from section 06 (import paths, attribute names)

---

## Implementation Notes (Actual)

### Files Created
- `apps/web/client/src/components/editor/nodeviews/mediaUrlValidator.ts` — thin re-export of `sanitizeMediaSrc` + `isSafeMediaUrl` boolean helper
- `apps/web/client/src/components/editor/nodeviews/MediaSelectionOverlay.tsx` — shared overlay with Replace, Edit Alt, Edit Caption, Align, Remove buttons; Escape/click-outside dismiss
- `apps/web/client/src/components/editor/nodeviews/ImageNodeView.tsx` — figure/figcaption, alignment classes, inline alt/caption editing
- `apps/web/client/src/components/editor/nodeviews/VideoNodeView.tsx` — video with poster validation, native controls passthrough
- `apps/web/client/src/components/editor/nodeviews/AudioNodeView.tsx` — audio with caption editing
- `apps/web/client/src/components/editor/nodeviews/ImageNodeView.test.tsx` — 7 tests
- `apps/web/client/src/components/editor/nodeviews/VideoNodeView.test.tsx` — 7 tests

### Files Modified
- `extensions/imageExtension.ts` — added `addNodeView()` with `ReactNodeViewRenderer(ImageNodeView)`
- `extensions/videoExtension.ts` — added `addNodeView()` with `ReactNodeViewRenderer(VideoNodeView)`
- `extensions/audioExtension.ts` — added `addNodeView()` with `ReactNodeViewRenderer(AudioNodeView)`

### Deviations from Plan
- **URL validator**: Reused existing `sanitizeMediaSrc` from `mediaSerializationRules.ts` via thin wrapper instead of duplicating validation logic. `mediaUrlValidator.ts` is a convenience re-export + boolean helper.
- **Enter/blur fix**: Changed Enter key handler to call `e.currentTarget.blur()` to avoid double-firing `updateAttributes` (code review fix).
- **i18n**: Hardcoded English strings as planned; keys will be added in section 10.

### Test Results
- 14 new tests pass (7 ImageNodeView + 7 VideoNodeView)
- 21 existing extension tests still pass (no regressions)