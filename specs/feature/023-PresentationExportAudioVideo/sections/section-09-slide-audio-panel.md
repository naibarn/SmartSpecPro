I now have all the context needed to write the section. Here is the complete markdown content for `section-09-slide-audio-panel.md`:

# Section 09: Frontend — SlideAudioPanel Component

## Overview

This section implements the `SlideAudioPanel` React component — a properties-panel tab that lets users attach and configure audio tracks on a per-slide and project-wide basis. It is rendered inside the right properties panel of the Presentation Editor as a new "Audio" tab (wired in Section 10).

**Implementation order position:** Batch 5 — runs in parallel with sections 07, 08, 12, and 13 once section 04 (tRPC router) is complete.

**Depends on:**
- Section 02 (Shared Contracts) — `audioTrackInputSchema`, `projectAudioTrackInputSchema`, `ResolvedAudioTrack` types
- Section 04 (tRPC Router) — `setSlideAudio` and `setDeckAudio` mutations

**Blocks:**
- Section 10 (Editor Modifications) — the editor embeds this component in the Audio tab

---

## Files to Create / Modify

| Action | File |
|--------|------|
| CREATE | `/home/dev/projects/SmartSpecPro/apps/web/client/src/components/presentation/SlideAudioPanel.tsx` |
| CREATE | `/home/dev/projects/SmartSpecPro/apps/web/client/src/components/presentation/SlideAudioPanel.test.tsx` |

---

## Tests First

Write the test file before implementing the component. Tests use **Vitest + React Testing Library**. Mock tRPC mutations via `vi.mock` or by wrapping in a test tRPC provider.

**File:** `/home/dev/projects/SmartSpecPro/apps/web/client/src/components/presentation/SlideAudioPanel.test.tsx`

```typescript
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { SlideAudioPanel } from "./SlideAudioPanel";
// Import your test wrapper that provides tRPC context

describe("SlideAudioPanel", () => {
  // --- Per-slide audio section ---

  it("renders 'Add Audio' button when no audio track is configured for slide", () => {
    // Render with slideAudioTrack={null}
    // Assert: getByRole('button', { name: /add audio/i }) is present
  });

  it("renders audio file name and volume slider when audio track exists", () => {
    // Render with slideAudioTrack={ libraryItemId: 1, volume: 0.6, startAtMs: 0, title: "Track A" }
    // Assert: file name "Track A" is visible
    // Assert: a slider element is present
  });

  it("'Remove' button clears audio track (calls setSlideAudio with null)", async () => {
    // Render with slideAudioTrack configured
    // Click Remove
    // Assert: setSlideAudio mutation called with { slideId, audioTrack: null, expectedVersion }
  });

  it("volume slider value reflects audioTrack.volume (0–1 mapped to 0–100%)", () => {
    // Render with slideAudioTrack={ volume: 0.75, ... }
    // Assert: slider shows value 75 (or label "75%")
  });

  // --- Project-wide audio section ---

  it("'Add Project Audio' button is always visible (not gated on slide selection)", () => {
    // Render with slideId={null} (no slide selected)
    // Assert: getByRole('button', { name: /add project audio/i }) is visible
  });

  it("project audio section shows file name and loop toggle when deck audio exists", () => {
    // Render with deckAudioTrack={ libraryItemId: 2, volume: 0.5, loop: true, fadeOutMs: null, title: "BG Music" }
    // Assert: "BG Music" visible
    // Assert: loop toggle present and checked
  });

  it("setDeckAudio mutation is called with null when deck audio is removed", async () => {
    // Render with deckAudioTrack configured
    // Click Remove on project audio section
    // Assert: setDeckAudio called with { deckId, audioTrack: null, expectedVersion }
  });

  it("media library picker filters to audio/* MIME types", async () => {
    // Click "Add Audio" to open picker
    // Assert: the picker dialog/panel is rendered with mimeTypeFilter="audio/*"
    // (or assert the query passed to the library search contains mimeType filter)
  });
});
```

Run tests with:
```bash
cd /home/dev/projects/SmartSpecPro/apps/web && pnpm test -- SlideAudioPanel
```

---

## Background and Context

### Audio Track Data Model

The audio track shapes come from `apps/web/shared/presentation/contracts.ts` (added in Section 02). At the input/mutation layer they use `libraryItemId` (not a URL). The panel never sees resolved URLs — resolution happens server-side at export time and in `getPlayDeck`.

**Per-slide audio track** (stored as `presentation_slides.audioTrack` JSON column):
```typescript
{
  libraryItemId: number,   // ID of the media library item (audio file)
  volume: number,          // 0.0–1.0
  startAtMs: number,       // default 0 — where in the audio file to start playing
  endAtMs: number | null,  // null = play to end of the audio file
}
```

