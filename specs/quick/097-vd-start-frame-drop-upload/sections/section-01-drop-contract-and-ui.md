# Section 01: Drop Contract and UI

## Ownership

- `VerticalDramaStoryboardPanel.tsx`
- `VerticalDramaEpisodeWorkspace.tsx`
- dedicated storyboard-panel regression test

## Work

Define the discriminated input, convert dropped browser inputs without losing metadata,
await the callback, maintain per-shot drag/busy state, and propagate the callback type
through the workspace.

## TDD expectations

Write failing component tests first for file payload, URL payload, awaited busy state,
duplicate suppression, and validation failures.

## UI/UX Contract

- target user/job: a Vertical Drama editor replacing one shot's Start Frame from a local
  image without opening a picker;
- surface: the existing 9:16 Start Frame thumbnail in each storyboard shot card;
- states: idle, drag-over, reading, uploading/persisting, success refresh, error recovery;
- responsive: preserve current mobile/tablet/desktop card sizing and avoid new layout;
- accessibility: keep keyboard lightbox behavior; busy overlay must not create a second
  focus target; use `aria-busy` and a descriptive drop title/label where applicable;
- tokens: reuse existing `ring-primary`, `bg-primary/5`, border, and overlay conventions;
- copy: reuse existing Thai/English unsupported-type, size, success, and failure copy;
- browser evidence: drag one PNG on desktop and verify highlight, spinner, replacement,
  and retry after a forced rejection when a safe local session is available.

## Acceptance

The component emits a correct discriminated input and remains busy until the callback
settles without changing unrelated storyboard behavior.

## Implementation Notes

- Added the shared `VerticalDramaStartFrameDropInput` contract in
  `apps/web/client/src/lib/verticalDramaStartFrameDrop.ts` and propagated its awaited
  callback through the storyboard panel and episode workspace.
- The existing 9:16 thumbnail now accepts local image files, durable URLs, and inline
  image data URLs; it shows drag focus and per-shot `aria-busy` state and suppresses a
  duplicate drop while the same shot is still being replaced.
- Component coverage is in
  `VerticalDramaStoryboardPanel.startFrameDropUpload.test.tsx` (5 tests), including
  simultaneous per-shot busy state and drag-over feedback.
