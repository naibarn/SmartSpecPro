# Section 02 — UI and Server Integration

## Ownership

- `apps/web/client/src/pages/VerticalDramaEpisodePage.tsx`
- `apps/web/client/src/components/verticalDramaSeries/VerticalDramaStoryboardPanel.tsx`
- `apps/web/client/src/components/verticalDramaSeries/VerticalDramaEpisodeWorkspace.tsx`
  only if prop forwarding requires it
- Existing focused panel test
- `apps/web/server/routers/verticalDramaEpisodes.ts`
- Existing focused assembly service/router test

## Work

Replace raw persisted-clip readiness with the section-01 resolver on both sides.
The panel receives canonical total, ready, and missing shot state. The server
submits the resolver's one-per-shot selected clips to its existing job and maps
missing canonical shots to the existing precondition/partial behavior.

## TDD expectations

- Add the legacy ten-record/nine-shot component regression before changing UI.
- Add server proof before changing the mutation.
- Preserve normal unsplit behavior and existing partial-assembly errors.

## UI/UX Contract

- Target user/job: creator finishing a Sub-episode after all nine canonical
  shots have a rendered video.
- Surface inventory: existing readiness text, missing warning, full button,
  partial button.
- Component map: episode page derives state; workspace forwards; storyboard
  panel renders state.
- State matrix: 0 ready disables both/full as current behavior; some ready shows
  partial; all canonical ready enables full; compiled pending/failed/completed
  states are untouched.
- Responsive matrix: no layout or breakpoint changes.
- Accessibility: preserve semantic disabled buttons and readable warning text.
- Tokens: no new styling or raw visual values.
- Copy: retain existing Thai and English copy; only counts/list data changes.
- Browser evidence: authenticated route check preferred; focused RTL test is
  required baseline evidence.

## Acceptance checks

- UI legacy fixture displays canonical count and enabled full action.
- True missing canonical shot still disables full and lists the shot.
- Server accepts the UI-complete state and submits one selected clip per shot.
- No historical `motionPromptPack` write is introduced.
- Focused tests, package type check, and `git diff --check` pass.

## Coordination risks

The page and router contain unrelated uncommitted work. Apply narrow hunks,
inspect the final diff by path, and stage only task-owned paths/hunks.

## Implementation result

- The storyboard panel now derives canonical readiness directly from its raw
  storyboard, start-frame plan, and motion-prompt pack using the shared
  resolver; obsolete raw-count props were removed from workspace forwarding.
- `resolveClipsForAssembly` now uses canonical semantics for every caller,
  including clip-derived fallback when older episodes lack storyboard/frame
  metadata.
- The episode router passes its canonical artifact identities and submits only
  the resolver's deterministic one-per-shot selection.
- Added UI complete/missing regressions, server clip-derived and partial tests,
  and router submission wiring proof.
- Verification: 4 focused Vitest files passed (110 tests), `npm run check`
  passed, and independent re-review approved the final staged diff.
- Browser evidence was skipped because the reported route requires an
  authenticated production fixture; RTL verifies the affected label, warning,
  full-button, and partial-button states without changing layout or copy.