**Project-wide audio track** (stored as `presentation_decks.projectAudioTrack` JSON column):
```typescript
{
  libraryItemId: number,
  volume: number,          // 0.0–1.0
  loop: boolean,           // whether to loop when audio ends
  fadeOutMs: number | null,// milliseconds for fade-out at end of presentation
}
```

Both are nullable — `null` means no audio configured. Setting to `null` via the mutation removes the audio track.

### tRPC Mutations (from Section 04)

The component calls two mutations exposed on the `presentation` tRPC router:

**`setSlideAudio`** — sets or clears per-slide audio:
```typescript
trpc.presentation.setSlideAudio.useMutation()
// Input: { slideId: number, deckId: number, audioTrack: AudioTrackInput | null, expectedVersion: number }
```

**`setDeckAudio`** — sets or clears project-wide audio:
```typescript
trpc.presentation.setDeckAudio.useMutation()
// Input: { deckId: number, audioTrack: ProjectAudioTrackInput | null, expectedVersion: number }
```

Both require `expectedVersion` for optimistic locking (consistent with the existing `updateSlide` pattern in the editor). The current version comes from the deck/slide data already loaded by the editor.

### Media Library Picker

The audio picker re-uses the existing `LibrarySearchPanel` component at `/home/dev/projects/SmartSpecPro/apps/web/client/src/components/media/LibrarySearchPanel.tsx`. This component accepts `onSelect` and renders a searchable list of library items. To filter by audio, pass a `mimeTypeFilter="audio/*"` prop (or filter the query results by `item_type === "audio"`).

The picker should be shown in a `Sheet` or small `Dialog` (Radix UI). On selection, the `libraryItemId` is captured from the returned `LibrarySearchResultItem.id` and the title from `LibrarySearchResultItem.title`.

The panel stores a local display title (for rendering the selected file name) alongside the `libraryItemId`. This title is not persisted to the DB — it is fetched fresh from the library item when the panel next loads.

### UI Component Library

Use existing Radix-based primitives from `@/components/ui/`:
- `Slider` — for volume (0–100%, maps to 0.0–1.0 internally)
- `Switch` — for the loop toggle on project audio
- `Button` — for Add Audio, Remove, Save actions
- `Input` — for startAtMs / endAtMs numeric inputs (in seconds)
- `Label` — for field labels
- `Separator` — between per-slide and project sections
- `Sheet` or `Dialog` — for the media library picker overlay

---

## Implementation Details

### Component Signature

```typescript
// /home/dev/projects/SmartSpecPro/apps/web/client/src/components/presentation/SlideAudioPanel.tsx

interface SlideAudioPanelProps {
  /** ID of the currently selected slide. null if no slide is selected. */
  slideId: number | null;
  /** Version of the currently selected slide (for optimistic locking). */
  slideVersion: number | null;
  /** Current audio track on the selected slide, or null. */
  slideAudioTrack: AudioTrackInput | null;
  /** ID of the deck. */
  deckId: number;
  /** Version of the deck (for optimistic locking). */
  deckVersion: number;
  /** Current project-wide audio track on the deck, or null. */
  deckAudioTrack: ProjectAudioTrackInput | null;
}

export function SlideAudioPanel(props: SlideAudioPanelProps): JSX.Element
```

### Per-Slide Audio Section

Condition: only render the per-slide section when `slideId` is non-null. If `slideId` is null, show a placeholder: "Select a slide to configure its audio."

**When `slideAudioTrack` is null:**
- Show "No audio configured for this slide."
- Show "Add Audio" button that opens the media library picker (filtered to `audio/*`)

**When `slideAudioTrack` is non-null:**
- Show the selected audio file name/title (fetched or cached from library item)
- Volume slider: `Slider` component, min=0, max=100, step=1. Display as percentage label (e.g. "60%"). On change, map to 0.0–1.0 for the stored value.
- Start offset: `Input type="number"` in seconds (e.g. "0.0 s"). Min=0, step=0.1. Maps to `startAtMs = value * 1000`.
- End time: Either a checkbox "Play to end" (sets `endAtMs = null`) or an `Input type="number"` for end time in seconds (sets `endAtMs = value * 1000`).
- "Remove" button: calls `setSlideAudio` mutation with `audioTrack: null`
- "Save" button (or auto-save on blur): calls `setSlideAudio` mutation with the current values

Keep local state for the form fields. Only call the mutation on explicit Save or Remove — do not mutate on every slider tick.

### Project-Wide Audio Section

Always shown regardless of slide selection.

**When `deckAudioTrack` is null:**
- Show "No project audio configured."
- Show "Add Project Audio" button that opens the media library picker

