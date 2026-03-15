# Section 11: Chat UI -- Expandable Image Gallery

## Overview

This section implements the Phase 2 chat UI components for multimodal memory: an expandable image gallery panel (`ImageGalleryPanel`), a visual context count badge (`VisualContextBadge`), and inline image chips rendered inside assistant messages when the LLM references past images. These are all React components in the chat UI layer.

**Dependencies**: Section 10 (user controls and deletion -- provides the tRPC mutations `deleteImageFromMemory` and `pinImageMemory` that the gallery's action buttons call). Section 02 (media asset service -- provides `fetchAsset` with signed URLs). Section 05 (visual state service -- provides `getOrCreateState` for the badge count). Section 07 (context packing -- the `imageAssets` array on `ChatContext` drives what gets displayed).

## Files to Create

| File | Purpose |
|------|---------|
| `apps/web/client/src/components/chat/ImageGalleryPanel.tsx` | Expandable side panel showing referenced images |
| `apps/web/client/src/components/chat/VisualContextBadge.tsx` | Badge showing image count in visual working set |
| `apps/web/client/src/components/chat/__tests__/ImageGalleryPanel.test.tsx` | Tests for gallery panel |
| `apps/web/client/src/components/chat/__tests__/VisualContextBadge.test.tsx` | Tests for context badge |

## Files to Modify

| File | Changes |
|------|---------|
| `apps/web/client/src/components/chat/ChatView.tsx` | Integrate `ImageGalleryPanel` and `VisualContextBadge`, render image chips in assistant messages |
| `apps/web/client/src/components/chat/index.ts` | Export new components |

## Tests First

All tests use Vitest with `@testing-library/react`. Write these before implementing.

### `apps/web/client/src/components/chat/__tests__/ImageGalleryPanel.test.tsx`

```typescript
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

// Mock trpc
vi.mock("@/lib/trpc", () => ({
  trpc: {
    chat: {
      deleteImageFromMemory: { useMutation: vi.fn(() => ({ mutate: vi.fn() })) },
      pinImageMemory: { useMutation: vi.fn(() => ({ mutate: vi.fn() })) },
    },
  },
}));

describe("ImageGalleryPanel", () => {
  // Test: renders thumbnails for referenced images
  // -- Pass an array of 3 image assets, verify 3 img elements render with correct alt text

  // Test: expands to full-size on click
  // -- Click a thumbnail, verify the ImageLightbox opens (or a detail view is shown)

  // Test: shows caption and tags for each image
  // -- Pass assets with caption and tags, verify text content is visible

  // Test: includes "Remove from memory" button
  // -- Verify a button with accessible name containing "Remove" or "ลบ" exists for each image

  // Test: calls deleteImageFromMemory mutation on remove click
  // -- Click remove button, verify the tRPC mutation was called with correct assetId

  // Test: calls pinImageMemory mutation on pin click
  // -- Click pin button, verify tRPC mutation called with assetId

  // Test: renders nothing when images array is empty
  // -- Pass empty array, verify component renders null or empty container

  // Test: panel can be collapsed and expanded
  // -- Verify toggle button exists, clicking it toggles panel visibility
});
```

### `apps/web/client/src/components/chat/__tests__/VisualContextBadge.test.tsx`

```typescript
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

describe("VisualContextBadge", () => {
  // Test: shows correct image count
  // -- Pass count=3, verify "3" appears in the badge text

  // Test: hidden when no images in context (count is 0)
  // -- Pass count=0, verify component renders nothing

  // Test: shows singular/plural label correctly
  // -- count=1 shows "1 image", count=3 shows "3 images"

  // Test: image chips render inline in assistant message
  // -- This test belongs in ChatView integration but is listed here for completeness
  // -- Verify that when an assistant message contains assetId markers,
  //    small thumbnail+caption chips render inline
});
```

### Image Chips in Assistant Messages (tested in ChatView context)

```typescript
// These tests go in the existing ChatView test file or a new
// apps/web/client/src/components/chat/__tests__/ChatView.imageChips.test.tsx

describe("Image chips in assistant messages", () => {
  // Test: image chips render inline in assistant message
  // -- Mock a message with content containing [image:assetId:123] markers
  // -- Verify a small thumbnail chip renders with caption text

  // Test: image chip click opens gallery panel to that image
  // -- Click the chip, verify gallery panel opens with the correct image focused

  // Test: no chips rendered when message has no image markers
  // -- Regular text message, verify no chip elements in the DOM
});
```

## Implementation Details

### 1. ImageGalleryPanel Component

**File**: `apps/web/client/src/components/chat/ImageGalleryPanel.tsx`

This is a collapsible side panel that displays images referenced by the LLM in its response. It follows the same panel pattern used by `MemoryPanel` and `ArtifactPanel` in the codebase.

**Props interface**:

```typescript
interface ImageGalleryPanelProps {
  /** Array of image assets currently referenced in the LLM response */
  images: Array<{
    assetId: number;
    fileUrl: string;       // signed URL from mediaAssetService
    thumbnailUrl?: string;
    caption?: string;
    tags?: string[];
    role: "memory" | "current";
  }>;
  /** Conversation ID for mutation context */
  conversationId: number;
  /** Whether the panel is currently visible */
  open: boolean;
  /** Toggle panel visibility */
  onToggle: () => void;
  /** Callback after an image is removed from memory */
  onImageRemoved?: (assetId: number) => void;
}
```

**Behavior**:
- Renders as a right-side panel (similar to `ArtifactPanel` layout), taking approximately 320px width when open.
- Uses a CSS transition or Framer Motion `AnimatePresence` for open/close animation.
- Displays images as a vertical list of thumbnail cards. Each card shows:
  - Thumbnail image (120px wide, aspect-ratio preserved).
  - `caption` text below the image (truncated to 2 lines with `line-clamp-2`).
  - `tags` rendered as small `Badge` components (from `@smartspec/ui`).
  - A `role` indicator: "memory" items show a small Brain icon, "current" items show no extra indicator.
  - Action buttons row: "Pin" (thumbtack icon, calls `pinImageMemory` tRPC mutation from section 10), "Remove from memory" (Trash2 icon, calls `deleteImageFromMemory` tRPC mutation from section 10).
- Clicking any thumbnail opens the existing `ImageLightbox` component (already in the codebase at `components/chat/media/ImageLightbox.tsx`) with all gallery images and the clicked index.
- Uses `ScrollArea` from Radix UI for overflow scrolling.
- When `images` is empty, the component returns `null` (renders nothing).

**tRPC mutations consumed** (from section 10):
- `trpc.chat.deleteImageFromMemory.useMutation()` -- takes `{ assetId, conversationId }`.
- `trpc.chat.pinImageMemory.useMutation()` -- takes `{ assetId, conversationId }`.

After a successful `deleteImageFromMemory` call, invoke `onImageRemoved` callback so the parent (`ChatView`) can update its local state and remove the image from the displayed list.

**Styling**: Use Tailwind utility classes. The panel background should use `bg-card` with `border-l` to visually separate it from the chat area. Follow the existing dark-mode-compatible patterns (use semantic color tokens like `bg-card`, `text-muted-foreground`, `border`).

### 2. VisualContextBadge Component

**File**: `apps/web/client/src/components/chat/VisualContextBadge.tsx`

A small informational badge displayed in the chat header or near the message input area.

**Props interface**:

```typescript
interface VisualContextBadgeProps {
  /** Number of images currently in the visual working set */
  count: number;
  /** Optional click handler to open the gallery panel */
  onClick?: () => void;
}
```

**Behavior**:
- When `count` is 0, renders `null` (hidden).
- When `count > 0`, renders a small `Badge` component with an `ImageIcon` (from lucide-react) and text like "3 images in context" (or Thai: "3 รูปในบริบท" if locale detection is needed -- for now use English).
- The badge is clickable (when `onClick` is provided) to toggle the gallery panel open.
- Uses the `Badge` component from `@smartspec/ui` with `variant="secondary"` for a subtle appearance.

### 3. Image Chips in Assistant Messages

**Integration point**: Inside `ChatView.tsx`, in the message rendering loop where assistant message content is displayed.

When the LLM response references images, the system injects asset markers into the response text in the format `[image:assetId:123]`. The rendering logic must:

1. **Parse markers**: Use a regex like `/\[image:assetId:(\d+)\]/g` to find all image references in the assistant message content.
2. **Replace with chips**: For each marker, render an inline `ImageChip` element -- a small component (not a separate file, can be a local component within `ChatView.tsx` or a small utility):
   - Shows a tiny thumbnail (32x32px, rounded) from the matched asset's `thumbnailUrl` or `fileUrl`.
   - Shows the `caption` text next to it (truncated).
   - Clicking the chip opens the `ImageGalleryPanel` scrolled to that image.
3. **Interleave with text**: Split the message content at marker boundaries and render alternating text spans and chip components.

**Data flow**: The `imageAssets` array from the chat context (populated by section 07 context packing) is available via the conversation state. When rendering a message, cross-reference any `[image:assetId:NNN]` markers against this array to get thumbnails and captions.

If no markers are present in a message, the standard `SafeMarkdown` rendering applies with no changes.

### 4. ChatView Integration

**File**: `apps/web/client/src/components/chat/ChatView.tsx`

Modifications needed:

- **State**: Add `const [galleryOpen, setGalleryOpen] = useState(false)` to track panel visibility.
- **Data**: Fetch the visual state for the current conversation to get the image count for the badge. This can use a tRPC query like `trpc.chat.getVisualState.useQuery({ conversationId })` (provided by section 05/10). The query returns `{ recentAssetIds, activeAssetIds }`.
- **Layout**: Wrap the chat message area and gallery panel in a flex container. When `galleryOpen` is true, the chat area shrinks and the gallery panel takes 320px on the right.
- **Badge placement**: Render `VisualContextBadge` in the chat header area (near the model selector or conversation title). Pass `count` from the visual state query and `onClick` to toggle the gallery.
- **Message rendering**: In the assistant message rendering section, add the image chip parsing logic described above. The existing `SafeMarkdown` component handles standard markdown -- image chips are rendered as React elements interleaved with the markdown output.

### 5. Export Updates

**File**: `apps/web/client/src/components/chat/index.ts`

Add these exports:

```typescript
export { ImageGalleryPanel } from "./ImageGalleryPanel";
export { VisualContextBadge } from "./VisualContextBadge";
```

## Data Flow Summary

```
User sends message with image reference
    |
    v
buildChatContext() resolves images (section 07)
    |
    v
LLM receives images in context, generates response with [image:assetId:NNN] markers
    |
    v
ChatView renders assistant message
    |-- SafeMarkdown renders text parts
    |-- ImageChip renders for each [image:assetId:NNN] marker
    |
    v
VisualContextBadge shows "N images in context" (from visual state query)
    |
    v (user clicks badge or chip)
    |
ImageGalleryPanel opens showing all referenced images
    |-- User can view full-size (ImageLightbox)
    |-- User can pin (pinImageMemory mutation)
    |-- User can remove (deleteImageFromMemory mutation)
```

## Key Patterns to Follow

- **UI library**: Use Radix UI primitives from `@smartspec/ui` (`Badge`, `Button`, `ScrollArea`, `Tooltip`). Import from `@/components/ui/*`.
- **Icons**: Use `lucide-react` icons (`Image`, `Pin`, `Trash2`, `Brain`, `X`, `ChevronLeft`, `ChevronRight`).
- **Styling**: TailwindCSS 4 utility classes. Use `cn()` from `@/lib/utils` for conditional class merging.
- **Animations**: Framer Motion `AnimatePresence` + `motion.div` for panel slide in/out (already used extensively in the codebase).
- **Data fetching**: tRPC hooks via `trpc.chat.*` pattern with TanStack Query.
- **Toast notifications**: Use `toast` from `sonner` for success/error feedback on pin/remove actions.
- **Existing lightbox**: Reuse `ImageLightbox` from `./media/ImageLightbox` for full-size image viewing. It accepts `images: Array<{ src, alt? }>`, `open`, `onClose`, `initialIndex`.

## Acceptance Criteria

1. When an LLM response contains image asset references, the `ImageGalleryPanel` can be opened to see all referenced images with thumbnails, captions, and tags.
2. The `VisualContextBadge` accurately reflects the number of images in the conversation's visual working set and is hidden when the count is zero.
3. Image chips render inline within assistant messages at the correct positions, showing a small thumbnail and truncated caption.
4. The "Remove from memory" button successfully calls the deletion mutation and removes the image from the gallery.
5. The "Pin" button calls the pin mutation and provides visual feedback.
6. Clicking a thumbnail in the gallery opens the existing `ImageLightbox` for full-size viewing.
7. The gallery panel opens/closes with a smooth animation and does not disrupt the chat message scroll position.
8. All components render correctly in dark mode using semantic Tailwind color tokens.