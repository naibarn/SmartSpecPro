# Section 04 — Cover Slots UI

## UI/UX Contract

### Target user/job

A Vertical Drama creator wants four alternative episode covers and can generate only the option they need without blocking other options.

### Surface inventory

- Episode cover panel: four cover cards in a responsive grid.
- Shared model selector and title/channel logo checkboxes.
- Per-slot generate/retry/upload/open/download actions.
- Existing four preview cards with optional assigned-cover label.

### Component map

- Update `VerticalDramaEpisodePreviewPanel` to render four cover-slot states.
- Reuse `VerticalDramaEpisodeCoverSurface` per slot; add slot-specific test IDs and callbacks.
- Keep preview shot selection controls unchanged.

### State matrix

| State | Slot action | Other slots | Copy |
|---|---|---|---|
| empty | generate enabled when model selected | enabled | `สร้างหน้าปกแบบที่ N` |
| generating | disabled/loading | remain enabled | `กำลังสร้างหน้าปกแบบที่ N…` |
| ready | regenerate/upload/open/download | remain enabled | `สร้างใหม่` |
| failed | retry enabled | remain enabled | show server error + `ลองอีกครั้ง` |

### Responsive/accessibility

- Use a one-column layout on narrow screens and a two-column grid when space permits.
- Each slot has a visible heading, status, button label, and unique `aria-label`/`data-testid`.
- Do not rely on color alone for status; preserve text/error descriptions.
- Keyboard users can reach every slot action independently.

### Copy/localization

Provide Thai and English for slot labels, loading, retry, upload, and assigned-cover text. Existing credit confirmation remains before each paid generation.

### Browser evidence

Capture/inspect the episode route after generation: all four slots visible, one-slot loading isolation, and preview cards showing their persisted cover assignment. Browser verification may be manual if no authenticated browser harness is available.

## TDD

Add/update component tests for four slots, independent pending state, slot-specific mutation payload, and preserved shared logo/model controls.
