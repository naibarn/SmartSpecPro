# Implementation Plan

## Objective

Make Sub-episode readiness and full assembly operate on canonical storyboard
shots rather than raw motion-prompt clip records, so legacy duplicate sub-shots
cannot inflate the total or block a complete nine-shot episode.

## Codebase fit

Add a pure shared module under `apps/web/shared/verticalDramaSeries/`. It will
accept lightweight clip identities, optional storyboard/start-frame shot
numbers, and return ordered expected, ready, missing, and selected clip data.
This module can be imported by both Vite client code and Node server code.

The episode page will replace its raw count calculation with the resolver result
and pass canonical ready/missing data into the existing panel. The panel retains
its current layout and copy but stops re-deriving missing shots from raw clips.
The server mutation will resolve the same canonical snapshot before submitting
the existing assembly job.

## Affected modules

- New shared resolver and focused unit test under
  `apps/web/shared/verticalDramaSeries/`.
- `apps/web/client/src/pages/VerticalDramaEpisodePage.tsx`.
- `apps/web/client/src/components/verticalDramaSeries/VerticalDramaStoryboardPanel.tsx`.
- Existing panel regression test for speaker/legacy sub-shots.
- `apps/web/server/routers/verticalDramaEpisodes.ts` and/or the assembly service
  adapter, depending on the narrowest integration seam found during TDD.
- Existing assembly service/router tests.

## Approach

1. Define small structural input types and pure identity/selection functions.
2. Write failing resolver tests for 9/9, legacy duplicates, true missing shot,
   deterministic selection, fallbacks, orphans, and variable shot counts.
3. Implement the resolver without Node/client dependencies.
4. Write a failing panel test showing ten records for nine canonical shots no
   longer disable full assembly.
5. Replace page/panel raw readiness props with canonical resolver output while
   preserving existing compiled-video states and localized copy.
6. Write a failing server assembly test proving legacy duplicates yield exactly
   one submitted completed clip per canonical shot.
7. Integrate the resolver after `loadOwnedEpisode`, preserving authorization and
   all render options.
8. Run focused tests, type checking, diff checks, and a browser-oriented UI
   verification if a usable local authenticated fixture is available.

## Acceptance criteria

- Canonical 9-shot episode with at least one completed candidate per shot shows
  `9/9` and enables full assembly.
- Ten historical records grouped into nine canonical shots do not inflate the
  total.
- A genuinely missing shot shows `8/9`, names the canonical shot, and blocks
  full assembly while allowing partial assembly.
- Server full assembly accepts the same state the UI marks complete and submits
  one deterministic clip per canonical shot.
- Variable shot counts work; no fixed-nine readiness constant exists.
- Historical records remain unchanged.
- Existing unrelated worktree changes remain intact.

## UI/UX contract

- Target user/job: vertical-series creator assembling the completed clips for
  one Sub-episode.
- Surface: existing compiled-video card only; no new component or layout.
- States: completed/pending/failed remain unchanged; incomplete uses canonical
  ready/total/missing state; complete enables primary assembly action.
- Responsive: existing wrapping and button behavior remain unchanged across
  mobile/tablet/desktop.
- Accessibility: existing button disabled semantics and status text remain;
  no color-only signal is introduced.
- Copy: retain current Thai/English localized strings and numeric placeholders.
- Browser evidence: verify displayed count, missing warning, and enabled state
  at the existing route when an authenticated local fixture is available;
  otherwise record focused component-test evidence and the environment blocker.

## Rollout

No migration is needed. The change is backward-compatible and takes effect on
the next client/server deployment. A rollback restores raw counting without
altering persisted episode data.
