## Goal

Expose a repair action in the Slide Note dialog and integrate it with save/refresh/undo behavior.

## Tasks

- Add mutation hook in `PresentationEditor.tsx`.
- Add `Repair Slide` / `Generate Slide` action in the Slide Note dialog.
- Save dirty note first if needed.
- Apply repaired slide content locally, refresh deck data, and restore undo history.
- Surface warnings/toasts cleanly.

## Tests

- Dialog action visibility and disable/guard state.
- Save-first behavior.
- Undo restoration after repair.