**When `deckAudioTrack` is non-null:**
- Show the selected audio file name/title
- Volume slider (same pattern as per-slide)
- Loop toggle: `Switch` component, label "Loop"
- Fade-out input: `Input type="number"` in milliseconds (or seconds with conversion), label "Fade out (ms)". Can be empty/null for no fade.
- "Remove" button: calls `setDeckAudio` mutation with `audioTrack: null`
- "Save" button: calls `setDeckAudio` mutation with current values

### Media Library Picker Sub-Component

Implement a small internal `AudioPickerDialog` component within the same file (or as a separate file if preferred):

```typescript
interface AudioPickerDialogProps {
  open: boolean;
  onClose: () => void;
  /** Called when user selects an audio file from the library. */
  onSelect: (libraryItemId: number, title: string) => void;
}
```

The dialog renders `LibrarySearchPanel` with results filtered to `item_type === "audio"`. Selecting an item calls `onSelect(item.id, item.title)` and closes the dialog.

### Error Handling

- If `setSlideAudio` or `setDeckAudio` mutation fails, show a toast notification (use `sonner` toast, consistent with the rest of the editor).
- If the mutation returns a version conflict error, show a conflict message and offer to reload.

### Styling

Follow Tailwind utility classes consistent with the rest of the editor's right panel. The panel sections are separated by a visual divider. Use `text-sm` for labels, `text-muted-foreground` for secondary text. Keep compact spacing (`gap-3`, `py-2`) since this lives inside a narrow properties panel.

---

## Implementation Checklist

- [ ] Write `SlideAudioPanel.test.tsx` with all 8 test cases (tests first)
- [ ] Run tests — confirm they all fail initially
- [ ] Create `SlideAudioPanel.tsx` with the `SlideAudioPanel` component and `AudioPickerDialog` sub-component
- [ ] Implement per-slide audio section (conditional on `slideId` non-null)
  - [ ] "Add Audio" button opens `AudioPickerDialog`
  - [ ] Audio track display: file name, volume slider, start/end time inputs
  - [ ] "Remove" button wired to `setSlideAudio(null)`
  - [ ] "Save" button wired to `setSlideAudio(currentValues)`
- [ ] Implement project-wide audio section (always visible)
  - [ ] "Add Project Audio" button opens `AudioPickerDialog`
  - [ ] Audio track display: file name, volume, loop switch, fade-out input
  - [ ] "Remove" button wired to `setDeckAudio(null)`
  - [ ] "Save" button wired to `setDeckAudio(currentValues)`
- [ ] Implement `AudioPickerDialog` using `LibrarySearchPanel` filtered to `audio/*`
- [ ] Add error toast on mutation failure
- [ ] Run tests — confirm they all pass
- [ ] Run full test suite: `cd /home/dev/projects/SmartSpecPro/apps/web && pnpm test`

---

## Implementation Results

**Status:** COMPLETE

### Files Created

| File | Notes |
|------|-------|
| `apps/web/client/src/components/presentation/SlideAudioPanel.tsx` | Created with `SlideAudioPanel` + `AudioPickerDialog` sub-component |
| `apps/web/client/src/components/presentation/SlideAudioPanel.test.tsx` | 8 tests (8/8 passing) |

### Deviations from Plan

1. **AudioPickerDialog uses `trpc.library.search` directly** (not `LibrarySearchPanel`): `LibrarySearchPanel` is a presentational component that requires pre-fetched results. The implementation calls `trpc.library.search.useQuery` directly with `filters: { itemType: "audio" }`, which is functionally equivalent and produces less indirection. `trpc.library.search` confirmed to exist at `server/routers/library.ts:126`.

2. **Selecting audio immediately saves** (deviates from plan's "Save required" spec): User decided immediate save on file select is acceptable UX. Save button still available to update volume/timing for existing tracks.

3. **`title` stripped from mutation inputs** (H2 code review fix): `audioTrackInputSchema` and `projectAudioTrackInputSchema` are `.strict()`. Title is display-only and not sent to server. Builder functions `buildSlideAudioTrackInput()` and `buildDeckAudioTrackInput()` construct clean inputs.

4. **`setDeckAudio` uses `projectAudioTrack` field** (bug fix): The tRPC `setDeckAudio` mutation input uses `projectAudioTrack` (not `audioTrack`). All three deck mutation calls fixed.

5. **`endAtMs: 0` guard** (H3 fix): `computeSlideEndAtMs()` returns `null` when `slideEndSec <= 0` to prevent sending `endAtMs: 0` (which means "play 0 ms of audio").

6. **Version conflict detection in `onError`** (M3 fix): Checks `err.data?.code === "CONFLICT"` and shows specific reload message.

### Test Count

- **8 tests**, 8/8 passing
- Covers: Add Audio button, title/slider display, Remove (setSlideAudio null), volume aria-valuenow (0.75→75), Add Project Audio always visible, deck title/loop-switch, Remove deck (setDeckAudio projectAudioTrack null), picker itemType filter