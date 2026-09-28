# Implementation plan

## Objective

Separate “new special episode” from “resume previous work” at the entry point and make the selected mode authoritative for history loading.

## Files

- `apps/web/client/src/pages/VerticalDramaSeriesDetailPage.tsx`
  - Add chooser state and mode state.
  - Open chooser from the existing Special Tie-in button.
  - Open editor only after a mode is selected; reset mode/chooser on close.
- `apps/web/client/src/components/verticalDramaSeries/SpecialTieInEpisodeDialog.tsx`
  - Add `initialMode` prop.
  - Gate history query and auto-hydration on resume mode.
  - Keep `initialInput` edit behavior unchanged.
- Existing or new focused test file under `apps/web/client/src/pages/__tests__` / component tests.

## Acceptance criteria

- Clicking create special shows a centered chooser.
- Fresh opens an empty editor and never loads latest history.
- Resume opens the existing latest-history behavior.
- Closing and reopening shows the chooser again.
- After a fresh episode is created, its newly generated idea run remains the latest data selected by resume; older runs are never auto-selected in fresh mode.
- Existing episode editing and normal episode flow remain unchanged.

## Verification

- Focused Vitest for chooser/mode behavior.
- Prettier check for changed files.
- `git diff --check`.
- Client build or targeted TypeScript/esbuild parse if full build is blocked by the dirty worktree.
